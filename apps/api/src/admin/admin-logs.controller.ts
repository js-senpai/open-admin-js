import { Controller, Get, Inject, Query, UseGuards, ForbiddenException } from "@nestjs/common";
import { AuthGuard } from "../common/auth.guard";
import { RequireAuthRealm } from "../common/auth-realm.decorator";
import { CurrentUser } from "../common/current-user.decorator";
import { AppLoggerService } from "../common/app-logger.service";

@UseGuards(AuthGuard)
@RequireAuthRealm("admin")
@Controller("admin/logs")
export class AdminLogsController {
  constructor(@Inject(AppLoggerService) private readonly logs: AppLoggerService) {}

  @Get()
  list(
    @CurrentUser() user: {permissions:string[]},
    @Query("level") level: "info" | "error" | undefined,
    @Query("search") search: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Query("page") page: string | undefined,
    @Query("limit") limit: string | undefined
  ) {
    if (!user.permissions.includes("*") && !user.permissions.includes("system-logs.read")) throw new ForbiddenException("Missing permission");
    return this.logs.query({
      level,
      search,
      from,
      to,
      page: Number(page ?? 1),
      limit: Number(limit ?? 50)
    });
  }
}

