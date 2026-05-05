import { describe, expect, it } from "vitest";
import { safeNextParam } from "./safe-next-param";

describe("login safeNextParam", () => {
  it("defaults to dashboard for empty values", () => {
    expect(safeNextParam(null)).toBe("/dashboard");
    expect(safeNextParam("")).toBe("/dashboard");
  });

  it("rejects protocol-relative values", () => {
    expect(safeNextParam("//evil.example")).toBe("/dashboard");
  });

  it("accepts internal paths", () => {
    expect(safeNextParam("/dashboard")).toBe("/dashboard");
    expect(safeNextParam("/resources/posts")).toBe("/resources/posts");
  });
});
