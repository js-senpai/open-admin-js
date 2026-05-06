import { describe, expect, it } from "vitest";
import type { OpenAdminPlugin } from "./index";

describe("plugin-sdk", () => {
  it("OpenAdminPlugin shape is structural", () => {
    const p: OpenAdminPlugin = {
      id: "test",
      version: "0.0.0",
      register() {}
    };
    expect(p.id).toBe("test");
  });
});
