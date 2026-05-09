import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { REQUIRE_PERMISSION, REQUIRE_ROLE } from "./permission.decorator";
import { CaslAbilityFactory } from "./casl-ability.factory";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(CaslAbilityFactory) private readonly abilityFactory: CaslAbilityFactory
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const permission = this.reflector.getAllAndOverride<string>(REQUIRE_PERMISSION, [context.getHandler(), context.getClass()]);
    const role = this.reflector.getAllAndOverride<string>(REQUIRE_ROLE, [context.getHandler(), context.getClass()]);
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (role && !user?.roles?.includes(role)) throw new ForbiddenException({ message: "Missing role", code: "ROLE_DENIED" });
    if (permission) {
      const [subject, action] = permission.split(".");
      const ability = this.abilityFactory.createForUser(user ?? {});
      const hasRawPermission = user?.permissions?.includes(permission) || user?.permissions?.includes("*");
      const hasCaslPermission = subject && action ? ability.can(action as never, subject) : false;
      if (!hasRawPermission && !hasCaslPermission) {
        throw new ForbiddenException({ message: "Missing permission", code: "PERMISSION_DENIED", details: { permission } });
      }
    }
    return true;
  }
}
