import { describe, expect, it } from "vitest";
import {
  decodeReadResult,
  encodeWriteArgs,
  isSqliteDatabaseUrl,
  SQLITE_JSON_FIELDS
} from "./json-field-codec";

describe("isSqliteDatabaseUrl", () => {
  it("detects file: URLs", () => {
    expect(isSqliteDatabaseUrl("file:./dev.db")).toBe(true);
    expect(isSqliteDatabaseUrl("FILE:./data/app.sqlite")).toBe(true);
    expect(isSqliteDatabaseUrl("postgresql://localhost/db")).toBe(false);
    expect(isSqliteDatabaseUrl("mysql://localhost/db")).toBe(false);
  });
});

describe("encodeWriteArgs / decodeReadResult", () => {
  it("round-trips Json-like fields for AuditLog", () => {
    const payload = { title: "Hello", count: 2 };
    const encoded = encodeWriteArgs("AuditLog", {
      data: { action: "update", before: payload, after: { ...payload, count: 3 } }
    });
    expect(encoded.data).toMatchObject({
      action: "update",
      before: JSON.stringify(payload),
      after: JSON.stringify({ ...payload, count: 3 })
    });

    const decoded = decodeReadResult("AuditLog", {
      id: "1",
      action: "update",
      before: JSON.stringify(payload),
      after: JSON.stringify({ ...payload, count: 3 })
    }) as Record<string, unknown>;
    expect(decoded.before).toEqual(payload);
    expect(decoded.after).toEqual({ ...payload, count: 3 });
  });

  it("round-trips scopes array for ApiToken", () => {
    const scopes = ["posts.read", "users.read"];
    const encoded = encodeWriteArgs("ApiToken", { data: { name: "t", scopes } });
    expect((encoded.data as Record<string, unknown>).scopes).toBe(JSON.stringify(scopes));

    const decoded = decodeReadResult("ApiToken", {
      id: "1",
      name: "t",
      scopes: JSON.stringify(scopes)
    }) as Record<string, unknown>;
    expect(decoded.scopes).toEqual(scopes);
  });

  it("leaves non-codec models unchanged", () => {
    const data = { email: "a@b.dev", passwordHash: "x" };
    expect(encodeWriteArgs("User", { data }).data).toEqual(data);
    expect(decodeReadResult("User", data)).toEqual(data);
  });

  it("covers every model listed in SQLITE_JSON_FIELDS", () => {
    expect(Object.keys(SQLITE_JSON_FIELDS).length).toBeGreaterThan(0);
    for (const [model, fields] of Object.entries(SQLITE_JSON_FIELDS)) {
      const sample = Object.fromEntries(fields.map((f) => [f, { k: f }]));
      const encoded = encodeWriteArgs(model, { data: sample });
      for (const field of fields) {
        expect(typeof (encoded.data as Record<string, unknown>)[field]).toBe("string");
      }
      const decoded = decodeReadResult(model, {
        id: "x",
        ...Object.fromEntries(fields.map((f) => [f, JSON.stringify({ k: f })]))
      }) as Record<string, unknown>;
      for (const field of fields) {
        expect(decoded[field]).toEqual({ k: field });
      }
    }
  });
});
