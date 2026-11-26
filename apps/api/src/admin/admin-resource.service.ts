import { BadRequestException, ForbiddenException, HttpException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { defaultFileValidation, LocalStorage } from "@openadminjs/storage";
import type { ResourceConfig } from "@openadminjs/core";
import {
  listScopeWhereClause,
  mergeWhereClauses,
  resolveResourceForLocale,
  shouldApplyListScope
} from "@openadminjs/core";
import { randomBytes, createHash } from "node:crypto";
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

import { isOutOfListScope, has, systemScope, canReadField, safeData, auditSnapshot, sanitizeRecord, type UserContext } from "./resource-policy";
import { buildWhere, buildOrderBy } from "./resource-query";
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
      .filter((resource) => has(user, resource.permissions.read))
      .map((resource) => {
        const view = resolveResourceForLocale(resource, locale);
        return {
          name: view.name,
          label: view.label,
          icon: view.icon,
          titleField: view.titleField,
          permissions: view.permissions,
          fields: Object.fromEntries(Object.entries(view.fields).filter(([name]) => canReadField(resource, name, user)).map(([name, field]) => [name, { ...field, create: field.create !== false && (!field.permissions?.create || has(user, field.permissions.create)), edit: field.edit !== false && (!field.permissions?.update || has(user, field.permissions.update)) }])),
          actions: Object.fromEntries(Object.entries(view.actions ?? {}).filter(([,action])=>has(user,action.permission)).map(([name,{handler,...config}])=>[name,config])),
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
      if (!has(user, resource.permissions.read)) continue;
      const searchable = Object.entries(resource.fields).filter(([name, f]) => f.searchable && canReadField(resource, name, user)).map(([name]) => name);
      if (!searchable.length) continue;

      const scope = shouldApplyListScope(resource, user.permissions) ? listScopeWhereClause(resource, user.id) : undefined;
      const where = mergeWhereClauses(
        {
          OR: searchable.map((field) => ({ [field]: { contains: q, ...(/^(postgres|postgresql):/.test(process.env.DATABASE_URL ?? "postgresql:") ? { mode: "insensitive" } : {}) } }))
        },
        mergeWhereClauses(scope, systemScope(resource))
      );
      const rows = await this.delegate(resource).findMany({
        where,
        take: perResourceLimit,
        orderBy: buildOrderBy(resource, "createdAt:desc", user)
      });
      for (const row of rows) {
        const safe = sanitizeRecord(resource, row, user) as Record<string, unknown>;
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
    const baseWhere = buildWhere(resource, query, user);
    const scope = shouldApplyListScope(resource, user.permissions) ? listScopeWhereClause(resource, user.id) : undefined;
    const where = mergeWhereClauses(baseWhere, mergeWhereClauses(scope, systemScope(resource)));
    const orderBy = buildOrderBy(resource, String(query.sort ?? "createdAt:desc"), user);
    const [data, total] = await Promise.all([
      delegate.findMany({ where, orderBy, skip: (page - 1) * limit, take: limit }),
      delegate.count({ where })
    ]);
    return { data: data.map((row) => sanitizeRecord(resource, row, user)), meta: { page, limit, total, pages: Math.ceil(total / limit) || 1 } };
  }

  async get(name: string, id: string, user: UserContext) {
    const resource = this.authorizedResource(name, user, "read");
    const record = await this.delegate(resource).findUnique({ where: { id } });
    if (!record) throw new NotFoundException({ message: "Record not found", code: "NOT_FOUND" });
    if (isOutOfListScope(resource, user, record)) {
      throw new NotFoundException({ message: "Record not found", code: "NOT_FOUND" });
    }
    return sanitizeRecord(resource, record, user);
  }

  async create(name: string, data: Record<string, unknown>, user: UserContext) {
    if (name === "files") throw new ForbiddenException("Use the dedicated upload endpoint");
    return this.createRecord(name, data, user);
  }

  private async createRecord(name: string, data: Record<string, unknown>, user: UserContext) {
    const resource = this.authorizedResource(name, user, "create");

    if (name === "api-tokens") {
      const label = typeof data.name === "string" ? data.name.trim() : "";
      const scopes = Array.isArray(data.scopes) ? [...new Set(data.scopes)] : [];
      const allowed = new Set(resources.filter(r => !["api-tokens","settings","audit-logs","users","job-logs","webhook-logs"].includes(r.name) && has(user,r.permissions.read)).map(r=>r.permissions.read));
      if (!label || label.length > 120 || !scopes.length || scopes.length > 50 || !scopes.every(s=>typeof s==="string" && allowed.has(s))) throw new BadRequestException("Choose explicit permitted resource read scopes");
      const plainToken = "oajs_" + randomBytes(32).toString("base64url");
      const created = await this.prisma.$transaction(async tx => {
        const record = await tx.apiToken.create({data:{name:label, scopes:scopes as string[], userId:user.id, tokenHash:createHash("sha256").update(plainToken).digest("hex")}});
        await tx.auditLog.create({data:{userId:user.id,resource:name,resourceId:record.id,action:"create"}});
        return record;
      });
      return {...sanitizeRecord(resource,created,user) as object,plainToken};
    }

    const payload = safeData(resource, data, "create", user);
    const hookUser = { id: user.id, email: user.email ?? "", permissions: user.permissions };
    await runBeforeCreate(name, resource, hookUser, this.prisma, payload);
    const validated = parseWritePayload(resource, "create", safeData(resource, payload, "create", user));
    if (name === "notifications") validated.userId = user.id;

    const record = await this.prisma.$transaction(async (tx) => {
      const txDelegate = (tx as unknown as Record<string, PrismaDelegate>)[resource.model];
      if (!txDelegate) throw new NotFoundException({ message: "Prisma model not found", code: "MODEL_NOT_FOUND" });
      const created = await txDelegate.create({ data: validated });
      await tx.auditLog.create({
        data: { userId: user.id, resource: name, resourceId: (created as { id?: string }).id, action: "create", before: Prisma.JsonNull, after: auditSnapshot(resource, created) as object }
      });
      return created;
    });

    await runAfterCreate(name, resource, hookUser, this.prisma, payload, record);
    return sanitizeRecord(resource, record, user);
  }

  async update(name: string, id: string, data: Record<string, unknown>, user: UserContext) {
    const resource = this.authorizedResource(name, user, "update");
    const delegate = this.delegate(resource);
    const before = await delegate.findUnique({ where: { id } });
    if (!before) throw new NotFoundException({ message: "Record not found", code: "NOT_FOUND" });
    if (isOutOfListScope(resource, user, before)) {
      throw new NotFoundException({ message: "Record not found", code: "NOT_FOUND" });
    }
    const payload = safeData(resource, data, "edit", user);
    const hookUser = { id: user.id, email: user.email ?? "", permissions: user.permissions };
    await runBeforeUpdate(name, resource, hookUser, this.prisma, id, payload);
    const validated = parseWritePayload(resource, "edit", safeData(resource, payload, "edit", user));
    const scope = shouldApplyListScope(resource, user.permissions) ? listScopeWhereClause(resource, user.id) : undefined;

    const record = await this.prisma.$transaction(async (tx) => {
      const txDelegate = (tx as unknown as Record<string, PrismaDelegate>)[resource.model];
      if (!txDelegate) throw new NotFoundException({ message: "Prisma model not found", code: "MODEL_NOT_FOUND" });
      const updated = await txDelegate.update({ where: { id, ...(scope ?? {}), ...(systemScope(resource) ?? {}) }, data: validated });
      await tx.auditLog.create({
        data: { userId: user.id, resource: name, resourceId: id, action: "update", before: auditSnapshot(resource, before) as object, after: auditSnapshot(resource, updated) as object }
      });
      return updated;
    });

    await runAfterUpdate(name, resource, hookUser, this.prisma, id, payload, before, record);
    return sanitizeRecord(resource, record, user);
  }

  async delete(name: string, id: string, user: UserContext) {
    const resource = this.authorizedResource(name, user, "delete");
    const delegate = this.delegate(resource);
    const before = await delegate.findUnique({ where: { id } });
    if (!before) throw new NotFoundException({ message: "Record not found", code: "NOT_FOUND" });
    if (isOutOfListScope(resource, user, before)) {
      throw new NotFoundException({ message: "Record not found", code: "NOT_FOUND" });
    }
    const hookUser = { id: user.id, email: user.email ?? "", permissions: user.permissions };
    await runBeforeDelete(name, resource, hookUser, this.prisma, id);

    await this.prisma.$transaction(async (tx) => {
      const txDelegate = (tx as unknown as Record<string, PrismaDelegate>)[resource.model];
      if (!txDelegate) throw new NotFoundException({ message: "Prisma model not found", code: "MODEL_NOT_FOUND" });
      const scope = shouldApplyListScope(resource, user.permissions) ? listScopeWhereClause(resource, user.id) : undefined;
      await txDelegate.delete({ where: { id, ...(scope ?? {}), ...(systemScope(resource) ?? {}) } });
      await tx.auditLog.create({
        data: { userId: user.id, resource: name, resourceId: id, action: "delete", before: auditSnapshot(resource, before) as object, after: Prisma.JsonNull }
      });
    });

    if (name === "files") {
      const path = String((before as Record<string,unknown>).path ?? "");
      await new LocalStorage().delete(path).catch(() => console.warn("Storage cleanup requires operator review", id));
    }
    await runAfterDelete(name, resource, hookUser, this.prisma, id);
    return { ok: true };
  }

  async action(name: string, id: string, action: string, user: UserContext, input?: unknown) {
    const resource = this.authorizedResource(name,user,"read");
    const config = resource.actions?.[action];
    if (!resource || !config) throw new NotFoundException({ message: "Action not found", code: "ACTION_NOT_FOUND" });
    if (!has(user, config.permission)) throw new ForbiddenException({ message: "Missing permission", code: "PERMISSION_DENIED" });

    if (config.handler) {
      const existing = await this.delegate(resource).findUnique({ where: { id } });
      if (!existing) throw new NotFoundException({ message: "Record not found", code: "NOT_FOUND" });
      if (isOutOfListScope(resource, user, existing)) {
        throw new NotFoundException({ message: "Record not found", code: "NOT_FOUND" });
      }
      const result = await config.handler({
        id,
        prisma: this.prisma,
        user: { id: user.id, email: user.email ?? "", permissions: user.permissions },
        input
      });
      await this.audit(user.id, name, id, action, auditSnapshot(resource, existing), auditSnapshot(resource, result));
      return sanitizeRecord(resource, result, user);
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

    if (uniqueIds.length > 100) throw new BadRequestException("Bulk limit is 100");
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
    if (!has(user, config.permission)) throw new ForbiddenException({ message: "Missing permission", code: "PERMISSION_DENIED" });

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
    if (!orderField || orderField.type !== "number" || orderField.edit === false || (orderField.permissions?.update && !has(user,orderField.permissions.update))) {
      throw new BadRequestException({ message: "Resource does not support drag-and-drop ordering", code: "REORDER_UNSUPPORTED" });
    }
    const uniqueIds = [...new Set(orderedIds.map(String).filter(Boolean))];
    if (!uniqueIds.length || uniqueIds.length > 100 || !Number.isSafeInteger(baseIndex) || baseIndex < 0 || baseIndex + uniqueIds.length > 2147483647) throw new BadRequestException({ message: "Invalid reorder request", code: "REORDER_INVALID" });

    const delegate = this.delegate(resource);
    const rows = await delegate.findMany({ where: { id: { in: uniqueIds } } });
    if (rows.length !== uniqueIds.length) {
      throw new BadRequestException({ message: "One or more records were not found", code: "REORDER_IDS_INVALID" });
    }
    for (const row of rows) {
      if (isOutOfListScope(resource, user, row)) {
        throw new ForbiddenException({ message: "Missing permission", code: "PERMISSION_DENIED" });
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const txDelegate = (tx as unknown as Record<string, PrismaDelegate>)[resource.model];
      if (!txDelegate) throw new NotFoundException({ message: "Prisma model not found", code: "MODEL_NOT_FOUND" });
      for (let i = 0; i < uniqueIds.length; i++) {
        await txDelegate.update({
          where: { id: uniqueIds[i], ...(shouldApplyListScope(resource,user.permissions)?listScopeWhereClause(resource,user.id):{}) },
          data: { order: baseIndex + i }
        });
      }
      await tx.auditLog.create({
      data: {
        userId: user.id,
        resource: name,
        resourceId: uniqueIds[0],
        action: "reorder",
        before: { ids: uniqueIds, previous: rows.map((r) => ({ id: (r as { id: string }).id, order: (r as { order?: number }).order })) } as object,
        after: { ids: uniqueIds, baseIndex, order: uniqueIds.map((id, index) => ({ id, order: baseIndex + index })) } as object
      }
    });
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
    const storage = new LocalStorage();
    const stored = await storage.put(fileBuffer,{filename,path:"",mimeType,size:fileBuffer.length});
    let record: unknown;
    try {
      record = await this.createRecord("files", stored, user);
    } catch (error) {
      await storage.delete(stored.path).catch(()=>undefined);
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

  async downloadFile(id: string, user: UserContext) {
    this.authorizedResource("files", user, "read");
    const file = await this.prisma.fileAsset.findUnique({where:{id}});
    if (!file) throw new NotFoundException("File not found");
    const resource = this.authorizedResource("files",user,"read");
    if (isOutOfListScope(resource,user,file)) throw new NotFoundException("File not found");
    try { return {filename:file.filename, bytes:await new LocalStorage().read(file.path)}; }
    catch { throw new NotFoundException("File unavailable"); }
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

  private authorizedResource(name: string, user: UserContext, action: keyof ResourceConfig["permissions"]) {
    const resource = getResource(name);
    if (!resource) throw new NotFoundException({ message: "Resource not found", code: "RESOURCE_NOT_FOUND" });
    const permission = resource.permissions[action];
    if (!permission || !has(user, permission)) throw new ForbiddenException({ message: "Missing permission", code: "PERMISSION_DENIED" });
    return resource;
  }

  private delegate(resource: ResourceConfig): PrismaDelegate {
    const delegate = (this.prisma as unknown as Record<string, PrismaDelegate>)[resource.model];
    if (!delegate) throw new NotFoundException({ message: "Prisma model not found", code: "MODEL_NOT_FOUND" });
    return delegate;
  }

  /** Write an audit log entry outside a transaction (used by the action handler). */
  private audit(userId: string, resource: string, resourceId: string | undefined, action: string, before: unknown, after: unknown) {
    return this.prisma.auditLog.create({ data: { userId, resource, resourceId, action, before: before as object, after: after as object } });
  }

}
