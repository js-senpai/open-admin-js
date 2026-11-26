import {NextRequest,NextResponse} from "next/server";
import {API_URL} from "../../../../../lib/server-api";
import {TOKEN_COOKIE_AT,TOKEN_COOKIE_RT} from "../../../../../lib/tokens";
export async function GET(req:NextRequest){
 const origin=(process.env.ADMIN_ORIGIN||req.nextUrl.origin).split(",")[0]!.trim();
 const cookieOpts={httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax" as const,path:"/"};
 const transaction=req.cookies.get("oajs_oidc")?.value;
 const q=req.nextUrl.searchParams;
 let data:{accessToken?:string;refreshToken?:string}={};
 if(transaction&&q.getAll("code").length===1&&q.getAll("state").length===1&&!q.has("error")){
  const r=await fetch(API_URL+"/auth/sso/oidc/exchange",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({transaction,code:q.get("code"),state:q.get("state"),iss:q.get("iss")||undefined}),cache:"no-store",redirect:"error"}).catch(()=>null);
  if(r?.ok)data=await r.json().catch(()=>({}));
 }
 const ok=typeof data.accessToken==="string"&&typeof data.refreshToken==="string";
 const res=NextResponse.redirect(new URL(ok?"/dashboard":"/login?sso_error=1",origin));
 res.cookies.set("oajs_oidc","",{...cookieOpts,path:"/api/auth/oidc",maxAge:0});
 if(ok){res.cookies.set(TOKEN_COOKIE_AT,data.accessToken!,{...cookieOpts,maxAge:900});res.cookies.set(TOKEN_COOKIE_RT,data.refreshToken!,{...cookieOpts,maxAge:604800});}
 res.headers.set("cache-control","no-store");res.headers.set("referrer-policy","no-referrer");return res;
}
