import { describe, expect, it } from "vitest";
import { can, requirePermission } from "./index";

describe("can", () => {
  it("allows explicit permission and wildcard", () => {
    expect(can(["posts.read"], "posts.read")).toBe(true);
    expect(can(["*"], "settings.update")).toBe(true);
  });

  it("denies missing permission", () => {
    expect(can(["posts.read"], "posts.update")).toBe(false);
    expect(can([], "posts.read")).toBe(false);
  });
});

describe("requirePermission", () => {
  it("throws when denied", () => {
    expect(() => requirePermission(["posts.read"], "posts.update")).toThrow("Missing permission");
  });

  it("throws ForbiddenError named errors", () => {
    try {
      requirePermission([], "any");
      expect.fail("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect((e as Error).name).toBe("ForbiddenError");
    }
  });

  it("no-ops when allowed", () => {
    expect(() => requirePermission(["a.b"], "a.b")).not.toThrow();
  });
});
