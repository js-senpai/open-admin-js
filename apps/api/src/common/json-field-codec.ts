/**
 * SQLite has no native Json type. The CLI rewrites Json / scalar-list columns to
 * String when scaffolding for SQLite. This module JSON-encodes those columns on
 * write and JSON-decodes them on read so the rest of the API keeps working with
 * objects/arrays as on PostgreSQL/MySQL.
 *
 * On PostgreSQL and MySQL this module is a no-op (isSqliteDatabaseUrl is false).
 */

/** Prisma Client delegate name (camelCase) → fields stored as JSON text on SQLite. */
export const SQLITE_JSON_FIELDS: Readonly<Record<string, readonly string[]>> = {
  auditLog: ["before", "after"],
  setting: ["value"],
  apiToken: ["scopes"],
  jobLog: ["payload"],
  product: ["metadata"],
  order: ["metadata"],
  transaction: ["metadata"],
  webhookLog: ["payload"],
  aiMessage: ["meta"],
  aiArtifact: ["meta"]
};

export function isSqliteDatabaseUrl(url: string | undefined): boolean {
  return (url ?? "").trim().toLowerCase().startsWith("file:");
}

function jsonFieldsForModel(model: string): readonly string[] {
  return SQLITE_JSON_FIELDS[model] ?? [];
}

function encodeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function decodeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function encodeData(model: string, data: unknown): unknown {
  if (!data || typeof data !== "object" || Array.isArray(data)) return data;
  const fields = jsonFieldsForModel(model);
  if (!fields.length) return data;
  const copy = { ...(data as Record<string, unknown>) };
  for (const field of fields) {
    if (field in copy) copy[field] = encodeValue(copy[field]);
  }
  return copy;
}

function decodeRecord(model: string, record: unknown): unknown {
  if (!record || typeof record !== "object" || Array.isArray(record)) return record;
  const fields = jsonFieldsForModel(model);
  if (!fields.length) return record;
  const copy = { ...(record as Record<string, unknown>) };
  for (const field of fields) {
    if (field in copy) copy[field] = decodeValue(copy[field]);
  }
  return copy;
}

function decodeMany(model: string, records: unknown): unknown {
  if (!Array.isArray(records)) return records;
  return records.map((r) => decodeRecord(model, r));
}

type QueryArgs = { data?: unknown; create?: unknown; update?: unknown };

/** Encodes JSON fields inside Prisma write args (`data`, `create`, `update`). */
export function encodeWriteArgs(model: string, args: QueryArgs): QueryArgs {
  const next = { ...args };
  if (next.data !== undefined) next.data = encodeData(model, next.data);
  if (next.create !== undefined) next.create = encodeData(model, next.create);
  if (next.update !== undefined) next.update = encodeData(model, next.update);
  return next;
}

export function decodeReadResult(model: string, result: unknown): unknown {
  if (Array.isArray(result)) return decodeMany(model, result);
  return decodeRecord(model, result);
}

type PrismaQueryHook = {
  args: QueryArgs;
  query: (args: QueryArgs) => Promise<unknown>;
};

/** Prisma Client extension — only applied when DATABASE_URL is a SQLite file URL. */
export function sqliteJsonCodecExtension() {
  const queryConfig: Record<string, Record<string, (ctx: PrismaQueryHook) => Promise<unknown>>> = {};

  for (const model of Object.keys(SQLITE_JSON_FIELDS)) {
    queryConfig[model] = {
      async create({ args, query }) {
        const result = await query(encodeWriteArgs(model, args));
        return decodeRecord(model, result);
      },
      async createMany({ args, query }) {
        if (args.data && Array.isArray(args.data)) {
          return query({ ...args, data: args.data.map((row) => encodeData(model, row)) });
        }
        return query(args);
      },
      async update({ args, query }) {
        const result = await query(encodeWriteArgs(model, args));
        return decodeRecord(model, result);
      },
      async updateMany({ args, query }) {
        return query(encodeWriteArgs(model, args));
      },
      async upsert({ args, query }) {
        const result = await query(encodeWriteArgs(model, args));
        return decodeRecord(model, result);
      },
      async findUnique({ args, query }) {
        const result = await query(args);
        return decodeRecord(model, result);
      },
      async findFirst({ args, query }) {
        const result = await query(args);
        return decodeRecord(model, result);
      },
      async findMany({ args, query }) {
        const result = await query(args);
        return decodeMany(model, result);
      }
    };
  }

  return { name: "sqliteJsonCodec", query: queryConfig };
}
