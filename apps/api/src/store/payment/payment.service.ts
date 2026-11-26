import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import Stripe from "stripe";
import { PrismaService } from "../../common/prisma.service";

const hash=(x:string)=>createHash("sha256").update(x).digest("hex");
type Buyer={id:string;email?:string};
type Line={productId:string;quantity:number};

export function parseCheckout(body:unknown):{items:Line[];key:string}{
 if(!body||typeof body!=="object"||Array.isArray(body))throw new BadRequestException("Invalid checkout");
 const data=body as Record<string,unknown>;
 if(Object.keys(data).some(k=>!["items","idempotencyKey"].includes(k))||typeof data.idempotencyKey!=="string"||!/^[a-zA-Z0-9_-]{16,80}$/.test(data.idempotencyKey)||!Array.isArray(data.items)||!data.items.length||data.items.length>50)throw new BadRequestException("Invalid checkout items or idempotency key");
 const seen=new Set<string>();const items:Line[]=[];
 for(const item of data.items){
  if(!item||typeof item!=="object"||Object.keys(item).some(k=>!["productId","quantity"].includes(k))||typeof item.productId!=="string"||!item.productId||item.productId.length>128||seen.has(item.productId)||!Number.isSafeInteger(item.quantity)||item.quantity<1||item.quantity>100)throw new BadRequestException("Invalid product or quantity");
  seen.add(item.productId);items.push({productId:item.productId,quantity:item.quantity});
 }
 return {items:items.sort((a,b)=>a.productId.localeCompare(b.productId)),key:data.idempotencyKey};
}
@Injectable()
export class PaymentService {
 constructor(@Inject(PrismaService) private readonly prisma:PrismaService){}
 private stripe(){
  // Test-mode only until provider reconciliation has passed end-to-end acceptance.
  const key=process.env.STRIPE_SECRET_KEY;
  if(process.env.OPENADMIN_COMMERCE_ENABLED!=="1"||!key?.startsWith("sk_test_")||!process.env.STRIPE_WEBHOOK_SECRET)throw new ForbiddenException("Commerce test profile is disabled");
  return new Stripe(key,{apiVersion:"2025-02-24.acacia",timeout:15000,maxNetworkRetries:1});
 }
 private redirectUrl(name:string){
  let url:URL;
  try{url=new URL(process.env[name]??"");}catch{throw new ServiceUnavailableException("Checkout redirect is not configured");}
  if(url.protocol!=="https:"||url.username||url.password)throw new ServiceUnavailableException("Checkout redirect must use HTTPS");
  return url.toString();
 }
 async createCheckout(body:unknown,buyer:Buyer){
  const stripe=this.stripe(),success_url=this.redirectUrl("CHECKOUT_SUCCESS_URL"),cancel_url=this.redirectUrl("CHECKOUT_CANCEL_URL");
  const {items,key}=parseCheckout(body);
  const checkoutKey=hash(buyer.id+":"+key),requestHash=hash(JSON.stringify(items));
  let order=await this.prisma.order.findUnique({where:{checkoutKey},include:{items:true}});
  if(!order){
   try{
    order=await this.prisma.$transaction(async tx=>{
     const products=await tx.product.findMany({where:{id:{in:items.map(i=>i.productId)},active:true}});
     if(products.length!==items.length)throw new BadRequestException("Product unavailable");
     const currency=products[0]!.currency.toUpperCase();
     if(!/^[A-Z]{3}$/.test(currency)||products.some(p=>p.currency.toUpperCase()!==currency||!Number.isSafeInteger(p.price)||p.price<=0))throw new BadRequestException("Incompatible price or currency");
     const lines=items.map(i=>{const p=products.find(p=>p.id===i.productId)!;return {productId:p.id,name:p.name,price:p.price,quantity:i.quantity};});
     const total=lines.reduce((s,x)=>s+x.price*x.quantity,0);
     if(!Number.isSafeInteger(total)||total>2147483647)throw new BadRequestException("Order total too large");
     return tx.order.create({data:{userId:buyer.id,email:buyer.email,currency,total,checkoutKey,checkoutRequestHash:requestHash,items:{create:lines}},include:{items:true}});
    });
   }catch(e){if(!(e instanceof Prisma.PrismaClientKnownRequestError)||e.code!=="P2002")throw e;order=await this.prisma.order.findUnique({where:{checkoutKey},include:{items:true}});}
  }
  if(!order||order.checkoutRequestHash!==requestHash)throw new ConflictException("Idempotency key was used for another cart");
  if(order.status!=="pending")throw new ConflictException("Order is not pending");
  // Never create another provider session after one has been persisted.
  if(order.checkoutSessionId){
   const existing=await stripe.checkout.sessions.retrieve(order.checkoutSessionId);
   if(existing.status!=="open"||!existing.url)throw new ConflictException("Checkout is no longer open");
   return {orderId:order.id,checkoutUrl:existing.url};
  }
  // Stripe retains idempotency keys for at least 24h. Do not retry ambiguous old requests.
  if(Date.now()-order.createdAt.getTime()>3600000)throw new ConflictException("Checkout requires reconciliation");
  const session=await stripe.checkout.sessions.create({mode:"payment",payment_method_types:["card"],line_items:order.items.map(i=>({quantity:i.quantity,price_data:{currency:order!.currency.toLowerCase(),unit_amount:i.price,product_data:{name:i.name}}})),success_url,cancel_url,customer_email:order.email??undefined,metadata:{orderId:order.id},payment_intent_data:{metadata:{orderId:order.id}}},{idempotencyKey:"checkout-"+order.id});
  if(!session.url)throw new ServiceUnavailableException("Payment session unavailable");
  await this.prisma.order.updateMany({where:{id:order.id,status:"pending",checkoutSessionId:null},data:{checkoutSessionId:session.id}});
  return {orderId:order.id,checkoutUrl:session.url};
 }
 async handleWebhook(provider:string,raw:Buffer,signature:string){
  const stripe=this.stripe();if(provider!=="stripe"||!signature||!raw.length)throw new BadRequestException("Invalid webhook");
  let event:Stripe.Event;try{event=stripe.webhooks.constructEvent(raw,signature,process.env.STRIPE_WEBHOOK_SECRET!);}catch{throw new BadRequestException("Invalid webhook signature");}
  if(event.livemode)throw new BadRequestException("Live payments disabled");
  try{await this.prisma.$transaction(async tx=>{
   await tx.webhookLog.create({data:{provider:"stripe",providerEventId:event.id,eventType:event.type,payload:{id:event.id},status:"processed"}});
   if(event.type==="checkout.session.completed"||event.type==="checkout.session.expired"){
    const session=event.data.object;
    const orderId=session.metadata?.orderId;if(!orderId)throw new BadRequestException("Missing order reference");
    const order=await tx.order.findUnique({where:{id:orderId}});
    if(!order||!order.checkoutSessionId)throw new ServiceUnavailableException("Checkout not reconciled yet");
    if(order.checkoutSessionId!==session.id||session.amount_total!==order.total||session.currency?.toUpperCase()!==order.currency)throw new BadRequestException("Payment details mismatch");
    if(event.type==="checkout.session.expired"){await tx.order.updateMany({where:{id:order.id,status:"pending"},data:{status:"cancelled"}});return;}
    if(session.payment_status!=="paid"||typeof session.payment_intent!=="string")throw new BadRequestException("Payment not completed");
    const changed=await tx.order.updateMany({where:{id:order.id,status:"pending"},data:{status:"paid",paymentIntentId:session.payment_intent}});
    if(changed.count)await tx.transaction.create({data:{orderId:order.id,provider:"stripe",providerTxId:session.payment_intent,status:"succeeded",amount:order.total,currency:order.currency}});
   }else if(event.type==="charge.refunded"){
    const charge=event.data.object;if(typeof charge.payment_intent!=="string")return;
    const order=await tx.order.findUnique({where:{paymentIntentId:charge.payment_intent}});
    if(!order)return;
    if(charge.amount_refunded!==order.total||charge.currency.toUpperCase()!==order.currency)return;
    const updated=await tx.order.updateMany({where:{id:order.id,status:{in:["paid","refund_pending"]}},data:{status:"refunded"}});
    if(updated.count)await tx.transaction.create({data:{orderId:order.id,provider:"stripe",providerTxId:charge.id,status:"refunded",amount:order.total,currency:order.currency}});
   }
  });}catch(e){if(e instanceof Prisma.PrismaClientKnownRequestError&&e.code==="P2002"&&await this.prisma.webhookLog.findUnique({where:{providerEventId:event.id}}))return {received:true,duplicate:true};throw e;}
  return {received:true};
 }
 async getOrderStatus(id:string,userId:string){
  const order=await this.prisma.order.findFirst({where:{id,userId},select:{id:true,status:true,total:true,currency:true,createdAt:true,items:{select:{name:true,price:true,quantity:true}}}});
  if(!order)throw new NotFoundException("Order not found");return order;
 }
 async getUserOrders(userId:string,page=1,limit=20){
  if(!Number.isSafeInteger(page)||page<1||page>100000||!Number.isSafeInteger(limit)||limit<1)throw new BadRequestException("Invalid pagination");limit=Math.min(limit,100);
  const [data,total]=await Promise.all([this.prisma.order.findMany({where:{userId},orderBy:{createdAt:"desc"},skip:(page-1)*limit,take:limit,select:{id:true,status:true,total:true,currency:true,createdAt:true}}),this.prisma.order.count({where:{userId}})]);
  return {data,meta:{page,limit,total,pages:Math.ceil(total/limit)||1}};
 }
 async refundOrder(id:string,actorId:string){
  const stripe=this.stripe();
  const order=await this.prisma.order.findUnique({where:{id}});
  if(!order||!order.paymentIntentId)throw new NotFoundException("Payment not found");
  if(order.status==="refunded")return {ok:true,status:"refunded"};
  if(order.status==="refund_pending")return {ok:true,status:"refund_pending"}; // reconciliation via signed webhook; no second submission
  const claimed=await this.prisma.$transaction(async tx=>{
   const change=await tx.order.updateMany({where:{id,status:"paid"},data:{status:"refund_pending"}});
   if(change.count)await tx.auditLog.create({data:{userId:actorId,resource:"orders",resourceId:id,action:"refund.requested"}});
   return change.count;
  });
  if(!claimed)throw new ConflictException("Order not refundable");
  try{
   const refund=await stripe.refunds.create({payment_intent:order.paymentIntentId,amount:order.total},{idempotencyKey:"refund-"+id});
   // Keep pending until signed full-refund confirmation. A failed or ambiguous provider
   // response requires operator reconciliation and cannot trigger another refund automatically.
   return {ok:true,status:"refund_pending",refundId:refund.id,providerStatus:refund.status};
  }catch{throw new ServiceUnavailableException("Refund pending reconciliation; do not submit another refund");}
 }
 async listProducts(active=true){
  return this.prisma.product.findMany({where:active?{active:true}:undefined,take:100,orderBy:{createdAt:"desc"},select:{id:true,name:true,slug:true,description:true,price:true,currency:true,imageUrl:true}});
 }
}
