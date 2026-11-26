import { Body, Controller, ForbiddenException, Get, Inject, Post, Put, UseGuards, BadRequestException } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AuthGuard } from "../common/auth.guard";
import { RequireAuthRealm } from "../common/auth-realm.decorator";
import { CurrentUser } from "../common/current-user.decorator";
import { SafeAiService } from "./safe-ai.service";

type User={permissions:string[]};
const requirePermission=(user:User,p:string)=>{if(!user.permissions.includes("*")&&!user.permissions.includes(p))throw new ForbiddenException("Missing permission");};

@UseGuards(AuthGuard)
@RequireAuthRealm("admin")
@Controller("admin/ai")
export class AdminAiController {
  constructor(@Inject(SafeAiService) private readonly ai:SafeAiService){}
  @Get("status")
  status(@CurrentUser() user:User){return {enabled:this.ai.enabled()&&(user.permissions.includes("*")||user.permissions.includes("ai.chat"))};}
  @Get("config")
  config(@CurrentUser() user:User){requirePermission(user,"ai.config.read");return this.ai.config();}
  @Put("config")
  updateConfig(@CurrentUser() user:User){requirePermission(user,"ai.config.update");throw new ForbiddenException("Provider and credentials are managed by the deployment operator");}
  @Throttle({default:{limit:8,ttl:60000}})
  @Post("chat")
  chat(@CurrentUser() user:User,@Body() body:unknown){
    requirePermission(user,"ai.chat");
    if(!body||typeof body!=="object"||Array.isArray(body)||Object.keys(body).some(k=>k!=="message"))throw new BadRequestException("Only a message is accepted");
    return this.ai.chat((body as {message?:unknown}).message);
  }
}
