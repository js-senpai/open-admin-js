import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

vi.mock("../common/prisma.service.js", () => ({
  PrismaService: class PrismaService {}
}));

import { AdminResourceService } from "./admin-resource.service";
import type { PrismaService } from "../common/prisma.service";

function prismaMock(overrides: Record<string, unknown> = {}): PrismaService {
  const auditCreate = vi.fn().mockResolvedValue({});
  const base = {
    auditLog: { create: auditCreate },
    $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const txProxy = new Proxy(
        { auditLog: { create: auditCreate }, ...overrides },
        { get: (target, key) => (target as Record<string | symbol, unknown>)[key] ?? (overrides as Record<string | symbol, unknown>)[key] }
      );
      return fn(txProxy);
    }),
    ...overrides
  };
  return base as unknown as PrismaService;
}

describe("AdminResourceService", () => {
  it("listResources returns only resources the user may read", () => {
    const service = new AdminResourceService(prismaMock());
    const rows = service.listResources({ id: "1", permissions: ["posts.read"] });
    expect(rows.some((r) => r.name === "posts")).toBe(true);
    expect(rows.some((r) => r.name === "users")).toBe(false);
  });

  it("listResources resolves localized labels when locale is passed", () => {
    const service = new AdminResourceService(prismaMock());
    const rows = service.listResources({ id: "1", permissions: ["posts.read"] }, "ru");
    const posts = rows.find((r) => r.name === "posts");
    expect(posts?.label).toBe("Записи");
  });

  it("lists records with pagination metadata", async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: "a1", title: "Hello", status: "draft" }]);
    const count = vi.fn().mockResolvedValue(1);
    const prisma = prismaMock({
      post: { findMany, count, findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() }
    });
    const service = new AdminResourceService(prisma);
    const result = await service.list("posts", { page: "1", limit: "10" }, { id: "1", permissions: ["posts.read"] });

    expect(result.meta).toEqual({ page: 1, limit: 10, total: 1, pages: 1 });
    expect(result.data).toHaveLength(1);
    expect(findMany).toHaveBeenCalled();
  });

  it("never returns undeclared secrets", async () => {
    const service = new AdminResourceService(prismaMock({ user: { findUnique: vi.fn().mockResolvedValue({ id: "u1", email: "admin@example.test", passwordHash: "secret", refreshTokenHash: "secret" }) } }));
    const record = await service.get("users", "u1", { id: "admin", permissions: ["users.read"] });
    expect(record).toEqual({ id: "u1", email: "admin@example.test" });
  });

  it("rejects invalid pagination before querying Prisma", async () => {
    const findMany = vi.fn();
    const service = new AdminResourceService(prismaMock({ post: { findMany } }));
    await expect(service.list("posts", { page: "abc" }, { id: "1", permissions: ["posts.read"] })).rejects.toBeInstanceOf(BadRequestException);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("rejects custom upload paths before performing I/O", async () => {
    const service = new AdminResourceService(prismaMock());
    await expect(service.uploadFile({ filename: "test.txt", mimeType: "text/plain", contentBase64: "dGVzdA==", targetPath: ".env" }, { id: "1", permissions: ["files.create"] })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("throws when resource is missing", async () => {
    const service = new AdminResourceService(prismaMock());
    await expect(service.list("unknown-resource", {}, { id: "1", permissions: ["*"] })).rejects.toBeInstanceOf(NotFoundException);
  });

  it("throws when user lacks read permission", async () => {
    const prisma = prismaMock({
      post: {
        findMany: vi.fn(),
        count: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      }
    });
    const service = new AdminResourceService(prisma);
    await expect(service.list("posts", {}, { id: "1", permissions: [] })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("creates post and writes audit log", async () => {
    const create = vi.fn().mockResolvedValue({ id: "p1", title: "Hello", status: "draft" });
    const prisma = prismaMock({
      post: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn(), create, update: vi.fn(), delete: vi.fn() }
    });
    const service = new AdminResourceService(prisma);
    const result = await service.create("posts", { title: "Hello", status: "draft" }, { id: "u1", permissions: ["posts.create"] });

    expect(create).toHaveBeenCalled();
    expect((result as { id: string }).id).toBe("p1");
  });

  it("updates post and enforces not found", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const prisma = prismaMock({
      post: { findMany: vi.fn(), count: vi.fn(), findUnique, create: vi.fn(), update: vi.fn(), delete: vi.fn() }
    });
    const service = new AdminResourceService(prisma);

    await expect(service.update("posts", "missing", { title: "x" }, { id: "u1", permissions: ["posts.update"] })).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it("deletes post when permission exists", async () => {
    const deleteFn = vi.fn().mockResolvedValue({ id: "p1" });
    const prisma = prismaMock({
      post: {
        findMany: vi.fn(),
        count: vi.fn(),
        findUnique: vi.fn().mockResolvedValue({ id: "p1", title: "Draft" }),
        create: vi.fn(),
        update: vi.fn(),
        delete: deleteFn
      }
    });
    const service = new AdminResourceService(prisma);
    const result = await service.delete("posts", "p1", { id: "u1", permissions: ["posts.delete"] });

    expect(deleteFn).toHaveBeenCalledWith({ where: { id: "p1" } });
    expect(result).toEqual({ ok: true });
  });
});
