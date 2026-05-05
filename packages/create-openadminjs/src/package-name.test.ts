import { describe, expect, it } from "vitest";
import { packageName } from "./package-name.js";

describe("packageName", () => {
  it("slugifies app names for npm package scope", () => {
    expect(packageName("My Cool App")).toBe("my-cool-app");
    expect(packageName("  SaaS_Dashboard  ")).toBe("saas-dashboard");
  });

  it("trims leading and trailing hyphens", () => {
    expect(packageName("---edge---")).toBe("edge");
  });
});
