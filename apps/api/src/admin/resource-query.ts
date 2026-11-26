import { BadRequestException } from "@nestjs/common";
import type { ResourceConfig, ResourceField } from "@openadminjs/core";
import { canReadField, type UserContext } from "./resource-policy";
export function buildWhere(resource: ResourceConfig, query: Record<string, unknown>, user: UserContext) {
    const clauses: Record<string, unknown>[] = [];
    if (query.search) {
      const searchable = Object.entries(resource.fields).filter(([name, field]) => field.searchable && canReadField(resource, name, user));
      clauses.push({ OR: searchable.map(([field]) => ({ [field]: { contains: String(query.search), ...(/^(postgres|postgresql):/.test(process.env.DATABASE_URL ?? "postgresql:") ? { mode: "insensitive" } : {}) } })) });
    }
    for (const [key, value] of Object.entries(query)) {
      const opMatch = key.match(/^filter\[([^\]]+)]\[(\w+)]$/);
      if (opMatch?.[1] && opMatch[2]) {
        const clause = buildOperatorClause(resource, opMatch[1], opMatch[2], value, user);
        if (clause) clauses.push(clause);
        continue;
      }
      const legacy = key.match(/^filter\[([^\]]+)]$/);
      if (legacy?.[1]) {
        const clause = buildOperatorClause(resource, legacy[1], "eq", value, user);
        if (clause) clauses.push(clause);
      }
    }
    return clauses.length ? { AND: clauses } : undefined;
  }

export function buildOperatorClause(resource: ResourceConfig, fieldName: string, op: string, raw: unknown, user: UserContext): Record<string, unknown> | null {
    const field = resource.fields[fieldName];
    if (!field?.filterable || !canReadField(resource, fieldName, user)) {
      throw new BadRequestException({ message: `Field "${fieldName}" is not filterable`, code: "FILTER_NOT_ALLOWED" });
    }
    const str = raw == null ? "" : String(raw);
    switch (op) {
      case "eq":
        return { [fieldName]: coerceFilterScalar(field, str) };
      case "ne":
        return { [fieldName]: { not: coerceFilterScalar(field, str) } };
      case "in": {
        const parts = str
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .map((p) => coerceFilterScalar(field, p));
        return { [fieldName]: { in: parts } };
      }
      case "gt":
        return { [fieldName]: { gt: coerceFilterComparable(field, str) } };
      case "gte":
        return { [fieldName]: { gte: coerceFilterComparable(field, str) } };
      case "lt":
        return { [fieldName]: { lt: coerceFilterComparable(field, str) } };
      case "lte":
        return { [fieldName]: { lte: coerceFilterComparable(field, str) } };
      case "contains": {
        if (!isStringFilterField(field)) {
          throw new BadRequestException({ message: `Operator "contains" is only for string-like fields`, code: "FILTER_OP_INVALID" });
        }
        return { [fieldName]: { contains: str, ...(/^(postgres|postgresql):/.test(process.env.DATABASE_URL ?? "postgresql:") ? { mode: "insensitive" } : {}) } };
      }
      default:
        throw new BadRequestException({ message: `Unknown filter operator "${op}"`, code: "FILTER_OP_UNKNOWN" });
    }
  }

export function isStringFilterField(field: ResourceField): boolean {
    return ["text", "textarea", "email", "url", "slug", "markdown", "code", "richtext", "badge", "select"].includes(field.type);
  }

export function coerceFilterScalar(field: ResourceField, value: string): string | number | boolean {
    if (field.type === "number" || field.type === "money") {
      const n = Number(value);
      if (!Number.isFinite(n) || !value.trim()) {
        throw new BadRequestException({ message: `Invalid number for filter`, code: "FILTER_VALUE_INVALID" });
      }
      return n;
    }
    if (field.type === "boolean") { if (!["true","false","1","0"].includes(value)) throw new BadRequestException("Invalid boolean"); return value === "true" || value === "1"; }
    return value;
  }

export function coerceFilterComparable(field: ResourceField, value: string): Date | number | string | boolean {
    if (field.type === "datetime" || field.type === "date") {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) {
        throw new BadRequestException({ message: `Invalid date for filter`, code: "FILTER_VALUE_INVALID" });
      }
      return d;
    }
    return coerceFilterScalar(field, value);
  }

export function buildOrderBy(resource: ResourceConfig, sort: string, user: UserContext) {
    const [field, dirRaw] = sort.split(":");
    const direction = dirRaw === "asc" ? "asc" : "desc";
    const candidate = field ? resource.fields[field] : undefined;
    if (field && candidate?.sortable && canReadField(resource, field, user)) {
      return { [field]: direction };
    }
    if (resource.fields.createdAt?.sortable && canReadField(resource, "createdAt", user)) {
      return { createdAt: direction };
    }
    return undefined;
  }

