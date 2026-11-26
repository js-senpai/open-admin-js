// Only for first-time package registration; normal releases use OIDC.
import {readFileSync} from "node:fs";
import {resolve,join} from "node:path";
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";

const dir=resolve(process.argv[2]||"runtime-artifacts");
const manifest=JSON.parse(readFileSync(join(dir,"runtime-manifest.json"),"utf8"));
const names=["resource","core","auth","permissions","plugin-sdk","storage","queue","notifications","mail","payments","nest","admin-client","prisma"].map(n=>"@openadminjs/"+n);
const registry="--registry=https://registry.npmjs.org";
const files=new Map();
if(Object.keys(manifest).length!==names.length)throw Error("Unexpected runtime manifest");
for(const name of names){
 const entry=manifest[name];
 if(!entry||!/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/.test(entry.version)||entry.archive!==name.slice(1).replace("/","-")+"-"+entry.version+".tgz")throw Error("Invalid manifest entry: "+name);
 const path=join(dir,entry.archive);
 if(createHash("sha256").update(readFileSync(path)).digest("hex")!==entry.sha256)throw Error("Checksum mismatch: "+name);
 files.set(name,path);
}
// Preflight every artifact before staging anything. Query public registry metadata
// without the bootstrap credential; skip existing names, including placeholders.
const publicEnv={...process.env};
delete publicEnv.NODE_AUTH_TOKEN;
const missing=[];
for(const name of names){
 const r=spawnSync("npm",["view",name,"versions","--json",registry],{encoding:"utf8",env:publicEnv});
 if(r.status===0){console.log("Existing name, skip bootstrap: "+name);continue;}
 if(r.error||!/E404/.test(r.stderr||""))throw Error("Registry lookup failed: "+name);
 missing.push(name);
}
for(const name of missing){
 const r=spawnSync("npm",["stage","publish",files.get(name),"--access","public","--tag","next","--ignore-scripts",registry],{stdio:"inherit"});
 if(r.error||r.status!==0)throw Error("Stage failed: "+name);
}
console.log("Staged "+missing.length+" new names. Approve in npm with 2FA; existing names were not modified.");
