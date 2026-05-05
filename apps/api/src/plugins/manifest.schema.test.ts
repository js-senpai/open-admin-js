import { describe, expect, it } from "vitest";
import { pluginManifestSchema } from "./manifest.schema";

describe("pluginManifestSchema", () => {
  it("accepts bundled-only entry", () => {
    const r = pluginManifestSchema.safeParse({
      version: 1,
      plugins: [{ id: "a.b", bundled: "hello", enabled: true, config: { x: 1 } }]
    });
    expect(r.success).toBe(true);
  });

  it("rejects both bundled and package", () => {
    const r = pluginManifestSchema.safeParse({
      version: 1,
      plugins: [{ id: "x", bundled: "hello", package: "@x/y" }]
    });
    expect(r.success).toBe(false);
  });

  it("rejects neither bundled nor package", () => {
    const r = pluginManifestSchema.safeParse({
      version: 1,
      plugins: [{ id: "x" }]
    });
    expect(r.success).toBe(false);
  });
});
