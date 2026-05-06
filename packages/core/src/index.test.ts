import { describe, expect, it } from "vitest";
import { defineResource, validateResource } from "./index";

describe("@openadminjs/core", () => {
  it("re-exports defineResource from resource layer", () => {
    const r = defineResource({
      name: "items",
      label: "Items",
      model: "Item",
      permissions: { read: "items.read" },
      fields: { id: { type: "id" } }
    });
    expect(r.name).toBe("items");
  });

  it("re-exports validateResource", () => {
    expect(() =>
      validateResource({
        name: "bad name",
        label: "X",
        model: "X",
        permissions: { read: "x.read" },
        fields: { id: { type: "id" } }
      })
    ).toThrow("Invalid resource name");
  });
});
