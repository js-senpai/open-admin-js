import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../common/auth.guard";
import { RequireAuthRealm } from "../common/auth-realm.decorator";
import { AppLoggerService } from "../common/app-logger.service";

@UseGuards(AuthGuard)
@RequireAuthRealm("admin")
@Controller("admin/logs")
export class AdminLogsController {
  constructor(@Inject(AppLoggerService) private readonly logs: AppLoggerService) {}

  @Get()
  list(
    @Query("level") level: "info" | "error" | undefined,
    @Query("search") search: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Query("page") page: string | undefined,
    @Query("limit") limit: string | undefined
  ) {
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

