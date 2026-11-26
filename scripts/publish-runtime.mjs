// Manual workflow only. Publish exactly the checksummed, tested archives.
import {readFileSync} from "node:fs";
import {resolve,join} from "node:path";
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
const dir=resolve(process.argv[2]||"runtime-artifacts");
const manifest=JSON.parse(readFileSync(join(dir,"runtime-manifest.json"),"utf8"));
const requested=(process.env.RUNTIME_PACKAGES||"").split(",").map(x=>x.trim()).filter(Boolean);
const tag=process.env.RUNTIME_DIST_TAG||"next";
if(!requested.length||!["next","latest"].includes(tag))throw Error("Specify package selection and approved dist tag");
const names=Object.keys(manifest);
const selected=new Set(requested.length===1&&requested[0]==="all"?names:requested.map(n=>n.startsWith("@openadminjs/")?n:"@openadminjs/"+n));
for(const n of selected)if(!Object.hasOwn(manifest,n))throw Error("Unknown package selection");
function view(name,version){
 const r=spawnSync("npm",["view",name+"@"+version,"dist.integrity","--json","--registry=https://registry.npmjs.org"],{encoding:"utf8"});
 if(r.status===0)return JSON.parse(r.stdout);
 if(/E404/.test(r.stderr))return null;
 throw Error("Registry lookup failed for "+name);
}
const files=new Map();
for(const [name,entry] of Object.entries(manifest)){
 if(!/^@openadminjs\/[a-z-]+$/.test(name)||!/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/.test(entry.version)||entry.archive!==name.slice(1).replace("/","-")+"-"+entry.version+".tgz")throw Error("Invalid package manifest");
 const path=join(dir,entry.archive),bytes=readFileSync(path);
 if(createHash("sha256").update(bytes).digest("hex")!==entry.sha256)throw Error("Package checksum mismatch");
 if(selected.has(name)&&tag==="latest"&&entry.version.includes("-"))throw Error("Prerelease cannot use latest");
 files.set(name,{path,integrity:"sha512-"+createHash("sha512").update(bytes).digest("base64")});
}
const done=new Set(),visiting=new Set(),order=[];
function visit(name){
 if(done.has(name))return;if(visiting.has(name))throw Error("Circular runtime dependencies");visiting.add(name);
 for(const [dep,version] of Object.entries(manifest[name].dependencies||{})){
  if(!dep.startsWith("@openadminjs/"))continue;
  if(selected.has(dep)){
   if(manifest[dep].version!==version)throw Error("Incompatible selected dependency version");visit(dep);
  }else if(!view(dep,version))throw Error("Required runtime dependency is not published: "+dep+"@"+version);
 }
 visiting.delete(name);done.add(name);order.push(name);
}
for(const name of selected)visit(name);
const existing=new Set();
for(const name of order){
 const integrity=view(name,manifest[name].version);
 if(integrity){if(integrity!==files.get(name).integrity)throw Error("Immutable npm version already contains different bytes: "+name);existing.add(name);}
}
for(const name of order){
 if(existing.has(name)){console.log("Already published identical archive: "+name);continue;}
 const r=spawnSync("npm",["publish",files.get(name).path,"--access","public","--tag",tag,"--provenance","--ignore-scripts","--registry=https://registry.npmjs.org"],{stdio:"inherit"});
 if(r.status!==0)throw Error("Publish failed: "+name);
}
