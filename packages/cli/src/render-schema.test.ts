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
});

describe("schemaDatasourceProvider", () => {
  it("reads the datasource provider, not the generator provider", () => {
    const withGenerator = `generator client {\n  provider = "prisma-client-js"\n}\n\n${SAMPLE}`;
    expect(schemaDatasourceProvider(withGenerator)).toBe("postgresql");
  });
});
