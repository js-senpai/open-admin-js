import {mkdirSync,readFileSync,writeFileSync,rmSync,cpSync,readdirSync,existsSync} from "node:fs";
import {resolve,join,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const out=resolve(process.argv[2]||join(root,"runtime-artifacts"));
const stage=join(root,".runtime-build");
if(out===root||out===stage)throw Error("Unsafe output directory");
const names=["resource","core","auth","permissions","plugin-sdk","storage","queue","notifications","mail","payments","nest","admin-client","prisma"];
const packages=Object.fromEntries(names.map(name=>[name,JSON.parse(readFileSync(join(root,"packages",name,"package.json"),"utf8"))]));
const versions=Object.fromEntries(names.map(name=>[packages[name].name,packages[name].version]));
function run(command,args,cwd=root){
 const r=spawnSync(command,args,{cwd,stdio:"inherit",shell:process.platform==="win32"});
 if(r.status!==0||r.error)throw Error(command+" failed");
}
mkdirSync(out,{recursive:true});rmSync(stage,{recursive:true,force:true});mkdirSync(stage,{recursive:true});
const paths={};const manifest={};
for(const name of names){
 const input=join(root,"packages",name),dest=join(stage,name),pkg=packages[name];
 mkdirSync(dest,{recursive:true});
 const dependencies={...pkg.dependencies};
 // Runtime dynamic imports must be declared, not left in devDependencies.
 for(const dep of name==="mail"?["nodemailer"]:name==="payments"?["stripe"]:[])dependencies[dep]=pkg.devDependencies[dep];
 for(const dep of Object.keys(dependencies)){
  if(dependencies[dep].startsWith("workspace:")){
   if(!versions[dep])throw Error("Unknown runtime dependency "+dep);
   dependencies[dep]=versions[dep];
  }
 }
 let exports;
 if(name==="prisma"){
  cpSync(join(input,"src"),join(dest,"dist"),{recursive:true});
  cpSync(join(input,"schema"),join(dest,"schema"),{recursive:true});
  exports={types:"./dist/index.d.ts",import:"./dist/index.mjs",default:"./dist/index.mjs"};
 }else{
  const config=join(stage,name+".json");
  writeFileSync(config,JSON.stringify({compilerOptions:{target:"ES2022",lib:["ES2022","DOM","DOM.Iterable"],module:"ESNext",moduleResolution:"Bundler",strict:true,skipLibCheck:true,esModuleInterop:true,allowSyntheticDefaultImports:true,noUncheckedIndexedAccess:true,experimentalDecorators:true,emitDecoratorMetadata:true,declaration:true,rootDir:join(input,"src"),outDir:join(dest,"dist"),baseUrl:root,paths,types:["node"]},include:[join(input,"src/**/*.ts")],exclude:[join(input,"src/**/*.test.ts"),join(input,"src/**/*.spec.ts")]},null,2));
  run(process.execPath,[join(root,"node_modules/typescript/bin/tsc"),"-p",config]);
  exports={types:"./dist/index.d.ts",import:"./dist/index.js",default:"./dist/index.js"};
  paths[pkg.name]=[join(dest,"dist/index.d.ts")];
 }
 const published={name:pkg.name,version:pkg.version,description:pkg.description||"OpenAdminJS "+name+" runtime",license:"MIT",type:"module",main:exports.default,types:exports.types,exports:{".":exports},engines:{node:">=20"},dependencies,peerDependencies:pkg.peerDependencies||{},files:["dist",...(name==="prisma"?["schema"]:[])],publishConfig:{access:"public"},repository:{type:"git",url:"git+https://github.com/js-senpai/open-admin-js.git",directory:"packages/"+name}};
 // nodemailer types are required by the emitted public declarations.
 if(name==="mail")published.dependencies["@types/nodemailer"]=pkg.devDependencies["@types/nodemailer"];
 writeFileSync(join(dest,"package.json"),JSON.stringify(published,null,2)+"\n");
 if(existsSync(join(root,"LICENSE")))cpSync(join(root,"LICENSE"),join(dest,"LICENSE"));
 const archive=pkg.name.replace(/^@/,"").replace("/","-")+"-"+pkg.version+".tgz";
 run("npm",["pack","--ignore-scripts","--pack-destination",out],dest);
 const bytes=readFileSync(join(out,archive));
 manifest[pkg.name]={version:pkg.version,archive,sha256:createHash("sha256").update(bytes).digest("hex"),dependencies};
}
writeFileSync(join(out,"runtime-manifest.json"),JSON.stringify(manifest,null,2)+"\n");
console.log("Packed "+names.length+" independently versioned runtime packages.");
