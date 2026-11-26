import { Controller, Delete, ForbiddenException, Get, Inject, Patch, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../common/auth.guard";
import { RequireAuthRealm } from "../common/auth-realm.decorator";
import { AdminPluginsService } from "./admin-plugins.service";

@UseGuards(AuthGuard)
@RequireAuthRealm("admin")
@Controller("admin/plugins")
export class AdminPluginsController {
  constructor(@Inject(AdminPluginsService) private readonly plugins: AdminPluginsService) {}

  @Get()
  list() {
    return this.plugins.getState();
  }

  @Get("widgets")
  widgets() {
    return this.plugins.getDashboardWidgets();
  }

  // Plugin installation and manifest changes are deployment-operator actions.
  @Post()
  add() {
    throw new ForbiddenException("Install plugins during build or deployment");
  }

  @Patch(":id")
  patch() {
    throw new ForbiddenException("Configure plugins in the deployment manifest");
  }

  @Delete(":id")
  remove() {
    throw new ForbiddenException("Configure plugins in the deployment manifest");
  }
}
