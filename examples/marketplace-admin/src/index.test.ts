import { describe, expect, it } from "vitest";
import { marketplaceExampleResources } from "./index";

describe("marketplaceExampleResources", () => {
  it("exports marketplace resources", () => {
    expect(marketplaceExampleResources.map((r) => r.name).sort()).toEqual(["listings", "payouts", "sellers"]);
  });
});
