export const DEFAULT_AUTH_REALM = "admin";
export function realmOf(blueprint) {
    return blueprint.realm ?? DEFAULT_AUTH_REALM;
}
export function roleMatrixKey(realm, roleName) {
    return `${realm}:${roleName}`;
}
function collectRolePermissions(blueprints, realm, roleName, wildcardSlugs, stack, memo) {
    const memoKey = roleMatrixKey(realm, roleName);
    if (memo.has(memoKey))
        return new Set(memo.get(memoKey));
    if (stack.has(memoKey)) {
        throw new Error(`Circular role inheritance involving "${realm}:${roleName}"`);
    }
    const bp = blueprints.find((b) => b.name === roleName && realmOf(b) === realm);
    if (!bp) {
        throw new Error(`Unknown role blueprint: "${roleName}" in realm "${realm}"`);
    }
    stack.add(memoKey);
    const out = new Set();
    for (const parent of bp.inherits ?? []) {
        for (const p of collectRolePermissions(blueprints, realm, parent, wildcardSlugs, stack, memo)) {
            out.add(p);
        }
    }
    for (const p of bp.permissions ?? []) {
        if (p === "*") {
            out.add("*");
            for (const s of wildcardSlugs)
                out.add(s);
        }
        else {
            out.add(p);
        }
    }
    stack.delete(memoKey);
    memo.set(memoKey, out);
    return out;
}
/**
 * Resolves inherits + wildcard expansion within one realm.
 * When `slugsByRealm` is set, `"*"` expands only that realm's slug list (so admin superusers do not silently gain storefront-only slugs unless you assign them).
 */
export function expandRolePermissions(blueprints, realm, roleName, allPermissionSlugs, slugsByRealm) {
    const wildcardSlugs = slugsByRealm?.[realm] ?? allPermissionSlugs;
    return collectRolePermissions(blueprints, realm, roleName, wildcardSlugs, new Set(), new Map());
}
/** Every blueprint gets a frozen permission array keyed as `realm:roleName`. */
export function materializeAllRoles(blueprints, allPermissionSlugs, slugsByRealm) {
    const map = new Map();
    for (const bp of blueprints) {
        const r = realmOf(bp);
        const set = expandRolePermissions(blueprints, r, bp.name, allPermissionSlugs, slugsByRealm);
        map.set(roleMatrixKey(r, bp.name), [...set].sort());
    }
    return map;
}
