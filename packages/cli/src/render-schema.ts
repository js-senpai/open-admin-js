import type { DatabaseDriver } from "./create-project.js";

/** SQLite (Prisma 6.2+) and MySQL support native JSON, but not scalar lists.
 * Transform only model field type tokens, never values, comments or relations.
 */
const SCALAR_TYPES = new Set(["String", "Boolean", "Int", "BigInt", "Float", "Decimal", "DateTime", "Bytes", "Json"]);
export function renderSchemaForProvider(schema: string, provider: DatabaseDriver): string {
  if (provider === "postgresql") return schema;
  let model = false;
  let blockComment = false;
  return schema.split(/(\r?\n)/).map(line => {
    if (/^\s*\/\*/.test(line)) blockComment = true;
    if (blockComment) {
      if (line.includes("*/")) blockComment = false;
      return line;
    }
    if (/^\s*(?:model|type)\s+\w+\s*\{/.test(line)) { model = true; return line; }
    if (/^\s*}\s*(?:\/\/.*)?$/.test(line)) { model = false; return line; }
    if (!model) return line;
    return line.replace(/^(\s*[A-Za-z_]\w*\s+)([A-Za-z_]\w*)\[\](?=\s|$)/, (match, prefix: string, type: string) =>
      SCALAR_TYPES.has(type) ? prefix + "Json" : match);
  }).join("");
}
export function schemaDatasourceProvider(schema: string): string | undefined {
  return schema.match(/datasource\s+\w+\s*\{[^}]*?provider\s*=\s*"([^"]+)"/m)?.[1];
}
