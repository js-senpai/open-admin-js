import { describe, expect, it } from "vitest";
import { DEFAULT_AUTH_REALM, expandRolePermissions, materializeAllRoles, roleMatrixKey } from "./blueprints";

const slugs = ["a.read", "a.write", "b.read"] as const;

describe("expandRolePermissions", () => {
  it("merges inherits before local permissions", () => {
    const blueprints = [
      { name: "base", permissions: ["a.read"] },
      { name: "child", inherits: ["base"], permissions: ["a.write"] }
    ] as const;
    const perms = expandRolePermissions(blueprints, DEFAULT_AUTH_REALM, "child", slugs);
    expect(perms.has("a.read")).toBe(true);
    expect(perms.has("a.write")).toBe(true);
  });

  it("expands wildcard against catalog slugs", () => {
    const blueprints = [{ name: "root", permissions: ["*"] }] as const;
    const perms = expandRolePermissions(blueprints, DEFAULT_AUTH_REALM, "root", slugs);
    expect(perms.has("*")).toBe(true);
    expect(perms.has("a.read")).toBe(true);
    expect(perms.has("b.read")).toBe(true);
  });

  it("throws on circular inheritance", () => {
    const blueprints = [
      { name: "a", inherits: ["b"], permissions: [] },
      { name: "b", inherits: ["a"], permissions: [] }
    ] as const;
    expect(() => expandRolePermissions(blueprints, DEFAULT_AUTH_REALM, "a", slugs)).toThrow(/Circular/);
  });

  it("does not inherit across realms", () => {
    const blueprints = [
      { name: "base", realm: "admin", permissions: ["a.read"] },
      { name: "x", realm: "public", inherits: ["base"], permissions: ["a.write"] }
    ] as const;
    expect(() => expandRolePermissions(blueprints, "public", "x", slugs)).toThrow(/Unknown role blueprint/);
  });
});

describe("materializeAllRoles", () => {
  it("materializes every blueprint", () => {
    const blueprints = [
      { name: "v", permissions: ["a.read"] },
      { name: "e", inherits: ["v"], permissions: ["a.write"] }
    ] as const;
    const map = materializeAllRoles(blueprints, slugs);
    expect(map.get(roleMatrixKey(DEFAULT_AUTH_REALM, "v"))).toEqual(["a.read"]);
    expect([...(map.get(roleMatrixKey(DEFAULT_AUTH_REALM, "e")) ?? [])].sort()).toEqual(["a.read", "a.write"].sort());
  });

  it("keys public and admin roles separately", () => {
    const blueprints = [
      { name: "customer", realm: "public", permissions: ["x.read"] },
      { name: "customer", realm: "admin", permissions: ["y.read"] }
    ] as const;
    const map = materializeAllRoles(blueprints, ["x.read", "y.read"]);
    expect(map.get("public:customer")).toEqual(["x.read"]);
    expect(map.get("admin:customer")).toEqual(["y.read"]);
  });
});
