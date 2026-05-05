import { describe, expect, it } from "vitest";
import { brandColors } from "./index";

describe("brandColors", () => {
  it("uses hex palette", () => {
    expect(brandColors.primary).toMatch(/^#/);
    expect(brandColors.accent).toMatch(/^#/);
  });
});
