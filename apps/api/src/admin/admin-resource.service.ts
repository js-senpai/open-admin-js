import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { ResourceConfig, ResourceField } from "@openadminjs/core";
import {
  listScopeWhereClause,
  mergeWhereClauses,
  resolveResourceForLocale,
  shouldApplyListScope
} from "@openadminjs/core";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { PrismaService } from "../common/prisma.service";
import { getResource, resources } from "../resources/registry";
import {
  runAfterCreate,
  runAfterDelete,
  runAfterUpdate,
  runBeforeCreate,
  runBeforeDelete,
  runBeforeUpdate
} from "../resources/resource-hooks.runner";
import { parseWritePayload } from "./validate-resource-payload";

type UserContext = { id: string; email?: string; permissions: string[] };
type PrismaDelegate = {
  findMany(args?: unknown): Promise<unknown[]>;
  count(args?: unknown): Promise<number>;
  findUnique(args: unknown): Promise<unknown | null>;
  create(args: unknown): Promise<unknown>;
  update(args: unknown): Promise<unknown>;
  delete(args: unknown): Promise<unknown>;
};

@Injectable()
export class AdminResourceService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  listResources(user: UserContext, locale?: string) {
    return resources
      .filter((resource) => this.has(user, resource.permissions.read))
      .map((resource) => {
        const view = resolveResourceForLocale(resource, locale);
        return {
          name: view.name,
          label: view.label,
          icon: view.icon,
          titleField: view.titleField,
          permissions: view.permissions,
          fields: view.fields,
          actions: view.actions,
          i18n: view.i18n,
          seo: view.seo
        };
      });
  }

  async list(name: string, query: Record<string, unknown>, user: UserContext) {
    const resource = this.authorizedResource(name, user, "read");
    const delegate = this.delegate(resource);
    const page = Number(query.page ?? 1);
    const limit = Math.min(Number(query.limit ?? 20), 100);
    const baseWhere = this.buildWhere(resource, query);
    const scope = shouldApplyListScope(resource, user.permissions) ? listScopeWhereClause(resource, user.id) : undefined;
    const where = mergeWhereClauses(baseWhere, scope);
    const orderBy = this.buildOrderBy(resource, String(query.sort ?? "createdAt:desc"));
    const [data, total] = await Promise.all([
      delegate.findMany({ where, orderBy, skip: (page - 1) * limit, take: limit }),
      delegate.count({ where })
    ]);
    return { data: data.map((row) => this.sanitizeRecord(resource, row)), meta: { page, limit, total, pages: Math.ceil(total / limit) || 1 } };
  }

  async get(name: string, id: string, user: UserContext) {
    const resource = this.authorizedResource(name, user, "read");
    const record = await this.delegate(resource).findUnique({ where: { id } });
    if (!record) throw new NotFoundException({ message: "Record not found", code: "NOT_FOUND" });
    if (this.isOutOfListScope(resource, user, record)) {
      throw new NotFoundException({ message: "Record not found", code: "NOT_FOUND" });
    }
    return this.sanitizeRecord(resource, record);
  }

  async create(name: string, data: Record<string, unknown>, user: UserContext) {
    const resource = this.authorizedResource(name, user, "create");

    if (name === "api-tokens") {
      const rawToken = randomBytes(32).toString("base64url");
      const scopes = this.normalizeScopes(data.scopes);
      const record = await this.prisma.$transaction(async (tx) => {
        const txDelegate = (tx as unknown as Record<string, PrismaDelegate>)[resource.model];
        if (!txDelegate) throw new NotFoundException({ message: "Prisma model not found", code: "MODEL_NOT_FOUND" });
        const created = await txDelegate.create({
          data: {
            name: String(data.name ?? "Token"),
            scopes,
            userId: user.id,
            tokenHash: await bcrypt.hash(rawToken, 12)
          }
        });
        const safeRecord = this.sanitizeRecord(resource, created) as Record<string, unknown>;
        await tx.auditLog.create({
          data: { userId: user.id, resource: name, resourceId: (created as { id?: string }).id, action: "create", before: Prisma.JsonNull, after: safeRecord as object }
        });
        return created;
      });
      const safeRecord = this.sanitizeRecord(resource, record) as Record<string, unknown>;
      return { ...safeRecord, plainToken: rawToken };
    }

    const payload = this.safeData(resource, data, "create");
    if (name === "notifications") payload.userId = String(data.userId ?? user.id);
    const hookUser = { id: user.id, email: user.email ?? "", permissions: user.permissions };
    await runBeforeCreate(name, resource, hookUser, this.prisma, payload);
    const validated = parseWritePayload(resource, "create", payload);

    const record = await this.prisma.$transaction(async (tx) => {
      const txDelegate = (tx as unknown as Record<string, PrismaDelegate>)[resource.model];
      if (!txDelegate) throw new NotFoundException({ message: "Prisma model not found", code: "MODEL_NOT_FOUND" });
      const created = await txDelegate.create({ data: validated });
      await tx.auditLog.create({
        data: { userId: user.id, resource: name, resourceId: (created as { id?: string }).id, action: "create", before: Prisma.JsonNull, after: created as object }
      });
      return created;
    });

    await runAfterCreate(name, resource, hookUser, this.prisma, payload, record);
    return this.sanitizeRecord(resource, record);
  }

  async update(name: string, id: string, data: Record<string, unknown>, user: UserContext) {
    const resource = this.authorizedResource(name, user, "update");
    const delegate = this.delegate(resource);
    const before = await delegate.findUnique({ where: { id } });
    if (!before) throw new NotFoundException({ message: "Record not found", code: "NOT_FOUND" });
    if (this.isOutOfListScope(resource, user, before)) {
      throw new NotFoundException({ message: "Record not found", code: "NOT_FOUND" });
    }
    const payload = this.safeData(resource, data, "edit");
    const hookUser = { id: user.id, email: user.email ?? "", permissions: user.permissions };
    await runBeforeUpdate(name, resource, hookUser, this.prisma, id, payload);
    const validated = parseWritePayload(resource, "edit", payload);

    const record = await this.prisma.$transaction(async (tx) => {
      const txDelegate = (tx as unknown as Record<string, PrismaDelegate>)[resource.model];
      if (!txDelegate) throw new NotFoundException({ message: "Prisma model not found", code: "MODEL_NOT_FOUND" });
      const updated = await txDelegate.update({ where: { id }, data: validated });
      await tx.auditLog.create({
        data: { userId: user.id, resource: name, resourceId: id, action: "update", before: before as object, after: updated as object }
      });
      return updated;
    });

    await runAfterUpdate(name, resource, hookUser, this.prisma, id, payload, before, record);
    return this.sanitizeRecord(resource, record);
  }

  async delete(name: string, id: string, user: UserContext) {
    const resource = this.authorizedResource(name, user, "delete");
    const delegate = this.delegate(resource);
    const before = await delegate.findUnique({ where: { id } });
    if (!before) throw new NotFoundException({ message: "Record not found", code: "NOT_FOUND" });
    if (this.isOutOfListScope(resource, user, before)) {
      throw new NotFoundException({ message: "Record not found", code: "NOT_FOUND" });
    }
    const hookUser = { id: user.id, email: user.email ?? "", permissions: user.permissions };
    await runBeforeDelete(name, resource, hookUser, this.prisma, id);

    await this.prisma.$transaction(async (tx) => {
      const txDelegate = (tx as unknown as Record<string, PrismaDelegate>)[resource.model];
      if (!txDelegate) throw new NotFoundException({ message: "Prisma model not found", code: "MODEL_NOT_FOUND" });
      await txDelegate.delete({ where: { id } });
      await tx.auditLog.create({
        data: { userId: user.id, resource: name, resourceId: id, action: "delete", before: before as object, after: Prisma.JsonNull }
      });
    });

    await runAfterDelete(name, resource, hookUser, this.prisma, id);
    return { ok: true };
  }

  async action(name: string, id: string, action: string, user: UserContext, input?: unknown) {
    const resource = getResource(name);
    const config = resource?.actions?.[action];
    if (!resource || !config) throw new NotFoundException({ message: "Action not found", code: "ACTION_NOT_FOUND" });
    if (!this.has(user, config.permission)) throw new ForbiddenException({ message: "Missing permission", code: "PERMISSION_DENIED" });

    if (config.handler) {
      const existing = await this.delegate(resource).findUnique({ where: { id } });
      if (!existing) throw new NotFoundException({ message: "Record not found", code: "NOT_FOUND" });
      if (this.isOutOfListScope(resource, user, existing)) {
        throw new NotFoundException({ message: "Record not found", code: "NOT_FOUND" });
      }
      const result = await config.handler({
        id,
        prisma: this.prisma,
        user: { id: user.id, email: user.email ?? "", permissions: user.permissions },
        input
      });
      await this.audit(user.id, name, id, action, existing, result);
      return this.sanitizeRecord(resource, result);
    }

    throw new NotFoundException({ message: "Action not implemented for this resource", code: "ACTION_NOT_IMPLEMENTED" });
  }

  private isOutOfListScope(resource: ResourceConfig, user: UserContext, record: unknown): boolean {
    if (!shouldApplyListScope(resource, user.permissions)) return false;
    const clause = listScopeWhereClause(resource, user.id);
    if (!clause) return false;
    const row = record as Record<string, unknown>;
    for (const [key, expected] of Object.entries(clause)) {
      if (row[key] !== expected) return true;
    }
    return false;
  }

  private authorizedResource(name: string, user: UserContext, action: keyof ResourceConfig["permissions"]) {
    const resource = getResource(name);
    if (!resource) throw new NotFoundException({ message: "Resource not found", code: "RESOURCE_NOT_FOUND" });
    const permission = resource.permissions[action];
    if (!permission || !this.has(user, permission)) throw new ForbiddenException({ message: "Missing permission", code: "PERMISSION_DENIED" });
    return resource;
  }

  private delegate(resource: ResourceConfig): PrismaDelegate {
    const delegate = (this.prisma as unknown as Record<string, PrismaDelegate>)[resource.model];
    if (!delegate) throw new NotFoundException({ message: "Prisma model not found", code: "MODEL_NOT_FOUND" });
    return delegate;
  }

  private has(user: UserContext, permission?: string) {
    return Boolean(permission && (user.permissions.includes(permission) || user.permissions.includes("*")));
  }

  private safeData(resource: ResourceConfig, data: Record<string, unknown>, mode: "create" | "edit") {
    return Object.fromEntries(
      Object.entries(data).filter(([name]) => {
        const field = resource.fields[name];
        return field && field[mode] !== false && !field.sensitive && field.type !== "id";
      })
    );
  }

  private sanitizeRecord(resource: ResourceConfig, record: unknown) {
    if (!record || typeof record !== "object") return record;
    const hiddenFields = Object.entries(resource.fields)
      .filter(([, field]) => field.type === "hidden" || field.sensitive)
      .map(([name]) => name);
    const copy = { ...(record as Record<string, unknown>) };
    for (const hidden of hiddenFields) delete copy[hidden];
    return copy;
  }

  private normalizeScopes(input: unknown): string[] {
    if (Array.isArray(input)) return input.map((item) => String(item));
    if (typeof input === "string") {
      try {
        const parsed = JSON.parse(input);
        if (Array.isArray(parsed)) return parsed.map((item) => String(item));
      } catch {
        return input
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
      }
    }
    return ["*"];
  }

  private buildWhere(resource: ResourceConfig, query: Record<string, unknown>) {
    const clauses: Record<string, unknown>[] = [];
    if (query.search) {
      const searchable = Object.entries(resource.fields).filter(([, field]) => field.searchable);
      clauses.push({ OR: searchable.map(([field]) => ({ [field]: { contains: String(query.search), mode: "insensitive" } })) });
    }
    for (const [key, value] of Object.entries(query)) {
      const opMatch = key.match(/^filter\[([^\]]+)]\[(\w+)]$/);
      if (opMatch?.[1] && opMatch[2]) {
        const clause = this.buildOperatorClause(resource, opMatch[1], opMatch[2], value);
        if (clause) clauses.push(clause);
        continue;
      }
      const legacy = key.match(/^filter\[([^\]]+)]$/);
      if (legacy?.[1]) {
        const clause = this.buildOperatorClause(resource, legacy[1], "eq", value);
        if (clause) clauses.push(clause);
      }
    }
    return clauses.length ? { AND: clauses } : undefined;
  }

  private buildOperatorClause(resource: ResourceConfig, fieldName: string, op: string, raw: unknown): Record<string, unknown> | null {
    const field = resource.fields[fieldName];
    if (!field?.filterable) {
      throw new BadRequestException({ message: `Field "${fieldName}" is not filterable`, code: "FILTER_NOT_ALLOWED" });
    }
    const str = raw == null ? "" : String(raw);
    switch (op) {
      case "eq":
        return { [fieldName]: this.coerceFilterScalar(field, str) };
      case "ne":
        return { [fieldName]: { not: this.coerceFilterScalar(field, str) } };
      case "in": {
        const parts = str
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .map((p) => this.coerceFilterScalar(field, p));
        return { [fieldName]: { in: parts } };
      }
      case "gt":
        return { [fieldName]: { gt: this.coerceFilterComparable(field, str) } };
      case "gte":
        return { [fieldName]: { gte: this.coerceFilterComparable(field, str) } };
      case "lt":
        return { [fieldName]: { lt: this.coerceFilterComparable(field, str) } };
      case "lte":
        return { [fieldName]: { lte: this.coerceFilterComparable(field, str) } };
      case "contains": {
        if (!this.isStringFilterField(field)) {
          throw new BadRequestException({ message: `Operator "contains" is only for string-like fields`, code: "FILTER_OP_INVALID" });
        }
        return { [fieldName]: { contains: str, mode: "insensitive" } };
      }
      default:
        throw new BadRequestException({ message: `Unknown filter operator "${op}"`, code: "FILTER_OP_UNKNOWN" });
    }
  }

  private isStringFilterField(field: ResourceField): boolean {
    return ["text", "textarea", "email", "url", "slug", "markdown", "code", "richtext", "badge", "select"].includes(field.type);
  }

  private coerceFilterScalar(field: ResourceField, value: string): string | number | boolean {
    if (field.type === "number" || field.type === "money") {
      const n = Number(value);
      if (Number.isNaN(n)) {
        throw new BadRequestException({ message: `Invalid number for filter`, code: "FILTER_VALUE_INVALID" });
      }
      return n;
    }
    if (field.type === "boolean") return value === "true" || value === "1";
    return value;
  }

  private coerceFilterComparable(field: ResourceField, value: string): Date | number | string | boolean {
    if (field.type === "datetime" || field.type === "date") {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) {
        throw new BadRequestException({ message: `Invalid date for filter`, code: "FILTER_VALUE_INVALID" });
      }
      return d;
    }
    return this.coerceFilterScalar(field, value);
  }

  private buildOrderBy(resource: ResourceConfig, sort: string) {
    const [field, dirRaw] = sort.split(":");
    const direction = dirRaw === "asc" ? "asc" : "desc";
    const candidate = field ? resource.fields[field] : undefined;
    if (field && candidate?.sortable) {
      return { [field]: direction };
    }
    if (resource.fields.createdAt?.sortable) {
      return { createdAt: direction };
    }
    return undefined;
  }

  /** Write an audit log entry outside a transaction (used by the action handler). */
  private audit(userId: string, resource: string, resourceId: string | undefined, action: string, before: unknown, after: unknown) {
    return this.prisma.auditLog.create({ data: { userId, resource, resourceId, action, before: before as object, after: after as object } });
  }

}
