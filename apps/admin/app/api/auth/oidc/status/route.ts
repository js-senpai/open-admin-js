import {NextResponse} from "next/server";
import {API_URL} from "../../../../../lib/server-api";
export async function GET(){
 const r=await fetch(API_URL+"/auth/sso/oidc/status",{cache:"no-store",redirect:"error"}).catch(()=>null);
 const data=r?.ok?await r.json().catch(()=>({})):{};return NextResponse.json({enabled:data.enabled===true},{headers:{"cache-control":"no-store"}});
}
