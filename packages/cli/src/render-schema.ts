import type { DatabaseDriver } from "./create-project.js";

/** Prisma scalar types that can appear as a scalar list (`Type[]`). */
const SCALAR_TYPES = ["String", "Boolean", "Int", "BigInt", "Float", "Decimal", "DateTime", "Bytes", "Json"];

const SCALAR_LIST_RE = new RegExp(`\\b(${SCALAR_TYPES.join("|")})\\[\\]`, "g");

/**
 * Transforms the (PostgreSQL-authored) Prisma schema so it is valid for the
 * selected database provider.
 *
 * PostgreSQL: returned unchanged.
 * MySQL: scalar lists (e.g. `String[]`) are unsupported, so they are stored as
 *        `Json` arrays instead. Relation lists (e.g. `Post[]`) are left intact
 *        because those reference models, not scalars.
 * SQLite: has neither scalar lists NOR a `Json` type. Both scalar lists and
 *        `Json`/`Json?` columns become `String`/`String?`; the API's PrismaService
 *        transparently JSON-encodes/decodes those columns at runtime for SQLite
 *        (see apps/api/src/common/json-field-codec.ts).
 */
export function renderSchemaForProvider(schema: string, provider: DatabaseDriver): string {
  if (provider === "postgresql") return schema;

  if (provider === "mysql") {
    // Only rewrite scalar lists; relation lists use capitalized model names that
    // are not in SCALAR_TYPES, so they never match.
    return schema.replace(SCALAR_LIST_RE, "Json");
  }

  if (provider === "sqlite") {
    // Scalar lists → String, then Json/Json? → String/String?.
    return schema.replace(SCALAR_LIST_RE, "String").replace(/\bJson\b/g, "String");
  }

  return schema;
}

/**
 * Returns the datasource provider currently declared in a Prisma schema string,
 * or undefined when it cannot be determined.
 */
export function schemaDatasourceProvider(schema: string): string | undefined {
  return schema.match(/datasource\s+\w+\s*\{[^}]*?provider\s*=\s*"([^"]+)"/m)?.[1];
}
