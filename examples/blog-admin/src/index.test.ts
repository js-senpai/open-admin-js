import { describe, expect, it } from "vitest";
import { blogExampleResources } from "./index";

describe("blogExampleResources", () => {
  it("includes authors and tags", () => {
    expect(blogExampleResources.map((r) => r.name).sort()).toEqual(["authors", "tags"]);
  });
});
