import { describe, expect, it } from "vitest";
import {
  assertInsideDir,
  InvalidNameError,
  toCamelCase,
  toKebabCase,
  toPascalCase,
  validateName,
  validatePluginId
} from "./validate-name.js";

describe("case conversion", () => {
  it("converts to PascalCase / camelCase / kebab-case", () => {
    expect(toPascalCase("order item")).toBe("OrderItem");
    expect(toPascalCase("order-item")).toBe("OrderItem");
    expect(toPascalCase("OrderItem")).toBe("OrderItem");
    expect(toCamelCase("order-item")).toBe("orderItem");
    expect(toKebabCase("OrderItem")).toBe("order-item");
    expect(toKebabCase("Order Item")).toBe("order-item");
  });
});

describe("validateName - rejects unsafe input", () => {
  const bad = [
    "../admin",
    "../../outside",
    "foo/bar",
    "foo\\bar",
    '"; process.exit()',
    "class",
    "CON",
    ".",
    "..",
    "",
    "   ",
    "/etc/passwd",
    "foo\0bar",
    "1name",
    "-name"
  ];
  for (const input of bad) {
    it(`rejects ${JSON.stringify(input)}`, () => {
      expect(() => validateName(input, "resource")).toThrow(InvalidNameError);
    });
  }
});

describe("validateName - accepts valid input", () => {
  for (const input of ["Post", "order-item", "order_item", "BlogPost", "user2"]) {
    it(`accepts ${JSON.stringify(input)}`, () => {
      expect(validateName(input, "resource")).toBe(input.trim());
    });
  }
});

describe("validatePluginId", () => {
  it("accepts reverse-DNS style ids", () => {
    expect(validatePluginId("com.example.my-plugin")).toBe("com.example.my-plugin");
    expect(validatePluginId("seo")).toBe("seo");
  });
  it("rejects traversal and injection attempts", () => {
    for (const bad of ["../evil", "a/../b", "foo/bar", "a..b", "$(x)", "a;b", ".hidden", "1abc"]) {
      expect(() => validatePluginId(bad), bad).toThrow(InvalidNameError);
    }
  });
});

describe("assertInsideDir", () => {
  it("allows paths inside the base directory", () => {
    expect(() => assertInsideDir("/tmp/proj", "apps/api/x.ts")).not.toThrow();
  });
  it("rejects traversal outside the base directory", () => {
    expect(() => assertInsideDir("/tmp/proj", "../../etc/passwd")).toThrow(InvalidNameError);
    expect(() => assertInsideDir("/tmp/proj", "/etc/passwd")).toThrow(InvalidNameError);
  });
});
