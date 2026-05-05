import { describe, expect, it } from "vitest";
import { defaultFileValidation } from "./index";

describe("defaultFileValidation", () => {
  it("defines sensible defaults", () => {
    expect(defaultFileValidation.maxSizeBytes).toBe(10 * 1024 * 1024);
    expect(defaultFileValidation.mimeTypes).toContain("image/png");
    expect(defaultFileValidation.extensions).toContain(".pdf");
  });
});
