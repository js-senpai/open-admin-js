import { describe, expect, it } from "vitest";
import {
  generateSecret,
  inspectPassword,
  inspectSecret,
  isWeakSecret,
  MIN_SECRET_LENGTH,
  shannonEntropyBits
} from "./secrets.js";

describe("generateSecret", () => {
  it("produces high-entropy, sufficiently long, unique secrets", () => {
    const a = generateSecret();
    const b = generateSecret();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(MIN_SECRET_LENGTH);
    expect(isWeakSecret(a)).toBe(false);
    expect(shannonEntropyBits(a)).toBeGreaterThan(64);
  });

  it("is URL-safe base64 (no +, /, =)", () => {
    expect(generateSecret()).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("inspectSecret", () => {
  it("flags empty, placeholder, short and low-entropy secrets", () => {
    expect(inspectSecret("").weak).toBe(true);
    expect(inspectSecret("change-me-to-a-long-random-secret").weak).toBe(true);
    expect(inspectSecret("secret").weak).toBe(true);
    expect(inspectSecret("short").weak).toBe(true);
    expect(inspectSecret("a".repeat(40)).weak).toBe(true);
  });

  it("accepts a real generated secret", () => {
    expect(inspectSecret(generateSecret()).weak).toBe(false);
  });
});

describe("inspectPassword", () => {
  it("rejects common passwords and short values", () => {
    for (const p of ["admin", "password", "123456", "changeme"]) {
      expect(inspectPassword(p).weak).toBe(true);
    }
    expect(inspectPassword("short").weak).toBe(true);
    expect(inspectPassword("a-good-enough-passphrase").weak).toBe(false);
  });
});
