import { SetMetadata } from "@nestjs/common";

export const REQUIRE_PERMISSION = "requirePermission";
export const REQUIRE_ROLE = "requireRole";

export const RequirePermission = (permission: string) => SetMetadata(REQUIRE_PERMISSION, permission);
export const RequireRole = (role: string) => SetMetadata(REQUIRE_ROLE, role);
