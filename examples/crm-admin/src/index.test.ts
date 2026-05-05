import { describe, expect, it } from "vitest";
import { crmExampleResources } from "./index";

describe("crmExampleResources", () => {
  it("exports four CRM resources", () => {
    expect(crmExampleResources).toHaveLength(4);
    expect(crmExampleResources.map((r) => r.name).sort()).toEqual(["activities", "companies", "contacts", "deals"]);
  });
});
