import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { DEFAULT_AUTH_REALM } from "@openadminjs/permissions";
import { PrismaService } from "./prisma.service";
import { AUTH_REALM_KEY } from "./auth-realm.decorator";

export type RequestUser = {
  id: string;
  email?: string;
  name?: string | null;
  realm: string;
  roles: string[];
  permissions: string[];
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
    private readonly config: ConfigService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException({ message: "Missing access token", code: "AUTH_REQUIRED" });
    try {
      const jwtSecret = this.config.get<string>("JWT_SECRET")?.trim() ?? process.env.JWT_SECRET?.trim();
      const payload = await this.jwt.verifyAsync<{ sub: string; realm?: string }>(token, { secret: jwtSecret });
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
      if (!user) throw new UnauthorizedException({ message: "Invalid session", code: "AUTH_INVALID" });

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
        email: user.email,
        name: user.name,
        realm,
        roles: assignments.map((item) => item.role.name),
        permissions: assignments.flatMap((item) => item.role.permissions.map((p) => p.permission.name))
      } satisfies RequestUser;
      return true;
    } catch (e) {
      if (e instanceof ForbiddenException) throw e;
      throw new UnauthorizedException({ message: "Invalid access token", code: "AUTH_INVALID" });
    }
  }
}
