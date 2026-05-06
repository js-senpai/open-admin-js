import { describe, expect, it } from "vitest";
import { modelNameToResourceSlug } from "./resource-slug.js";

describe("modelNameToResourceSlug", () => {
  it("converts PascalCase to kebab-case", () => {
    expect(modelNameToResourceSlug("Post")).toBe("post");
    expect(modelNameToResourceSlug("OrderItem")).toBe("order-item");
    expect(modelNameToResourceSlug("BlogCategory")).toBe("blog-category");
  });
});
