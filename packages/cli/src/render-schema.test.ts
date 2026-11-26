import { describe, expect, it } from "vitest";
import { renderSchemaForProvider, schemaDatasourceProvider } from "./render-schema.js";

const SAMPLE = `datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id    String @id @default(cuid())
  posts Post[]
}

model ApiToken {
  id     String   @id @default(cuid())
  scopes String[]
  tags   String[]
}

model AuditLog {
  id     String @id @default(cuid())
  before Json?
  after  Json?
}

model Post {
  id String @id @default(cuid())
}
`;

describe("renderSchemaForProvider", () => {
  it("returns the schema unchanged for postgresql", () => {
    expect(renderSchemaForProvider(SAMPLE, "postgresql")).toBe(SAMPLE);
  });

  it("converts scalar lists to Json for mysql but keeps relation lists", () => {
    const out = renderSchemaForProvider(SAMPLE, "mysql");
    expect(out).not.toContain("String[]");
    expect(out).toMatch(/scopes\s+Json/);
    expect(out).toMatch(/tags\s+Json/);
    // relation lists reference models, not scalars — must be preserved
    expect(out).toContain("posts Post[]");
  });

  it("uses native JSON for sqlite and keeps relation lists", () => {
    const out = renderSchemaForProvider(SAMPLE, "sqlite");
    expect(out).not.toContain("String[]");
    expect(out).toMatch(/scopes\s+Json/);
    expect(out).toMatch(/tags\s+Json/);
    expect(out).toMatch(/before\s+Json\?/);
    expect(out).toMatch(/after\s+Json\?/);
    expect(out).toContain("posts Post[]");
  });
});

describe("schema rendering preserves data", () => {
  it("preserves comments and string defaults for all providers", () => {
    const schema = 'model Sample {\n  label String @default("Json")\n  other String @default("String[]")\n  // tags String[]\n  value Json?\n  tags String[]\n}\n';
    for (const provider of ["sqlite", "mysql"] as const) {
      const out = renderSchemaForProvider(schema, provider);
      expect(out).toContain('@default("Json")');
      expect(out).toContain('@default("String[]")');
      expect(out).toContain("// tags String[]");
      expect(out).toContain("value Json?");
      expect(out).toContain("tags Json");
    }
  });
});

describe("schemaDatasourceProvider", () => {
  it("reads the datasource provider, not the generator provider", () => {
    const withGenerator = `generator client {\n  provider = "prisma-client-js"\n}\n\n${SAMPLE}`;
    expect(schemaDatasourceProvider(withGenerator)).toBe("postgresql");
  });
});
