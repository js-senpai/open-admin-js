import {NextRequest,NextResponse} from "next/server";
import {API_URL} from "../../../../../lib/server-api";
export async function GET(req:NextRequest){
 const origin=(process.env.ADMIN_ORIGIN||req.nextUrl.origin).split(",")[0]!.trim();
 const failed=()=>NextResponse.redirect(new URL("/login?sso_error=1",origin));
 const r=await fetch(API_URL+"/auth/sso/oidc/start",{method:"POST",cache:"no-store",redirect:"error"}).catch(()=>null);
 if(!r?.ok)return failed();
 const data=await r.json().catch(()=>({}));if(typeof data.authorizeUrl!=="string"||typeof data.transaction!=="string")return failed();
 const url=new URL(data.authorizeUrl);if(url.protocol!=="https:")return failed();
 const res=NextResponse.redirect(url);res.cookies.set("oajs_oidc",data.transaction,{path:"/api/auth/oidc",httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",maxAge:600});res.headers.set("cache-control","no-store");return res;
}
