import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { GqlExecutionContext } from "@nestjs/graphql";
import { JwtService } from "@nestjs/jwt";
import { createHash } from "node:crypto";
import { DEFAULT_AUTH_REALM } from "@openadminjs/permissions";
import { PrismaService } from "./prisma.service";
import { AUTH_REALM_KEY } from "./auth-realm.decorator";

export type RequestUser = {
  id: string;
  sessionId: string;
  email?: string;
  name?: string | null;
  realm: string;
  roles: string[];
  permissions: string[];
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(ConfigService) private readonly config: ConfigService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = this.getRequest(context);
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException({ message: "Missing access token", code: "AUTH_REQUIRED" });
    if (token.startsWith("oajs_")) return this.authenticateApiToken(context,request,token);
    const jwtSecret = this.config.get<string>("JWT_SECRET")?.trim() ?? process.env.JWT_SECRET?.trim();
    let payload: { sub: string; realm?: string; sid?: string };
    try {
      payload = await this.jwt.verifyAsync<{ sub: string; realm?: string; sid?: string }>(token, { secret: jwtSecret });
    } catch {
      throw new UnauthorizedException({ message: "Invalid access token", code: "AUTH_INVALID" });
    }
    if (!payload || typeof payload.sub !== "string" || !payload.sub || typeof payload.sid !== "string" || !payload.sid || (payload.realm !== undefined && typeof payload.realm !== "string")) {
      throw new UnauthorizedException({ message: "Invalid access token claims", code: "AUTH_INVALID" });
    }
    // Database/transport failures must propagate as server failures, not invalid credentials.
    // Otherwise the BFF could revoke a valid browser session during a DB outage.
    const realm = payload.realm ?? DEFAULT_AUTH_REALM;

    const requiredRealm = this.reflector.getAllAndOverride<string | undefined>(AUTH_REALM_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (requiredRealm !== undefined && requiredRealm !== realm) {
      throw new ForbiddenException({
        message: "Token was issued for a different application area",
        code: "AUTH_REALM_MISMATCH",
        details: { expected: requiredRealm, tokenRealm: realm }
      });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } }
    });
    if (!user || user.status !== "active") throw new UnauthorizedException({ message: "Invalid session", code: "AUTH_INVALID" });

    const session = await this.prisma.session.findFirst({ where: { id: payload.sid, userId: user.id, realm, revokedAt: null, expiresAt: { gt: new Date() } } });
    if (!session) throw new UnauthorizedException("Session revoked or expired");

    const assignments = user.roles.filter((ur) => ur.role.realm === realm);
    if (assignments.length === 0) {
      throw new ForbiddenException({
        message: "No roles for this application area",
        code: "AUTH_REALM_EMPTY",
        details: { realm }
      });
    }

    request.user = {
      id: user.id,
      sessionId: session.id,
      email: user.email,
      name: user.name,
      realm,
      roles: assignments.map((item) => item.role.name),
      permissions: assignments.flatMap((item) => item.role.permissions.map((p) => p.permission.name))
    } satisfies RequestUser;
    return true;
  }

  private async authenticateApiToken(context: ExecutionContext, request: {user?:RequestUser}, token:string) {
    const denied = () => new UnauthorizedException("Invalid API token");
    if (!/^oajs_[A-Za-z0-9_-]{43}$/.test(token) || context.getType() !== "http") throw denied();
    const req = context.switchToHttp().getRequest<{method:string;path:string}>();
    // Personal keys are intentionally read-only and cannot access auth, settings, jobs, AI or plugin APIs.
    if (req.method !== "GET" || !/^\/admin\/resources(?:\/|$)/.test(req.path) || req.path === "/admin/resources/overview") throw new ForbiddenException("API token route not allowed");
    const entry = await this.prisma.apiToken.findUnique({where:{tokenHash:createHash("sha256").update(token).digest("hex")},include:{user:{include:{roles:{include:{role:{include:{permissions:{include:{permission:true}}}}}}}}}});
    if (!entry || entry.revokedAt || entry.user.status !== "active" || !Array.isArray(entry.scopes)) throw denied();
    const live = entry.user.roles.filter(x=>x.role.realm==="admin").flatMap(x=>x.role.permissions.map(p=>p.permission.name));
    const permissions = entry.scopes.filter((x):x is string=>typeof x==="string" && x.endsWith(".read") && !["api-tokens.read","settings.read","audit-logs.read","users.read","jobs.read","webhook-logs.read"].includes(x) && (live.includes("*")||live.includes(x)));
    if (!permissions.length) throw denied();
    request.user={id:entry.userId,sessionId:entry.id,realm:"admin",email:entry.user.email,roles:[],permissions};
    return true;
  }

  private getRequest(context: ExecutionContext): {
    headers: { authorization?: string };
    user?: RequestUser;
    ip?: string;
  } {
    const type = context.getType<string>();
    if (type === "graphql") {
      const gql = GqlExecutionContext.create(context);
      return gql.getContext<{ req: { headers: { authorization?: string }; user?: RequestUser; ip?: string } }>().req;
    }
    return context.switchToHttp().getRequest();
  }
}
