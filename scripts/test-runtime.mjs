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
  if(!/^@openadminjs\/[a-z-]+$/.test(name)||!/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/.test(entry.version)||entry.archive!==name.slice(1).replace("/","-")+"-"+entry.version+".tgz")throw Error("Invalid runtime archive manifest");
  const archive=join(dir,entry.archive);
  assert.equal(createHash("sha256").update(readFileSync(archive)).digest("hex"),entry.sha256);
  dependencies[name]="file:"+archive;
 }
 writeFileSync(join(cwd,"package.json"),JSON.stringify({private:true,type:"module",dependencies}));
 const install=spawnSync("npm",["install","--ignore-scripts","--no-audit","--no-fund"],{cwd,stdio:"inherit"});
 assert.equal(install.status,0);
 writeFileSync(join(cwd,"smoke.mjs"),readFileSync(new URL("./runtime-consumer.mjs",import.meta.url)));
 const result=spawnSync(process.execPath,["smoke.mjs"],{cwd,stdio:"inherit"});assert.equal(result.status,0);
}finally{rmSync(cwd,{recursive:true,force:true});}
