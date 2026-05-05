import { UnprocessableEntityException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { defineResource } from "@openadminjs/core";
import { parseWritePayload } from "./validate-resource-payload";

describe("parseWritePayload", () => {
  const widget = defineResource({
    name: "widgets",
    label: "Widgets",
    model: "Widget",
    permissions: { read: "w.read", create: "w.create", update: "w.update" },
    fields: {
      id: { type: "id", list: true },
      title: { type: "text", required: true, list: true },
      count: { type: "number", list: true },
      mode: { type: "select", options: ["a", "b"], list: true },
      published: { type: "boolean", required: true, list: true }
    }
  });

  it("accepts valid create payload", () => {
    const out = parseWritePayload(widget, "create", { title: "Hi", count: "3", mode: "a", published: true });
    expect(out.title).toBe("Hi");
    expect(out.count).toBe(3);
    expect(out.mode).toBe("a");
    expect(out.published).toBe(true);
  });

  it("rejects missing required field on create", () => {
    expect(() => parseWritePayload(widget, "create", { count: 1 })).toThrow(UnprocessableEntityException);
  });

  it("rejects missing required boolean on create (does not default to false)", () => {
    expect(() => parseWritePayload(widget, "create", { title: "x", count: 0, mode: "a" })).toThrow(
      UnprocessableEntityException
    );
  });

  it("rejects unknown keys (strict)", () => {
    expect(() =>
      parseWritePayload(widget, "create", { title: "x", mode: "a", published: false, extra: 1 })
    ).toThrow(UnprocessableEntityException);
  });
});
