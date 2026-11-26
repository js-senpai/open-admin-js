import { BadRequestException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac,timingSafeEqual } from "node:crypto";
import * as oidc from "openid-client";
import { AuthService } from "./auth.service";

type Transaction={verifier:string;state:string;nonce:string;expiresAt:number};
const fail=()=>new UnauthorizedException({message:"OIDC authentication failed",code:"OIDC_INVALID"});
@Injectable()
export class SsoOidcService {
  constructor(@Inject(ConfigService) private readonly config:ConfigService,@Inject(AuthService) private readonly auth:AuthService){}
  private env(name:string){return this.config.get<string>(name)?.trim()||"";}
  private issuer(){return this.env("OIDC_ISSUER")||(this.env("OIDC_PROVIDER")==="google"?"https://accounts.google.com":"");}
  isEnabled(){return this.env("OPENADMIN_OIDC_ENABLED")==="1"&&Boolean(this.issuer()&&this.env("OIDC_CLIENT_ID")&&this.env("OIDC_CLIENT_SECRET")&&this.env("OIDC_REDIRECT_URI")&&this.env("JWT_SECRET"));}
  private settings(){
    if(!this.isEnabled())throw new BadRequestException({message:"OIDC is disabled",code:"OIDC_DISABLED"});
    const issuer=new URL(this.issuer()),redirect=new URL(this.env("OIDC_REDIRECT_URI"));
    if(issuer.protocol!=="https:"||issuer.username||issuer.password||issuer.hash||issuer.search||redirect.pathname!=="/api/auth/oidc/callback"||redirect.hash||redirect.search||redirect.username||redirect.password||!(redirect.protocol==="https:"||(process.env.NODE_ENV!=="production"&&redirect.protocol==="http:"&&["localhost","127.0.0.1"].includes(redirect.hostname))))throw new BadRequestException("Invalid OIDC configuration");
    const allowed=this.env("ADMIN_ORIGIN").split(",").map(x=>x.trim()).filter(Boolean);
    if(allowed.length&&!allowed.includes(redirect.origin))throw new BadRequestException("OIDC redirect origin not allowed");
    return {issuer,redirect};
  }
  private async discovery(issuer:URL){
    return oidc.discovery(issuer,this.env("OIDC_CLIENT_ID"),this.env("OIDC_CLIENT_SECRET"),oidc.ClientSecretPost(this.env("OIDC_CLIENT_SECRET")),{timeout:10,execute:[oidc.enableNonRepudiationChecks]});
  }
  private seal(value:Transaction){
    const body=Buffer.from(JSON.stringify(value)).toString("base64url");
    return body+"."+createHmac("sha256",this.env("JWT_SECRET")).update("oidc-v2:"+body).digest("base64url");
  }
  private unseal(raw:string,state:string):Transaction{
    try{
      if(raw.length>4096||state.length>256)throw fail();
      const [body,sig,extra]=raw.split(".");
      if(!body||!sig||extra!==undefined)throw fail();
      const expected=createHmac("sha256",this.env("JWT_SECRET")).update("oidc-v2:"+body).digest();
      const actual=Buffer.from(sig,"base64url");
      if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw fail();
      const t=JSON.parse(Buffer.from(body,"base64url").toString()) as Transaction;
      if(t.state!==state||!t.verifier||!t.nonce||!Number.isFinite(t.expiresAt)||t.expiresAt<=Date.now())throw fail();
      return t;
    }catch{throw fail();}
  }
  async startLogin(){
    const {issuer,redirect}=this.settings();
    const config=await this.discovery(issuer);
    const transaction={verifier:oidc.randomPKCECodeVerifier(),state:oidc.randomState(),nonce:oidc.randomNonce(),expiresAt:Date.now()+600000};
    const url=oidc.buildAuthorizationUrl(config,{redirect_uri:redirect.href,scope:"openid email profile",state:transaction.state,nonce:transaction.nonce,code_challenge:await oidc.calculatePKCECodeChallenge(transaction.verifier),code_challenge_method:"S256"});
    return {authorizeUrl:url.href,transaction:this.seal(transaction)};
  }
  async handleCallback(code:string,state:string,transaction:string,iss?:string){
    const {issuer,redirect}=this.settings();
    const t=this.unseal(transaction,state);
    try{
      const config=await this.discovery(issuer);
      const callback=new URL(redirect.href);
      callback.searchParams.set("code",code);callback.searchParams.set("state",state);
      if(iss)callback.searchParams.set("iss",iss);
      const result=await oidc.authorizationCodeGrant(config,callback,{expectedState:t.state,expectedNonce:t.nonce,pkceCodeVerifier:t.verifier,idTokenExpected:true});
      const claims=result.claims();
      if(!claims||!claims.sub||!claims.iss||typeof claims.email!=="string"||claims.email_verified!==true)throw fail();
      return await this.auth.loginWithOidcProfile({sub:claims.sub,issuer:claims.iss,email:claims.email,name:typeof claims.name==="string"?claims.name:null},{}, "admin");
    }catch{throw fail();}
  }
}
