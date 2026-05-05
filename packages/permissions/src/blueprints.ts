export type LocalizedRoleLabel = string | Record<string, string>;

export const DEFAULT_AUTH_REALM = "admin";

export type RoleBlueprint = {
  name: string;
  /** RBAC partition (admin UI vs storefront API, etc.). Inherits only resolve within the same realm. */
  realm?: string;
  label?: LocalizedRoleLabel;
  /** Other blueprint names to merge first (DAG; cycles throw) */
  inherits?: readonly string[];
  /** Permission slugs; "*" expands to every slug in `allSlugs` plus keeps literal "*" for super-admin checks */
  permissions?: readonly string[];
};

export function realmOf(blueprint: Pick<RoleBlueprint, "realm">): string {
  return blueprint.realm ?? DEFAULT_AUTH_REALM;
}

export function roleMatrixKey(realm: string, roleName: string): string {
  return `${realm}:${roleName}`;
}

function collectRolePermissions(
  blueprints: readonly RoleBlueprint[],
  realm: string,
  roleName: string,
  wildcardSlugs: readonly string[],
  stack: Set<string>,
  memo: Map<string, Set<string>>
): Set<string> {
  const memoKey = roleMatrixKey(realm, roleName);
  if (memo.has(memoKey)) return new Set(memo.get(memoKey)!);
  if (stack.has(memoKey)) {
    throw new Error(`Circular role inheritance involving "${realm}:${roleName}"`);
  }
  const bp = blueprints.find((b) => b.name === roleName && realmOf(b) === realm);
  if (!bp) {
    throw new Error(`Unknown role blueprint: "${roleName}" in realm "${realm}"`);
  }
  stack.add(memoKey);
  const out = new Set<string>();
  for (const parent of bp.inherits ?? []) {
    for (const p of collectRolePermissions(blueprints, realm, parent, wildcardSlugs, stack, memo)) {
      out.add(p);
    }
  }
  for (const p of bp.permissions ?? []) {
    if (p === "*") {
      out.add("*");
      for (const s of wildcardSlugs) out.add(s);
    } else {
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
export function expandRolePermissions(
  blueprints: readonly RoleBlueprint[],
  realm: string,
  roleName: string,
  allPermissionSlugs: readonly string[],
  slugsByRealm?: Record<string, readonly string[]>
): Set<string> {
  const wildcardSlugs = slugsByRealm?.[realm] ?? allPermissionSlugs;
  return collectRolePermissions(blueprints, realm, roleName, wildcardSlugs, new Set(), new Map());
}

/** Every blueprint gets a frozen permission array keyed as `realm:roleName`. */
export function materializeAllRoles(
  blueprints: readonly RoleBlueprint[],
  allPermissionSlugs: readonly string[],
  slugsByRealm?: Record<string, readonly string[]>
): Map<string, readonly string[]> {
  const map = new Map<string, readonly string[]>();
  for (const bp of blueprints) {
    const r = realmOf(bp);
    const set = expandRolePermissions(blueprints, r, bp.name, allPermissionSlugs, slugsByRealm);
    map.set(roleMatrixKey(r, bp.name), [...set].sort());
  }
  return map;
}
