import { BadRequestException, ForbiddenException, HttpException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { defaultFileValidation } from "@openadminjs/storage";
import type { ResourceConfig, ResourceField } from "@openadminjs/core";
import {
  isSensitiveField,
  listScopeWhereClause,
  mergeWhereClauses,
  resolveResourceForLocale,
  shouldApplyListScope
} from "@openadminjs/core";
import { randomBytes } from "node:crypto";
import { lstat, mkdir, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { PrismaService } from "../common/prisma.service";
import { pluginRuntime } from "../plugins/plugin-runtime";
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
          fields: Object.fromEntries(Object.entries(view.fields).filter(([name]) => this.canReadField(resource, name, user))),
          actions: view.actions,
          i18n: view.i18n,
          seo: view.seo
        };
      });
  }

  async globalSearch(
    query: string,
    user: UserContext,
    opts?: { perResourceLimit?: number; resources?: string[] }
  ): Promise<Array<{ resource: string; resourceLabel: string; id: string; title: string }>> {
    const q = query.trim();
    if (q.length < 2) return [];
    const requestedLimit = opts?.perResourceLimit ?? 5;
    if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1) throw new BadRequestException("Invalid search limit");
    const perResourceLimit = Math.min(requestedLimit, 20);
    const whitelist = opts?.resources ? new Set(opts.resources.map((v) => v.toLowerCase())) : null;
    const out: Array<{ resource: string; resourceLabel: string; id: string; title: string }> = [];

    for (const resource of resources) {
      if (whitelist && !whitelist.has(resource.name.toLowerCase())) continue;
      if (!this.has(user, resource.permissions.read)) continue;
      const searchable = Object.entries(resource.fields).filter(([name, f]) => f.searchable && this.canReadField(resource, name, user)).map(([name]) => name);
      if (!searchable.length) continue;

      const scope = shouldApplyListScope(resource, user.permissions) ? listScopeWhereClause(resource, user.id) : undefined;
      const where = mergeWhereClauses(
        {
          OR: searchable.map((field) => ({ [field]: { contains: q, mode: "insensitive" } }))
        },
        mergeWhereClauses(scope, this.systemScope(resource))
      );
      const rows = await this.delegate(resource).findMany({
        where,
        take: perResourceLimit,
        orderBy: this.buildOrderBy(resource, "createdAt:desc", user)
      });
      for (const row of rows) {
        const safe = this.sanitizeRecord(resource, row, user) as Record<string, unknown>;
        const id = String(safe.id ?? "");
        if (!id) continue;
        const tf = resource.titleField ?? "id";
        const title = String(safe[tf] ?? safe.name ?? safe.title ?? id);
        out.push({ resource: resource.name, resourceLabel: String(resource.label), id, title });
      }
    }

    return out.slice(0, 60);
  }

  async list(name: string, query: Record<string, unknown>, user: UserContext) {
    const resource = this.authorizedResource(name, user, "read");
    const delegate = this.delegate(resource);
    const page = Number(query.page ?? 1);
    const requestedLimit = Number(query.limit ?? 20);
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(requestedLimit) || requestedLimit < 1) throw new BadRequestException({ message: "Invalid pagination", code: "PAGINATION_INVALID" });
    const limit = Math.min(requestedLimit, 100);
    if (!Number.isSafeInteger((page - 1) * limit)) throw new BadRequestException("Invalid pagination offset");
    const baseWhere = this.buildWhere(resource, query, user);
    const scope = shouldApplyListScope(resource, user.permissions) ? listScopeWhereClause(resource, user.id) : undefined;
    const where = mergeWhereClauses(baseWhere, mergeWhereClauses(scope, this.systemScope(resource)));
    const orderBy = this.buildOrderBy(resource, String(query.sort ?? "createdAt:desc"), user);
    const [data, total] = await Promise.all([
      delegate.findMany({ where, orderBy, skip: (page - 1) * limit, take: limit }),
      delegate.count({ where })
    ]);
    return { data: data.map((row) => this.sanitizeRecord(resource, row, user)), meta: { page, limit, total, pages: Math.ceil(total / limit) || 1 } };
  }

  async get(name: string, id: string, user: UserContext) {
    const resource = this.authorizedResource(name, user, "read");
    const record = await this.delegate(resource).findUnique({ where: { id } });
    if (!record) throw new NotFoundException({ message: "Record not found", code: "NOT_FOUND" });
    if (this.isOutOfListScope(resource, user, record)) {
      throw new NotFoundException({ message: "Record not found", code: "NOT_FOUND" });
    }
    return this.sanitizeRecord(resource, record, user);
  }

  async create(name: string, data: Record<string, unknown>, user: UserContext) {
    const resource = this.authorizedResource(name, user, "create");

    if (name === "api-tokens") throw new ForbiddenException("API token issuance is disabled until authentication is supported");

    const payload = this.safeData(resource, data, "create", user);
    const hookUser = { id: user.id, email: user.email ?? "", permissions: user.permissions };
    await runBeforeCreate(name, resource, hookUser, this.prisma, payload);
    const validated = parseWritePayload(resource, "create", this.safeData(resource, payload, "create", user));
    if (name === "notifications") validated.userId = user.id;

    const record = await this.prisma.$transaction(async (tx) => {
      const txDelegate = (tx as unknown as Record<string, PrismaDelegate>)[resource.model];
      if (!txDelegate) throw new NotFoundException({ message: "Prisma model not found", code: "MODEL_NOT_FOUND" });
      const created = await txDelegate.create({ data: validated });
      await tx.auditLog.create({
        data: { userId: user.id, resource: name, resourceId: (created as { id?: string }).id, action: "create", before: Prisma.JsonNull, after: this.auditSnapshot(resource, created) as object }
      });
      return created;
    });

    await runAfterCreate(name, resource, hookUser, this.prisma, payload, record);
    return this.sanitizeRecord(resource, record, user);
  }

  async update(name: string, id: string, data: Record<string, unknown>, user: UserContext) {
    const resource = this.authorizedResource(name, user, "update");
    const delegate = this.delegate(resource);
    const before = await delegate.findUnique({ where: { id } });
    if (!before) throw new NotFoundException({ message: "Record not found", code: "NOT_FOUND" });
    if (this.isOutOfListScope(resource, user, before)) {
      throw new NotFoundException({ message: "Record not found", code: "NOT_FOUND" });
    }
    const payload = this.safeData(resource, data, "edit", user);
    const hookUser = { id: user.id, email: user.email ?? "", permissions: user.permissions };
    await runBeforeUpdate(name, resource, hookUser, this.prisma, id, payload);
    const validated = parseWritePayload(resource, "edit", this.safeData(resource, payload, "edit", user));
    const scope = shouldApplyListScope(resource, user.permissions) ? listScopeWhereClause(resource, user.id) : undefined;

    const record = await this.prisma.$transaction(async (tx) => {
      const txDelegate = (tx as unknown as Record<string, PrismaDelegate>)[resource.model];
      if (!txDelegate) throw new NotFoundException({ message: "Prisma model not found", code: "MODEL_NOT_FOUND" });
      const updated = await txDelegate.update({ where: { id, ...(scope ?? {}), ...(this.systemScope(resource) ?? {}) }, data: validated });
      await tx.auditLog.create({
        data: { userId: user.id, resource: name, resourceId: id, action: "update", before: this.auditSnapshot(resource, before) as object, after: this.auditSnapshot(resource, updated) as object }
      });
      return updated;
    });

    await runAfterUpdate(name, resource, hookUser, this.prisma, id, payload, before, record);
    return this.sanitizeRecord(resource, record, user);
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
      const scope = shouldApplyListScope(resource, user.permissions) ? listScopeWhereClause(resource, user.id) : undefined;
      await txDelegate.delete({ where: { id, ...(scope ?? {}), ...(this.systemScope(resource) ?? {}) } });
      await tx.auditLog.create({
        data: { userId: user.id, resource: name, resourceId: id, action: "delete", before: this.auditSnapshot(resource, before) as object, after: Prisma.JsonNull }
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
      await this.audit(user.id, name, id, action, this.auditSnapshot(resource, existing), this.auditSnapshot(resource, result));
      return this.sanitizeRecord(resource, result, user);
    }

    throw new NotFoundException({ message: "Action not implemented for this resource", code: "ACTION_NOT_IMPLEMENTED" });
  }

  async bulk(
    name: string,
    dto: { action: string; ids: string[]; input?: Record<string, unknown> },
    user: UserContext
  ): Promise<{ ok: number; failures: { id: string; message: string }[] }> {
    const uniqueIds = [...new Set(dto.ids.map(String).filter(Boolean))];
    if (!uniqueIds.length) throw new BadRequestException({ message: "No ids provided", code: "BULK_EMPTY" });

    const failures: { id: string; message: string }[] = [];
    let ok = 0;

    if (dto.action === "delete") {
      this.authorizedResource(name, user, "delete");
      for (const id of uniqueIds) {
        try {
          await this.delete(name, id, user);
          ok += 1;
        } catch (err: unknown) {
          failures.push({ id, message: this.bulkErrorMessage(err) });
        }
      }
      return { ok, failures };
    }

    const resource = getResource(name);
    const config = resource?.actions?.[dto.action];
    if (!resource || !config?.handler) {
      throw new NotFoundException({ message: "Action not found", code: "ACTION_NOT_FOUND" });
    }
    if (!this.has(user, config.permission)) throw new ForbiddenException({ message: "Missing permission", code: "PERMISSION_DENIED" });

    for (const id of uniqueIds) {
      try {
        await this.action(name, id, dto.action, user, dto.input);
        ok += 1;
      } catch (err: unknown) {
        failures.push({ id, message: this.bulkErrorMessage(err) });
      }
    }
    return { ok, failures };
  }

  async reorder(name: string, orderedIds: string[], user: UserContext, baseIndex = 0): Promise<{ ok: true }> {
    const resource = this.authorizedResource(name, user, "update");
    const orderField = resource.fields.order;
    if (!orderField || orderField.type !== "number" || orderField.edit === false) {
      throw new BadRequestException({ message: "Resource does not support drag-and-drop ordering", code: "REORDER_UNSUPPORTED" });
    }
    const uniqueIds = [...new Set(orderedIds.map(String).filter(Boolean))];
    if (!uniqueIds.length) throw new BadRequestException({ message: "No ids provided", code: "REORDER_EMPTY" });

    const delegate = this.delegate(resource);
    const rows = await delegate.findMany({ where: { id: { in: uniqueIds } } });
    if (rows.length !== uniqueIds.length) {
      throw new BadRequestException({ message: "One or more records were not found", code: "REORDER_IDS_INVALID" });
    }
    for (const row of rows) {
      if (this.isOutOfListScope(resource, user, row)) {
        throw new ForbiddenException({ message: "Missing permission", code: "PERMISSION_DENIED" });
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const txDelegate = (tx as unknown as Record<string, PrismaDelegate>)[resource.model];
      if (!txDelegate) throw new NotFoundException({ message: "Prisma model not found", code: "MODEL_NOT_FOUND" });
      for (let i = 0; i < uniqueIds.length; i++) {
        await txDelegate.update({
          where: { id: uniqueIds[i] },
          data: { order: baseIndex + i }
        });
      }
    });

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        resource: name,
        resourceId: uniqueIds[0],
        action: "reorder",
        before: { ids: uniqueIds, previous: rows.map((r) => ({ id: (r as { id: string }).id, order: (r as { order?: number }).order })) } as object,
        after: { ids: uniqueIds, baseIndex, order: uniqueIds.map((id, index) => ({ id, order: baseIndex + index })) } as object
      }
    });

    return { ok: true };
  }

  async uploadFile(
    input: { filename: string; mimeType: string; contentBase64: string; targetPath?: string },
    user: UserContext
  ): Promise<Record<string, unknown>> {
    this.authorizedResource("files", user, "create");
    if (input.targetPath !== undefined) throw new BadRequestException({ message: "Custom upload paths are not allowed", code: "UPLOAD_PATH_INVALID" });
    const filename = String(input.filename ?? "").trim();
    const mimeType = String(input.mimeType ?? "").trim().toLowerCase();
    const rawBase64 = String(input.contentBase64 ?? "").trim();
    if (!filename || !mimeType || !rawBase64) {
      throw new BadRequestException({ message: "filename, mimeType and contentBase64 are required", code: "UPLOAD_INVALID" });
    }
    if (!defaultFileValidation.mimeTypes.includes(mimeType)) {
      throw new BadRequestException({ message: "MIME type is not allowed", code: "UPLOAD_MIME_DENIED" });
    }

    if (rawBase64.length > Math.ceil(defaultFileValidation.maxSizeBytes / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(rawBase64) || rawBase64.length % 4 !== 0) throw new BadRequestException("Invalid or oversized base64");
    let contentBase64 = rawBase64;
    for (const mediaHook of pluginRuntime.getMediaHooks()) {
      await mediaHook.beforeStore?.({
        filename,
        mimeType,
        size: Math.floor((contentBase64.length * 3) / 4),
        contentBase64,
        user: { ...user, email: user.email ?? "" }
      });
      const transformed = await mediaHook.transform?.({
        filename,
        mimeType,
        contentBase64,
        user: { ...user, email: user.email ?? "" }
      });
      if (transformed) {
        contentBase64 = transformed.contentBase64;
      }
    }

    const fileBuffer = Buffer.from(contentBase64, "base64");
    if (fileBuffer.byteLength > defaultFileValidation.maxSizeBytes) {
      throw new BadRequestException({ message: "File is too large", code: "UPLOAD_TOO_LARGE" });
    }

    const signatures: Record<string, (buffer: Buffer) => boolean> = {
      "image/png": b => b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])),
      "image/jpeg": b => b[0] === 255 && b[1] === 216 && b[2] === 255,
      "image/webp": b => b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP",
      "application/pdf": b => b.toString("ascii", 0, 5) === "%PDF-",
      "text/plain": b => !b.includes(0)
    };
    if (!signatures[mimeType]?.(fileBuffer)) throw new BadRequestException("File content does not match MIME type");
    const root = resolve(process.cwd(), "uploads");
    await mkdir(root, { recursive: true, mode: 0o700 });
    if (!(await lstat(root)).isDirectory() || (await lstat(root)).isSymbolicLink()) throw new BadRequestException("Invalid storage root");
    const key = randomBytes(24).toString("hex");
    const relPath = `uploads/${key}`;
    const absPath = join(root, key);
    await writeFile(absPath, fileBuffer, { flag: "wx", mode: 0o600 });
    let record: unknown;
    try {
      record = await this.create("files", { filename, path: relPath, mimeType, size: fileBuffer.byteLength }, user);
    } catch (error) {
      await unlink(absPath).catch(() => undefined);
      throw error;
    }

    for (const mediaHook of pluginRuntime.getMediaHooks()) {
      await mediaHook.afterStore?.({
        fileId: String((record as Record<string, unknown>).id ?? ""),
        filename,
        mimeType,
        size: fileBuffer.byteLength,
        user: { ...user, email: user.email ?? "" }
      });
    }

    return record as Record<string, unknown>;
  }

  private bulkErrorMessage(err: unknown): string {
    if (err instanceof HttpException) {
      const r = err.getResponse();
      if (typeof r === "string") return r;
      if (r && typeof r === "object" && "message" in r) {
        const m = (r as { message: unknown }).message;
        if (Array.isArray(m)) return m.join(", ");
        if (typeof m === "string") return m;
      }
      return err.message;
    }
    if (err instanceof Error) return err.message;
    return "Request failed";
  }

  private isOutOfListScope(resource: ResourceConfig, user: UserContext, record: unknown): boolean {
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

  private systemScope(resource: ResourceConfig) {
    return resource.name === "settings" ? { NOT: { key: { startsWith: "ai." } } } : undefined;
  }

  private canReadField(resource: ResourceConfig, name: string, user: UserContext) {
    const field = Object.hasOwn(resource.fields, name) ? resource.fields[name] : undefined;
    return Boolean(field && !isSensitiveField(name, field) && (!field.permissions?.read || this.has(user, field.permissions.read)));
  }

  private safeData(resource: ResourceConfig, data: Record<string, unknown>, mode: "create" | "edit", user: UserContext) {
    for (const name of Object.keys(data)) {
      const field = Object.hasOwn(resource.fields, name) ? resource.fields[name] : undefined;
      if (!field) throw new BadRequestException({ message: "Unknown field", code: "FIELD_UNKNOWN" });
      const permission = field.permissions?.[mode === "create" ? "create" : "update"];
      if (permission && !this.has(user, permission)) throw new ForbiddenException({ message: "Missing field permission", code: "FIELD_PERMISSION_DENIED" });
      if (field[mode] === false || isSensitiveField(name, field) || field.type === "id" || field.type === "computed") throw new ForbiddenException("Field is not writable");
    }
    if (resource.name === "settings" && "key" in data && String(data.key).toLowerCase().startsWith("ai.")) throw new ForbiddenException("Reserved setting");
    return { ...data };
  }

  private redact(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(item => this.redact(item));
    if (!value || typeof value !== "object" || value instanceof Date) return value;
    return Object.fromEntries(Object.entries(value).filter(([name]) => !isSensitiveField(name)).map(([name, item]) => [name, this.redact(item)]));
  }

  private auditSnapshot(resource: ResourceConfig, record: unknown) {
    if (!record || typeof record !== "object") return {};
    return this.redact(Object.fromEntries(Object.entries(record).filter(([name]) => {
      const field = resource.fields[name];
      return Object.hasOwn(resource.fields, name) && field && !isSensitiveField(name, field) && field.type !== "json";
    })));
  }

  private sanitizeRecord(resource: ResourceConfig, record: unknown, user: UserContext) {
    if (!record || typeof record !== "object") return record;
    const entries = Object.entries(record).filter(([name]) => this.canReadField(resource, name, user));
    // Historical snapshots may contain secrets and cannot reliably be sanitized retroactively.
    if (resource.name === "audit-logs") return Object.fromEntries(entries.filter(([name]) => name !== "before" && name !== "after"));
    if (resource.name === "settings" && String((record as Record<string, unknown>).key ?? "").toLowerCase().startsWith("ai.")) return {};
    return Object.fromEntries(entries);
  }

  private buildWhere(resource: ResourceConfig, query: Record<string, unknown>, user: UserContext) {
    const clauses: Record<string, unknown>[] = [];
    if (query.search) {
      const searchable = Object.entries(resource.fields).filter(([name, field]) => field.searchable && this.canReadField(resource, name, user));
      clauses.push({ OR: searchable.map(([field]) => ({ [field]: { contains: String(query.search), mode: "insensitive" } })) });
    }
    for (const [key, value] of Object.entries(query)) {
      const opMatch = key.match(/^filter\[([^\]]+)]\[(\w+)]$/);
      if (opMatch?.[1] && opMatch[2]) {
        const clause = this.buildOperatorClause(resource, opMatch[1], opMatch[2], value, user);
        if (clause) clauses.push(clause);
        continue;
      }
      const legacy = key.match(/^filter\[([^\]]+)]$/);
      if (legacy?.[1]) {
        const clause = this.buildOperatorClause(resource, legacy[1], "eq", value, user);
        if (clause) clauses.push(clause);
      }
    }
    return clauses.length ? { AND: clauses } : undefined;
  }

  private buildOperatorClause(resource: ResourceConfig, fieldName: string, op: string, raw: unknown, user: UserContext): Record<string, unknown> | null {
    const field = resource.fields[fieldName];
    if (!field?.filterable || !this.canReadField(resource, fieldName, user)) {
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

  private buildOrderBy(resource: ResourceConfig, sort: string, user: UserContext) {
    const [field, dirRaw] = sort.split(":");
    const direction = dirRaw === "asc" ? "asc" : "desc";
    const candidate = field ? resource.fields[field] : undefined;
    if (field && candidate?.sortable && this.canReadField(resource, field, user)) {
      return { [field]: direction };
    }
    if (resource.fields.createdAt?.sortable && this.canReadField(resource, "createdAt", user)) {
      return { createdAt: direction };
    }
    return undefined;
  }

  /** Write an audit log entry outside a transaction (used by the action handler). */
  private audit(userId: string, resource: string, resourceId: string | undefined, action: string, before: unknown, after: unknown) {
    return this.prisma.auditLog.create({ data: { userId, resource, resourceId, action, before: before as object, after: after as object } });
  }

}
