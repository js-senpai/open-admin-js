export type Permission = `${string}.${string}`;

export type { LocalizedRoleLabel, RoleBlueprint } from "./blueprints";
export {
  DEFAULT_AUTH_REALM,
  expandRolePermissions,
  materializeAllRoles,
  realmOf,
  roleMatrixKey
} from "./blueprints";

export function can(permissions: readonly string[], permission: string): boolean {
  return permissions.includes(permission) || permissions.includes("*");
}

export function requirePermission(permissions: readonly string[], permission: string): void {
  if (!can(permissions, permission)) {
    const error = new Error(`Missing permission: ${permission}`);
    error.name = "ForbiddenError";
    throw error;
  }
}
