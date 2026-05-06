export { DEFAULT_AUTH_REALM, expandRolePermissions, materializeAllRoles, realmOf, roleMatrixKey } from "./blueprints";
export function can(permissions, permission) {
    return permissions.includes(permission) || permissions.includes("*");
}
export function requirePermission(permissions, permission) {
    if (!can(permissions, permission)) {
        const error = new Error(`Missing permission: ${permission}`);
        error.name = "ForbiddenError";
        throw error;
    }
}
