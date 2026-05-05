import { describe, expect, it } from "vitest";
import { CaslAbilityFactory } from "./casl-ability.factory";

describe("CaslAbilityFactory", () => {
  const factory = new CaslAbilityFactory();

  it("maps dotted permissions to CASL rules", () => {
    const ability = factory.createForUser({ permissions: ["posts.read", "users.update"] });
    expect(ability.can("read", "posts")).toBe(true);
    expect(ability.can("update", "users")).toBe(true);
    expect(ability.can("delete", "posts")).toBe(false);
  });

  it("uses the last dot for namespaced slugs", () => {
    const ability = factory.createForUser({ permissions: ["public.orders.read_own"] });
    expect(ability.can("manage", "public.orders")).toBe(true);
  });

  it("grants manage all for star permission", () => {
    const ability = factory.createForUser({ permissions: ["*"] });
    expect(ability.can("manage", "all")).toBe(true);
  });

  it("maps unknown actions to manage", () => {
    const ability = factory.createForUser({ permissions: ["reports.export"] });
    expect(ability.can("manage", "reports")).toBe(true);
  });

  it("ignores malformed permission strings", () => {
    const ability = factory.createForUser({ permissions: ["noparts", ".", "ok.read"] });
    expect(ability.can("read", "ok")).toBe(true);
  });
});
