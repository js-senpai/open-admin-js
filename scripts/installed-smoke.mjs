import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, open } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const cwd = process.argv[2];
assert(cwd, "Provide generated project directory");
const password = process.env.QA_ADMIN_PASSWORD;
assert(password, "QA_ADMIN_PASSWORD missing");
const email = "admin@example.test";
const api = "http://localhost:4000";
const admin = "http://localhost:3000";
const out = join(process.env.RUNNER_TEMP || cwd, "smoke-results");
await mkdir(out, { recursive: true });
const log = await open(join(out, "runtime.log"), "w");
const child = spawn("pnpm", ["start"], { cwd, detached: true, stdio: ["ignore", log.fd, log.fd] });
let browser;
async function waitFor(url) {
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) throw new Error("Production servers exited");
    try { const r = await fetch(url, { signal: AbortSignal.timeout(3000) }); if (r.ok) return; } catch {}
    await delay(2000);
  }
  throw new Error("Server did not become ready: " + url);
}
async function request(path, method = "GET", body, token) {
  const r = await fetch(api + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await r.json().catch(() => null);
  return { status: r.status, ok: r.ok, data };
}
try {
  await waitFor(api + "/health");
  await waitFor(admin + "/login");
  assert.equal((await request("/admin/resources")).status, 401);
  const login = await request("/auth/login", "POST", { email, password, realm: "admin" });
  assert(login.ok, "Admin login failed: " + login.status);
  const { accessToken, refreshToken } = login.data;
  assert(accessToken && refreshToken);
  assert((await request("/admin/resources/posts", "GET", undefined, accessToken)).ok);
  const slug = "release-smoke-" + Date.now();
  const post = await request("/admin/resources/posts", "POST", { title: "Release smoke", slug, status: "draft" }, accessToken);
  assert(post.ok, "Create failed: " + post.status);
  const id = post.data.id ?? post.data.data?.id ?? post.data.record?.id;
  assert(id, "Create response has no ID");
  assert((await request("/admin/resources/posts/" + id, "PATCH", { title: "Updated" }, accessToken)).ok);
  assert((await request("/admin/resources/posts/" + id, "DELETE", undefined, accessToken)).ok);
  const uploaded = await request("/admin/resources/files/upload","POST",{filename:"smoke.txt",mimeType:"text/plain",contentBase64:Buffer.from("storage smoke").toString("base64")},accessToken);
  assert(uploaded.ok,"Upload failed: "+uploaded.status);
  const fileId=uploaded.data.id;
  assert(fileId);
  const downloaded=await fetch(api+"/admin/resources/files/"+fileId+"/download",{headers:{authorization:"Bearer "+accessToken}});
  assert(downloaded.ok && await downloaded.text()==="storage smoke","Private file roundtrip failed");
  assert.equal((await fetch(api+"/admin/resources/files/"+fileId+"/download")).status,401);
  assert((await request("/admin/resources/files/"+fileId,"DELETE",undefined,accessToken)).ok);
  const token=await request("/admin/resources/api-tokens","POST",{name:"smoke",scopes:["posts.read"]},accessToken);
  assert(token.ok && token.data.plainToken,"API key issuance failed");
  const key=token.data.plainToken;
  assert((await request("/admin/resources/posts","GET",undefined,key)).ok);
  assert(!(await request("/admin/resources/users","GET",undefined,key)).ok);
  assert(!(await request("/admin/resources/posts","POST",{title:"denied"},key)).ok);
  assert((await request("/admin/resources/api-tokens/"+token.data.id+"/actions/revoke","POST",{},accessToken)).ok);
  assert(!(await request("/admin/resources/posts","GET",undefined,key)).ok);
  const rotated = await request("/auth/refresh", "POST", { refreshToken, realm: "admin" });
  assert(rotated.ok, "Refresh failed: " + rotated.status);
  assert.notEqual(rotated.data.refreshToken, refreshToken);
  assert.equal((await request("/auth/refresh", "POST", { refreshToken, realm: "admin" })).status, 401);
  assert.equal((await request("/auth/me", "GET", undefined, rotated.data.accessToken)).status, 401);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({viewport:{width:1440,height:900}});
  await page.goto(admin + "/login");
  await page.screenshot({path:join(out,"login-desktop.png"),fullPage:true});
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(url => !url.pathname.startsWith("/login"), { timeout: 30000 });
  const cookies = (await page.context().cookies()).filter(c => ["oajs_at", "oajs_rt"].includes(c.name));
  assert.equal(cookies.length, 2);
  assert(cookies.every(c => c.httpOnly));
  assert(!(await page.evaluate(() => document.cookie)).includes("oajs_at="));
  assert((await page.request.get(admin + "/api/backend/admin/resources")).ok());
  assert.equal((await page.request.post(admin + "/api/backend/admin/resources/posts", { headers: { origin: "https://untrusted.example" }, data: {} })).status(), 403);
  await page.screenshot({ path: join(out, "admin.png"), fullPage: true });
  await page.goto(admin + "/resources/posts");
  await page.getByRole("heading",{name:"Posts",exact:true}).waitFor({state:"visible"});
  await page.getByText("No records found",{exact:true}).waitFor({state:"visible"});
  await page.screenshot({path:join(out,"resources-desktop.png"),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:join(out,"resources-mobile.png"),fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth + 1),"Mobile page overflows");
  assert((await page.request.post(admin + "/api/auth/logout", { headers: { origin: admin } })).ok());
  assert.equal((await page.request.get(admin + "/api/backend/admin/resources")).status(), 401);
  console.log("Installed tarball: HTTP CRUD, refresh replay, browser login, HttpOnly, CSRF, logout passed");
} finally {
  if (browser) await browser.close();
  try { process.kill(-child.pid, "SIGTERM"); } catch {}
  await log.close();
}
