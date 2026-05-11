import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn().mockResolvedValue("hashed")
  }
}));

import bcrypt from "bcryptjs";
import { AuthService } from "./auth.service";

const bcryptCompareMock = bcrypt.compare as unknown as ReturnType<typeof vi.fn>;

function createPrismaMock() {
  return {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn()
    },
    auditLog: {
      create: vi.fn()
    }
  };
}

describe("AuthService", () => {
  it("login succeeds for valid credentials and admin realm", async () => {
    const prisma = createPrismaMock();
    const jwt = { signAsync: vi.fn().mockResolvedValue("jwt") };
    prisma.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "openadminjs@proton.me",
      name: "Admin",
      passwordHash: "hash",
      roles: [{ role: { name: "admin", realm: "admin", permissions: [{ permission: { name: "*" } }] } }]
    });
    bcryptCompareMock.mockResolvedValue(true);

    const config = { get: vi.fn().mockReturnValue(undefined) };
    const service = new AuthService(prisma as never, jwt as never, config as never);
    const result = await service.login("openadminjs@proton.me", "password", {}, "admin");

    expect(result.accessToken).toBe("jwt");
    expect(result.user.email).toBe("openadminjs@proton.me");
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it("login fails for wrong realm", async () => {
    const prisma = createPrismaMock();
    const jwt = { signAsync: vi.fn().mockResolvedValue("jwt") };
    prisma.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "openadminjs@proton.me",
      name: "Admin",
      passwordHash: "hash",
      roles: [{ role: { name: "admin", realm: "public", permissions: [] } }]
    });
    bcryptCompareMock.mockResolvedValue(true);

    const config = { get: vi.fn().mockReturnValue(undefined) };
    const service = new AuthService(prisma as never, jwt as never, config as never);
    await expect(service.login("openadminjs@proton.me", "password", {}, "admin")).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("refresh fails when token does not match any user", async () => {
    const prisma = createPrismaMock();
    const jwt = { signAsync: vi.fn().mockResolvedValue("jwt") };
    prisma.user.findMany.mockResolvedValue([{ id: "u1", refreshTokenHash: "hash-1" }]);
    bcryptCompareMock.mockResolvedValue(false);

    const config = { get: vi.fn().mockReturnValue(undefined) };
    const service = new AuthService(prisma as never, jwt as never, config as never);
    await expect(service.refresh("bad-token", "admin")).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
