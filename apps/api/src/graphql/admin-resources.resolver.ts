import { UseGuards } from "@nestjs/common";
import { Args, Context, Query, Resolver } from "@nestjs/graphql";
import { GraphQLJSON } from "graphql-scalars";
import { AdminResourceService } from "../admin/admin-resource.service";
import { AuthGuard } from "../common/auth.guard";
import type { RequestUser } from "../common/auth.guard";
import { RequireAuthRealm } from "../common/auth-realm.decorator";
import { resources } from "../resources/registry";
import { AdminResourceListArgs, AdminResourceRecordArgs } from "./admin-resources.args";
import { ensureGqlParamTypes } from "./ensure-gql-paramtypes";

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
  adminResourceList(@Args() args: AdminResourceListArgs, @Context() ctx: GqlAuthContext) {
    const { name, page = 1, limit = 20, search, sort, locale, filter } = args;
    const query: Record<string, unknown> = { page, limit, ...this.flattenFilters(filter) };
    if (search) query.search = search;
    if (sort) query.sort = sort;
    if (locale) query.locale = locale;
    return this.adminResources.list(name, query, ctx.req.user);
  }

  @Query(() => GraphQLJSON, { name: "adminResourceRecord" })
  adminResourceRecord(@Args() args: AdminResourceRecordArgs, @Context() ctx: GqlAuthContext) {
    return this.adminResources.get(args.name, args.id, ctx.req.user);
  }
}

ensureGqlParamTypes(AdminResourcesResolver.prototype, "adminRegisteredResourceNames", [Object]);
ensureGqlParamTypes(AdminResourcesResolver.prototype, "adminResourceList", [AdminResourceListArgs, Object]);
ensureGqlParamTypes(AdminResourcesResolver.prototype, "adminResourceRecord", [AdminResourceRecordArgs, Object]);
