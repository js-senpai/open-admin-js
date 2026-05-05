import { describe, expect, it } from "vitest";
import { basicExampleResources } from "./index";

describe("basicExampleResources", () => {
  it("includes leads resource", () => {
    expect(basicExampleResources.map((r) => r.name)).toContain("leads");
  });
});
