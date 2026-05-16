import { UseGuards } from "@nestjs/common";
import { Args, Context, Int, Query, Resolver } from "@nestjs/graphql";
import { GraphQLJSON } from "graphql-scalars";
import { AdminResourceService } from "../admin/admin-resource.service";
import { AuthGuard } from "../common/auth.guard";
import type { RequestUser } from "../common/auth.guard";
import { RequireAuthRealm } from "../common/auth-realm.decorator";
import { resources } from "../resources/registry";

type GqlAuthContext = { req: { user: RequestUser } };

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
  adminRegisteredResourceNames(@Context() ctx: GqlAuthContext): string[] {
    const user = ctx.req.user;
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
    @Args("page", { type: () => Int, nullable: true, defaultValue: 1 }) page: number,
    @Args("limit", { type: () => Int, nullable: true, defaultValue: 20 }) limit: number,
    @Args("search", { type: () => String, nullable: true }) search: string | undefined,
    @Args("sort", { type: () => String, nullable: true }) sort: string | undefined,
    @Args("locale", { type: () => String, nullable: true }) locale: string | undefined,
    @Args("filter", { type: () => GraphQLJSON, nullable: true }) filter: unknown | undefined,
    @Context() ctx: GqlAuthContext
  ) {
    const query: Record<string, unknown> = { page, limit, ...this.flattenFilters(filter) };
    if (search) query.search = search;
    if (sort) query.sort = sort;
    if (locale) query.locale = locale;
    return this.adminResources.list(name, query, ctx.req.user);
  }

  @Query(() => GraphQLJSON, { name: "adminResourceRecord" })
  adminResourceRecord(@Args("name") name: string, @Args("id") id: string, @Context() ctx: GqlAuthContext) {
    return this.adminResources.get(name, id, ctx.req.user);
  }
}
