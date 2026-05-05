import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AuthGuard } from "./auth.guard";

function createContext(authHeader?: string, requiredRealm?: string) {
  const request: { headers: Record<string, string>; user?: unknown } = { headers: {} };
  if (authHeader) request.headers.authorization = authHeader;
  return {
    request,
    ctx: {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => "handler",
      getClass: () => "class"
    },
    reflector: {
      getAllAndOverride: vi.fn().mockReturnValue(requiredRealm)
    }
  };
}

const mockConfig = { get: vi.fn().mockReturnValue("test-secret") };

describe("AuthGuard", () => {
  it("rejects missing token", async () => {
    const { ctx, reflector } = createContext(undefined);
    const guard = new AuthGuard({ verifyAsync: vi.fn() } as never, { user: { findUnique: vi.fn() } } as never, reflector as never, mockConfig as never);
    await expect(guard.canActivate(ctx as never)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects realm mismatch", async () => {
    const { ctx, reflector } = createContext("Bearer token", "public");
    const guard = new AuthGuard(
      { verifyAsync: vi.fn().mockResolvedValue({ sub: "u1", realm: "admin" }) } as never,
      { user: { findUnique: vi.fn() } } as never,
      reflector as never,
      mockConfig as never
    );
    await expect(guard.canActivate(ctx as never)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("attaches request.user for valid token", async () => {
    const { ctx, reflector, request } = createContext("Bearer token", "admin");
    const guard = new AuthGuard(
      { verifyAsync: vi.fn().mockResolvedValue({ sub: "u1", realm: "admin" }) } as never,
      {
        user: {
          findUnique: vi.fn().mockResolvedValue({
            id: "u1",
            email: "admin@example.com",
            name: "Admin",
            roles: [{ role: { name: "admin", realm: "admin", permissions: [{ permission: { name: "*" } }] } }]
          })
        }
      } as never,
      reflector as never,
      mockConfig as never
    );
    await expect(guard.canActivate(ctx as never)).resolves.toBe(true);
    expect((request.user as { id: string }).id).toBe("u1");
  });
});
