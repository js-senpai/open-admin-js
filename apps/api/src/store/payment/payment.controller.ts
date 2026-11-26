import { Body,Controller,Get,Post,Param,Query,Headers,Inject,Req,UseGuards,ForbiddenException,BadRequestException } from "@nestjs/common";
import type { RawBodyRequest } from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "../../common/auth.guard";
import { CurrentUser } from "../../common/current-user.decorator";
import { RequireAuthRealm } from "../../common/auth-realm.decorator";
import { PaymentService } from "./payment.service";
type User={id:string;email?:string;permissions:string[]};
const requirePermission=(u:User,p:string)=>{if(!u.permissions.includes(p)&&!u.permissions.includes("*"))throw new ForbiddenException("Missing permission");};
@Controller("store")
export class PaymentController {
 constructor(@Inject(PaymentService) private readonly payments:PaymentService){}
 @Get("products") products(){return this.payments.listProducts();}
 @UseGuards(AuthGuard) @RequireAuthRealm("public") @Post("checkout")
 checkout(@Body() body:unknown,@CurrentUser() user:User){requirePermission(user,"public.orders.create");return this.payments.createCheckout(body,user);}
 @UseGuards(AuthGuard) @RequireAuthRealm("public") @Get("orders/:id/status")
 status(@Param("id") id:string,@CurrentUser() user:User){requirePermission(user,"public.orders.read_own");return this.payments.getOrderStatus(id,user.id);}
 @Post("webhook/:provider")
 webhook(@Param("provider") provider:string,@Headers("stripe-signature") signature:string|undefined,@Req() req:RawBodyRequest<Request>){if(!req.rawBody||!signature)throw new BadRequestException("Missing signature or raw body");return this.payments.handleWebhook(provider,req.rawBody,signature);}
 @UseGuards(AuthGuard) @RequireAuthRealm("public") @Get("orders")
 orders(@CurrentUser() user:User,@Query("page") page?:string,@Query("limit") limit?:string){requirePermission(user,"public.orders.read_own");return this.payments.getUserOrders(user.id,Number(page??1),Number(limit??20));}
}
