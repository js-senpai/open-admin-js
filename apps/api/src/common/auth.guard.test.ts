import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AuthGuard } from "./auth.guard";

function createContext(authHeader?: string, requiredRealm?: string) {
  const request: { headers: Record<string, string>; user?: unknown } = { headers: {} };
  if (authHeader) request.headers.authorization = authHeader;
  return {
    request,
    ctx: {
      getType: () => "http",
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
      { verifyAsync: vi.fn().mockResolvedValue({ sub: "u1", realm: "admin", sid: "s1" }) } as never,
      { user: { findUnique: vi.fn() } } as never,
      reflector as never,
      mockConfig as never
    );
    await expect(guard.canActivate(ctx as never)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects disabled accounts even with a valid JWT", async () => {
    const { ctx, reflector } = createContext("Bearer token", "admin");
    const guard = new AuthGuard({ verifyAsync: vi.fn().mockResolvedValue({ sub: "u1", realm: "admin", sid: "s1" }) } as never, { user: { findUnique: vi.fn().mockResolvedValue({ id: "u1", status: "blocked" }) } } as never, reflector as never, mockConfig as never);
    await expect(guard.canActivate(ctx as never)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects malformed verified claims without querying the database", async () => {
    const { ctx, reflector } = createContext("Bearer token", "admin");
    const findUnique=vi.fn();
    const guard=new AuthGuard({verifyAsync:vi.fn().mockResolvedValue({realm:"admin"})} as never,{user:{findUnique}} as never,reflector as never,mockConfig as never);
    await expect(guard.canActivate(ctx as never)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("does not turn database unavailability into an authentication failure", async () => {
    const { ctx, reflector } = createContext("Bearer token", "admin");
    const outage = new Error("DB temporarily unavailable");
    const guard = new AuthGuard(
      { verifyAsync: vi.fn().mockResolvedValue({sub:"u1",realm:"admin",sid:"s1"}) } as never,
      { user: { findUnique: vi.fn().mockRejectedValue(outage) } } as never,
      reflector as never, mockConfig as never
    );
    await expect(guard.canActivate(ctx as never)).rejects.toBe(outage);
  });

  it("attaches request.user for valid token", async () => {
    const { ctx, reflector, request } = createContext("Bearer token", "admin");
    const guard = new AuthGuard(
      { verifyAsync: vi.fn().mockResolvedValue({ sub: "u1", realm: "admin", sid: "s1" }) } as never,
      {
        session: { findFirst: vi.fn().mockResolvedValue({ id: "s1" }) },
        user: {
          findUnique: vi.fn().mockResolvedValue({
            id: "u1",
            status: "active",
            email: "admin@example.test",
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
