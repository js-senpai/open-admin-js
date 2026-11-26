import {afterEach,describe,expect,it,vi} from "vitest";
import {NextRequest} from "next/server";
import {POST} from "./route";
const req=()=>new NextRequest("http://localhost:3000/api/auth/refresh",{method:"POST",headers:{origin:"http://localhost:3000",cookie:"oajs_rt=test-refresh"}});
describe("BFF refresh cookies",()=>{
 afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
 it.each([429,500,503])("preserves cookies when upstream returns %s",async status=>{
  vi.stubEnv("ADMIN_ORIGIN","http://localhost:3000");
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response("{}",{status})));
  const result=await POST(req());
  expect(result.status).toBe(status===429?429:502);
  expect(result.headers.get("set-cookie")).toBeNull();
 });
 it("clears both cookies only on confirmed denial",async()=>{
  vi.stubEnv("ADMIN_ORIGIN","http://localhost:3000");
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response("{}",{status:401})));
  const result=await POST(req());
  expect(result.status).toBe(401);
  expect(result.cookies.get("oajs_at")?.maxAge).toBe(0);
  expect(result.cookies.get("oajs_rt")?.maxAge).toBe(0);
 });
 it("sets HttpOnly cookies without returning credentials",async()=>{
  vi.stubEnv("ADMIN_ORIGIN","http://localhost:3000");
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({accessToken:"new-at",refreshToken:"new-rt"}),{status:200})));
  const result=await POST(req());
  expect(await result.json()).toEqual({ok:true});
  expect(result.cookies.get("oajs_at")?.httpOnly).toBe(true);
  expect(result.cookies.get("oajs_at")?.maxAge).toBe(900);
  expect(result.cookies.get("oajs_rt")?.httpOnly).toBe(true);
 });
});
