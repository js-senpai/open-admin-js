import { describe, expect, it } from "vitest";
import { ecommerceExampleResources } from "./index";

describe("ecommerceExampleResources", () => {
  it("exports catalog resources", () => {
    expect(ecommerceExampleResources.map((r) => r.name).sort()).toEqual(["customers", "order-items", "orders", "products"]);
  });
});
