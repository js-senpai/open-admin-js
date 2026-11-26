import { Injectable, BadRequestException, ForbiddenException, BadGatewayException } from "@nestjs/common";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";

export function publicIPv4(ip:string){
  if(isIP(ip)!==4)return false;
  const [a,b,c]=ip.split(".").map(Number) as [number,number,number,number];
  return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===2||b===88&&c===99)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113);
}
const HOST="api.openai.com";
const PATH="/v1/chat/completions";
const LIMIT=1024*1024;
async function complete(token:string,model:string,message:string){
  const addresses=await lookup(HOST,{family:4,all:true});
  if(!addresses.length||addresses.some(x=>!publicIPv4(x.address)))throw new Error("Provider DNS denied");
  const address=addresses[0]!.address;
  const body=JSON.stringify({model,messages:[{role:"system",content:"You are a read-only OpenAdminJS documentation consultant. Explain concepts; never claim to have executed actions or accessed user data."},{role:"user",content:message}],max_completion_tokens:800});
  return new Promise<string>((resolve,reject)=>{
    const req=request({hostname:address,servername:HOST,path:PATH,method:"POST",headers:{host:HOST,authorization:"Bearer "+token,"content-type":"application/json","content-length":Buffer.byteLength(body)},timeout:20000},res=>{
      if(res.statusCode!==200){res.resume();reject(new Error("Provider response rejected"));return;}
      let size=0;const chunks:Buffer[]=[];
      res.on("data",(chunk:Buffer)=>{size+=chunk.length;if(size>LIMIT){req.destroy(new Error("Provider response too large"));return;}chunks.push(chunk);});
      res.on("end",()=>{try{const data=JSON.parse(Buffer.concat(chunks).toString("utf8")) as {choices?:{message?:{content?:string}}[]};const text=data.choices?.[0]?.message?.content;if(typeof text!=="string")throw Error("Missing text");resolve(text);}catch(e){reject(e);}});
      res.on("error",reject);
    });
    const timer=setTimeout(()=>req.destroy(new Error("Provider deadline exceeded")),25000);
    req.on("close",()=>clearTimeout(timer));req.on("timeout",()=>req.destroy(new Error("Provider timeout")));req.on("error",reject);req.end(body);
  });
}
@Injectable()
export class SafeAiService {
  enabled(){return process.env.OPENADMIN_AI_ENABLED==="1"&&Boolean(process.env.OPENAI_API_KEY?.trim());}
  config(){return {enabled:this.enabled(),provider:"openai",model:process.env.OPENADMIN_AI_MODEL||"gpt-4o-mini",credentialConfigured:Boolean(process.env.OPENAI_API_KEY)};}
  async chat(raw:unknown){
    if(!this.enabled())throw new ForbiddenException("AI is disabled");
    if(typeof raw!=="string"||!raw.trim()||raw.length>8000)throw new BadRequestException("Message must contain 1–8000 characters");
    const model=process.env.OPENADMIN_AI_MODEL||"gpt-4o-mini";
    if(!/^[a-zA-Z0-9._-]{1,100}$/.test(model))throw new BadRequestException("Invalid model configuration");
    try{return {reply:await complete(process.env.OPENAI_API_KEY!,model,raw.trim()),actionResult:null,requiresConfirmation:false};}
    catch{throw new BadGatewayException("AI provider unavailable");}
  }
}
