import { describe, expect, it } from "vitest";
import { createProject, databaseUrl, defaultTemplateDir, modelNameToResourceSlug } from "./index.js";

describe("openadminjs package exports", () => {
  it("exposes createProject and helpers from the main entry", () => {
    expect(typeof createProject).toBe("function");
    expect(typeof databaseUrl).toBe("function");
    expect(typeof defaultTemplateDir).toBe("function");
    expect(modelNameToResourceSlug("OrderItem")).toBe("order-item");
    expect(databaseUrl("shop", "sqlite")).toBe("file:./dev.db");
  });
});
