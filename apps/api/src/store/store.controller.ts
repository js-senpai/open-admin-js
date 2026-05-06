import { Controller, Get, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../common/auth.guard";
import { RequireAuthRealm } from "../common/auth-realm.decorator";
import { CurrentUser } from "../common/current-user.decorator";
import type { RequestUser } from "../common/auth.guard";

/**
 * Example storefront-scoped routes (`Role.realm === "public"`).
 * Add cart/checkout/etc. here or in a dedicated app — checks are the same: JWT realm + permission slugs.
 */
@Controller("store")
@UseGuards(AuthGuard)
@RequireAuthRealm("public")
export class StoreController {
  @Get("session")
  session(@CurrentUser() user: RequestUser) {
    return {
      realm: user.realm,
      id: user.id,
      email: user.email,
      name: user.name,
      roles: user.roles,
      permissions: user.permissions
    };
  }
}
