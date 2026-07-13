import { afterEach, describe, expect, it } from "vitest";
import { isSqliteDatabaseUrl } from "./json-field-codec";

describe("PrismaService SQLite wiring", () => {
  const original = process.env.DATABASE_URL;

  afterEach(() => {
    if (original === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original;
  });

  it("detects SQLite from DATABASE_URL (used by PrismaService constructor)", () => {
    process.env.DATABASE_URL = "file:./dev.db";
    expect(isSqliteDatabaseUrl(process.env.DATABASE_URL)).toBe(true);

    process.env.DATABASE_URL = "postgresql://localhost/db";
    expect(isSqliteDatabaseUrl(process.env.DATABASE_URL)).toBe(false);
  });
});
