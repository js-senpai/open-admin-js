import { describe, expect, it } from "vitest";
import { supportExampleResources } from "./index";

describe("supportExampleResources", () => {
  it("exports ticket resources", () => {
    expect(supportExampleResources.map((r) => r.name).sort()).toEqual(["ticket-messages", "tickets"]);
  });
});
