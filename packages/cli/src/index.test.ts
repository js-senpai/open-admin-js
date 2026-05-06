import { describe, expect, it } from "vitest";
import { modelNameToResourceSlug } from "./resource-slug.js";

describe("openadminjs cli", () => {
  it("exposes resource slug helper used by generate resource", () => {
    expect(modelNameToResourceSlug("OrderItem")).toBe("order-item");
  });
});
