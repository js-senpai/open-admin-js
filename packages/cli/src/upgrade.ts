import {createHash,randomBytes} from "node:crypto";
import {existsSync,lstatSync,mkdirSync,readFileSync,readdirSync,renameSync,rmSync,writeFileSync} from "node:fs";
import {join,dirname,resolve,relative} from "node:path";

type Manifest=Record<string,string>;
type Change={path:string;status:"update"|"conflict"|"manual"|"restored"};
const BASELINE=".openadminjs-managed.json",BACKUP=".openadminjs-patch-backup";
const roots=["packages/resource/src","packages/core/src","packages/permissions/src","packages/plugin-sdk/src","packages/storage/src","apps/admin/components","apps/admin/lib"];
function permitted(path:string){
 return roots.some(root=>path.startsWith(root+"/"))&&/\.(ts|tsx|css)$/.test(path)&&!/\.(test|spec|stories)\.[^.]+$/.test(path)&&!path.split("/").some(x=>!x||x==="."||x===".."||x.startsWith("."));
}
function safe(root:string,path:string){
 if(!permitted(path))throw Error("Not a managed file: "+path);
 let p=resolve(root);
 for(const segment of path.split("/")){p=join(p,segment);if(existsSync(p)&&lstatSync(p).isSymbolicLink())throw Error("Symlink not allowed: "+path);}
 return p;
}
function digest(data:Buffer){return createHash("sha256").update(data).digest("hex");}
function hashes(root:string){
 const out:Manifest={};
 function walk(dir:string){
  if(!existsSync(dir))return;
  if(lstatSync(dir).isSymbolicLink())throw Error("Managed root cannot be a symlink");
  for(const e of readdirSync(dir,{withFileTypes:true})){
   if(e.isSymbolicLink())throw Error("Symlink in managed directory");
   const p=join(dir,e.name);
   if(e.isDirectory()){walk(p);continue;}
   const path=relative(root,p).replaceAll("\\","/");
   if(e.isFile()&&permitted(path))out[path]=digest(readFileSync(safe(root,path)));
  }
 }
 for(const dir of roots)walk(join(root,dir));return out;
}
function readManifest(path:string):Manifest{
 if(lstatSync(path).isSymbolicLink())throw Error("Symlinked manifest");
 const data=JSON.parse(readFileSync(path,"utf8")) as Manifest;
 if(!data||typeof data!=="object"||Array.isArray(data)||Object.entries(data).some(([p,h])=>!permitted(p)||typeof h!=="string"||!/^[a-f0-9]{64}$/.test(h)))throw Error("Invalid managed baseline");
 return data;
}
function atomic(path:string,bytes:Buffer|string){
 const temporary=path+".oajs-"+randomBytes(8).toString("hex");
 writeFileSync(temporary,bytes,{flag:"wx",mode:0o600});try{renameSync(temporary,path);}catch(e){rmSync(temporary,{force:true});throw e;}
}
export function writeManagedBaseline(root:string){
 atomic(join(root,BASELINE),JSON.stringify(hashes(root),null,2)+"\n");
}
export function upgradeManaged(root:string,template:string,flags:{apply?:boolean;rollback?:boolean}={}):Change[]{
 if(flags.apply&&flags.rollback)throw Error("Choose apply or rollback");
 const manifestPath=join(root,BASELINE),backup=join(root,BACKUP);
 if(!existsSync(manifestPath))throw Error("No baseline: use a manual reviewed upgrade for this project");
 const baseline=readManifest(manifestPath);
 if(flags.rollback){
  if(!existsSync(backup)||lstatSync(backup).isSymbolicLink())throw Error("No valid patch backup");
  const previous=readManifest(join(backup,"baseline.json")),applied=readManifest(join(backup,"applied.json"));
  const entries=Object.keys(applied).filter(p=>previous[p]!==applied[p]);
  const changes:Change[]=entries.map(p=>({path:p,status:existsSync(safe(root,p))&&digest(readFileSync(safe(root,p)))===applied[p]?"restored":"conflict"}));
  if(changes.some(p=>p.status==="conflict"))return changes;
  const old=entries.map(p=>{const content=readFileSync(safe(backup,p));if(digest(content)!==previous[p])throw Error("Backup checksum mismatch");return {p,content};});
  for(const {p,content} of old)atomic(safe(root,p),content);
  atomic(manifestPath,JSON.stringify(previous,null,2)+"\n");rmSync(backup,{recursive:true,force:true});return changes;
 }
 const candidate=hashes(template),plan:Change[]=[];
 for(const p of new Set([...Object.keys(baseline),...Object.keys(candidate)])){
  if(candidate[p]===baseline[p])continue;
  if(!candidate[p]||!baseline[p]){plan.push({path:p,status:"manual"});continue;}
  const dest=safe(root,p);
  plan.push({path:p,status:existsSync(dest)&&digest(readFileSync(dest))===baseline[p]?"update":"conflict"});
 }
 if(!flags.apply||plan.some(p=>p.status==="conflict"||p.status==="manual"))return plan;
 if(!plan.length)return plan;
 if(existsSync(backup))throw Error("Previous patch backup exists; keep or roll it back before another patch");
 mkdirSync(backup,{mode:0o700});
 const next={...baseline};
 const changed: {p:string;before:Buffer}[]=[];
 try{
  for(const {path:p} of plan){
   const dest=safe(root,p),before=readFileSync(dest),after=readFileSync(safe(template,p));
   if(digest(before)!==baseline[p]||digest(after)!==candidate[p])throw Error("File changed during patch");
   const saved=safe(backup,p);mkdirSync(dirname(saved),{recursive:true});writeFileSync(saved,before,{flag:"wx",mode:0o600});
   changed.push({p,before});atomic(dest,after);next[p]=candidate[p]!;
  }
  writeFileSync(join(backup,"baseline.json"),JSON.stringify(baseline),{mode:0o600});
  writeFileSync(join(backup,"applied.json"),JSON.stringify(next),{mode:0o600});
  atomic(manifestPath,JSON.stringify(next,null,2)+"\n");return plan;
 }catch(e){for(const {p,before} of changed.reverse())atomic(safe(root,p),before);rmSync(backup,{recursive:true,force:true});throw e;}
}
