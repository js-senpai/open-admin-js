import { SetMetadata } from "@nestjs/common";

/** When set on a route/controller, JWT must have been issued for this `realm` (see `Role.realm`). */
export const AUTH_REALM_KEY = "openadminjs:authRealm";

export const RequireAuthRealm = (realm: string) => SetMetadata(AUTH_REALM_KEY, realm);
