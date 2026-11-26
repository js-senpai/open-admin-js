import { Controller, Get, ForbiddenException } from "@nestjs/common";

@Controller("auth/sso/oidc")
export class SsoOidcController {
  @Get("status")
  status() { return { enabled: false }; }

  @Get("login")
  login() { throw new ForbiddenException({ message: "OIDC is disabled pending verification and server-side session exchange", code: "OIDC_DISABLED" }); }

  @Get("callback")
  callback() { throw new ForbiddenException({ message: "OIDC is disabled", code: "OIDC_DISABLED" }); }
}
