import { Body,Controller,Get,Post,Inject,BadRequestException } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { SsoOidcService } from "./sso-oidc.service";
@Controller("auth/sso/oidc")
export class SsoOidcController {
 constructor(@Inject(SsoOidcService) private readonly service:SsoOidcService){}
 @Get("status") status(){return {enabled:this.service.isEnabled()};}
 @Throttle({default:{limit:10,ttl:60000}})
 @Post("start") start(){return this.service.startLogin();}
 @Throttle({default:{limit:10,ttl:60000}})
 @Post("exchange") exchange(@Body() body:Record<string,unknown>){
  const {code,state,transaction,iss}=body??{};
  if(typeof code!=="string"||!code||code.length>4096||typeof state!=="string"||!state||state.length>256||typeof transaction!=="string"||transaction.length>4096||(iss!==undefined&&typeof iss!=="string"))throw new BadRequestException("Invalid OIDC callback");
  return this.service.handleCallback(code,state,transaction,iss as string|undefined);
 }
}
