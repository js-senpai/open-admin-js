import { UseGuards } from "@nestjs/common";
import { Args, Int, Query, Resolver } from "@nestjs/graphql";
import { GraphQLJSON } from "graphql-scalars";
import { AdminResourceService } from "../admin/admin-resource.service";
import { AuthGuard } from "../common/auth.guard";
import type { RequestUser } from "../common/auth.guard";
import { RequireAuthRealm } from "../common/auth-realm.decorator";
import { CurrentUser } from "../common/current-user.decorator";
import { resources } from "../resources/registry";

@Resolver()
@UseGuards(AuthGuard)
@RequireAuthRealm("admin")
export class AdminResourcesResolver {
  constructor(private readonly adminResources: AdminResourceService) {}

  private flattenFilters(input: unknown): Record<string, unknown> {
    if (!input || typeof input !== "object" || Array.isArray(input)) return {};
    const out: Record<string, unknown> = {};
    for (const [field, raw] of Object.entries(input as Record<string, unknown>)) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        out[`filter[${field}]`] = raw;
        continue;
      }
      for (const [op, val] of Object.entries(raw as Record<string, unknown>)) {
        out[`filter[${field}][${op}]`] = val;
      }
    }
    return out;
  }

  @Query(() => [String], { name: "adminRegisteredResourceNames" })
  adminRegisteredResourceNames(@CurrentUser() user: RequestUser): string[] {
    return resources
      .filter(
        (r) =>
          Boolean(r.permissions.read) &&
          (user.permissions.includes("*") || user.permissions.includes(r.permissions.read!))
      )
      .map((r) => r.name);
  }

  @Query(() => GraphQLJSON, { name: "adminResourceList", description: "Paginated list (same rules as REST /admin/resources/:name)" })
  adminResourceList(
    @Args("name") name: string,
    @CurrentUser() user: RequestUser,
    @Args("page", { type: () => Int, nullable: true, defaultValue: 1 }) page: number,
    @Args("limit", { type: () => Int, nullable: true, defaultValue: 20 }) limit: number,
    @Args("search", { nullable: true }) search?: string,
    @Args("sort", { nullable: true }) sort?: string,
    @Args("locale", { nullable: true }) locale?: string,
    @Args("filter", { type: () => GraphQLJSON, nullable: true }) filter?: Record<string, unknown>
  ) {
    const query: Record<string, unknown> = { page, limit, ...this.flattenFilters(filter) };
    if (search) query.search = search;
    if (sort) query.sort = sort;
    if (locale) query.locale = locale;
    return this.adminResources.list(name, query, user);
  }

  @Query(() => GraphQLJSON, { name: "adminResourceRecord" })
  adminResourceRecord(@Args("name") name: string, @Args("id") id: string, @CurrentUser() user: RequestUser) {
    return this.adminResources.get(name, id, user);
  }
}
