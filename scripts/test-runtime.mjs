import assert from "node:assert/strict";
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
const dir=resolve(process.argv[2]||"runtime-artifacts");
const manifest=JSON.parse(readFileSync(join(dir,"runtime-manifest.json"),"utf8"));
const cwd=mkdtempSync(join(tmpdir(),"oajs-runtime-"));
try{
 const dependencies={};
 for(const [name,entry] of Object.entries(manifest)){
  const archive=join(dir,entry.archive);
  assert.equal(createHash("sha256").update(readFileSync(archive)).digest("hex"),entry.sha256);
  dependencies[name]="file:"+archive;
 }
 writeFileSync(join(cwd,"package.json"),JSON.stringify({private:true,type:"module",dependencies}));
 const install=spawnSync("npm",["install","--ignore-scripts","--no-audit","--no-fund"],{cwd,stdio:"inherit"});
 assert.equal(install.status,0);
 writeFileSync(join(cwd,"smoke.mjs"),`import assert from "node:assert/strict";
import {defineResource} from "@openadminjs/core";
import {safeData,sanitizeRecord,buildWhere} from "@openadminjs/nest";
import {can} from "@openadminjs/permissions";
import {loadDensity} from "@openadminjs/admin-client";
import {LocalStorage} from "@openadminjs/storage";
import {composeSchema} from "@openadminjs/prisma";
const r=defineResource({name:"things",label:"Things",model:"thing",permissions:{read:"things.read"},fields:{id:{type:"id"},name:{type:"text",searchable:true},passwordHash:{type:"password"}}});
const user={id:"u",permissions:["things.read"]};
assert(can(user.permissions,"things.read"));
assert.deepEqual(safeData(r,{name:"ok"},"create",user),{name:"ok"});
assert.deepEqual(sanitizeRecord(r,{id:"1",name:"x",passwordHash:"secret"},user),{id:"1",name:"x"});
assert(buildWhere(r,{search:"x"},user));
assert.equal(loadDensity("things"),"comfortable");
assert.equal(typeof LocalStorage,"function");
assert(composeSchema({provider:"sqlite",modules:["core"]}).includes("model Session"));
for(const name of Object.keys(${JSON.stringify(manifest)}))await import(name);
console.log("Independent npm runtime consumer passed");
`);
 const result=spawnSync(process.execPath,["smoke.mjs"],{cwd,stdio:"inherit"});assert.equal(result.status,0);
}finally{rmSync(cwd,{recursive:true,force:true});}
