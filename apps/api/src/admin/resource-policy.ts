import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { isSensitiveField, shouldApplyListScope, listScopeWhereClause } from "@openadminjs/core";
import type { ResourceConfig } from "@openadminjs/core";
export type UserContext = { id: string; email?: string; permissions: string[] };
export function isOutOfListScope(resource: ResourceConfig, user: UserContext, record: unknown): boolean {
    if (resource.name === "settings" && String((record as Record<string, unknown>).key ?? "").toLowerCase().startsWith("ai.")) return true;
    if (!shouldApplyListScope(resource, user.permissions)) return false;
    const clause = listScopeWhereClause(resource, user.id);
    if (!clause) return false;
    const row = record as Record<string, unknown>;
    for (const [key, expected] of Object.entries(clause)) {
      if (row[key] !== expected) return true;
    }
    return false;
  }

export function has(user: UserContext, permission?: string) {
    return Boolean(permission && (user.permissions.includes(permission) || user.permissions.includes("*")));
  }

export function systemScope(resource: ResourceConfig) {
    return resource.name === "settings" ? { NOT: { key: { startsWith: "ai." } } } : undefined;
  }

export function canReadField(resource: ResourceConfig, name: string, user: UserContext) {
    const field = Object.hasOwn(resource.fields, name) ? resource.fields[name] : undefined;
    return Boolean(field && !isSensitiveField(name, field) && (!field.permissions?.read || has(user, field.permissions.read)));
  }

export function safeData(resource: ResourceConfig, data: Record<string, unknown>, mode: "create" | "edit", user: UserContext) {
    for (const name of Object.keys(data)) {
      const field = Object.hasOwn(resource.fields, name) ? resource.fields[name] : undefined;
      if (!field) throw new BadRequestException({ message: "Unknown field", code: "FIELD_UNKNOWN" });
      const permission = field.permissions?.[mode === "create" ? "create" : "update"];
      if (permission && !has(user, permission)) throw new ForbiddenException({ message: "Missing field permission", code: "FIELD_PERMISSION_DENIED" });
      if (field[mode] === false || isSensitiveField(name, field) || field.type === "id" || field.type === "computed") throw new ForbiddenException("Field is not writable");
    }
    if (resource.name === "settings" && "key" in data && String(data.key).toLowerCase().startsWith("ai.")) throw new ForbiddenException("Reserved setting");
    return { ...data };
  }

export function redact(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(item => redact(item));
    if (!value || typeof value !== "object" || value instanceof Date) return value;
    return Object.fromEntries(Object.entries(value).filter(([name]) => !isSensitiveField(name)).map(([name, item]) => [name, redact(item)]));
  }

export function auditSnapshot(resource: ResourceConfig, record: unknown) {
    if (!record || typeof record !== "object") return {};
    return redact(Object.fromEntries(Object.entries(record).filter(([name]) => {
      const field = resource.fields[name];
      return Object.hasOwn(resource.fields, name) && field && !isSensitiveField(name, field) && field.type !== "json";
    })));
  }

export function sanitizeRecord(resource: ResourceConfig, record: unknown, user: UserContext) {
    if (!record || typeof record !== "object") return record;
    const entries = Object.entries(record).filter(([name]) => canReadField(resource, name, user));
    // Historical snapshots may contain secrets and cannot reliably be sanitized retroactively.
    if (resource.name === "audit-logs") return Object.fromEntries(entries.filter(([name]) => name !== "before" && name !== "after"));
    if (resource.name === "settings" && String((record as Record<string, unknown>).key ?? "").toLowerCase().startsWith("ai.")) return {};
    return Object.fromEntries(entries);
  }

