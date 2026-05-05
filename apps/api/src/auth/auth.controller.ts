import { Body, Controller, Get, Inject, Post, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { DEFAULT_AUTH_REALM } from "@openadminjs/permissions";
import { AuthGuard } from "../common/auth.guard";
import type { RequestUser } from "../common/auth.guard";
import { RequireAuthRealm } from "../common/auth-realm.decorator";
import { CurrentUser } from "../common/current-user.decorator";
import { AuthService } from "./auth.service";
import { ForgotPasswordDto, LoginDto, RefreshDto, ResetPasswordDto, VerifyEmailDto } from "./auth.dto";

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post("login")
  login(@Body() dto: LoginDto, @Req() req: Request & { ip?: string; headers: Record<string, string> }) {
    const realm = dto.realm ?? DEFAULT_AUTH_REALM;
    return this.auth.login(
      dto.email,
      dto.password,
      {
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"]
      },
      realm
    );
  }

  @Post("refresh")
  refresh(@Body() dto: RefreshDto) {
    const realm = dto.realm ?? DEFAULT_AUTH_REALM;
    return this.auth.refresh(dto.refreshToken, realm);
  }

  @UseGuards(AuthGuard)
  @Post("logout")
  logout(@CurrentUser() user: { id: string }, @Req() req: Request & { ip?: string; headers: Record<string, string> }) {
    return this.auth.logout(user.id, { ipAddress: req.ip, userAgent: req.headers["user-agent"] });
  }

  @UseGuards(AuthGuard)
  @Get("me")
  me(@CurrentUser() user: RequestUser) {
    return this.auth.me(user.id, user.realm);
  }

  /** Cross-realm role summary (admin JWT only — avoids leaking admin role names to storefront tokens). */
  @UseGuards(AuthGuard)
  @RequireAuthRealm("admin")
  @Get("me/realms")
  membership(@CurrentUser() user: RequestUser) {
    return this.auth.membershipSummary(user.id);
  }

  @Post("password/forgot")
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto.email);
  }

  @Post("password/reset")
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.password);
  }

  @Post("email/verify")
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.auth.verifyEmail(dto.token);
  }
}
