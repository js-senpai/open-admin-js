import { Controller, Get, Inject, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../common/auth.guard";
import { RequireAuthRealm } from "../common/auth-realm.decorator";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermission } from "../common/permission.decorator";
import { CurrentUser } from "../common/current-user.decorator";
import { QueueService } from "./queue.service";

type UserContext = { id: string };

@Controller("jobs")
@UseGuards(AuthGuard, PermissionsGuard)
@RequireAuthRealm("admin")
export class QueueController {
  constructor(@Inject(QueueService) private readonly queue: QueueService) {}

  @Get("stats")
  @RequirePermission("jobs.read")
  stats() {
    return this.queue.getStats();
  }

  @Post("dispatch")
  @RequirePermission("jobs.dispatch")
  dispatch(@CurrentUser() user: UserContext) {
    return this.queue.dispatch(user.id);
  }
}
