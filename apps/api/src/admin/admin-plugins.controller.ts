import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../common/auth.guard";
import { RequireAuthRealm } from "../common/auth-realm.decorator";
import { AddPluginDto, PatchPluginDto } from "./dto/plugins.dto";
import { AdminPluginsService } from "./admin-plugins.service";

@UseGuards(AuthGuard)
@RequireAuthRealm("admin")
@Controller("admin/plugins")
export class AdminPluginsController {
  constructor(private readonly plugins: AdminPluginsService) {}

  @Get()
  list() {
    return this.plugins.getState();
  }

  @Post()
  add(@Body() dto: AddPluginDto) {
    return this.plugins.add(dto);
  }

  @Patch(":id")
  patch(@Param("id") id: string, @Body() dto: PatchPluginDto) {
    return this.plugins.patch(id, dto);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.plugins.remove(id);
  }
}
