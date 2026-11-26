import {describe,it,expect,vi} from "vitest";
import {SsoOidcService} from "./sso-oidc.service";
const values={OPENADMIN_OIDC_ENABLED:"1",OIDC_ISSUER:"https://issuer.example.test",OIDC_CLIENT_ID:"client",OIDC_CLIENT_SECRET:"secret",OIDC_REDIRECT_URI:"https://admin.example.test/api/auth/oidc/callback",ADMIN_ORIGIN:"https://admin.example.test",JWT_SECRET:"test-only-secret"};
function service(extra:Record<string,string>={}){
 const auth={loginWithOidcProfile:vi.fn()};
 const config={get:(name:string)=>({...values,...extra} as Record<string,string>)[name]};
 return {auth,service:new SsoOidcService(config as never,auth as never)};
}
describe("OIDC fail-closed",()=>{
 it("requires explicit opt-in",()=>expect(service({OPENADMIN_OIDC_ENABLED:"0"}).service.isEnabled()).toBe(false));
 it("rejects non-TLS issuer",async()=>await expect(service({OIDC_ISSUER:"http://issuer.example.test"}).service.startLogin()).rejects.toThrow("Invalid OIDC configuration"));
 it("rejects callback on foreign origin",async()=>await expect(service({OIDC_REDIRECT_URI:"https://foreign.example.test/api/auth/oidc/callback"}).service.startLogin()).rejects.toThrow("OIDC redirect origin not allowed"));
 it("rejects forged or missing transaction before provider exchange",async()=>{
  const s=service();await expect(s.service.handleCallback("code","state","fake.sig")).rejects.toThrow("OIDC authentication failed");expect(s.auth.loginWithOidcProfile).not.toHaveBeenCalled();
 });
});
