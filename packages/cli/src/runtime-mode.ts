import {existsSync,lstatSync,readdirSync,readFileSync,writeFileSync,mkdirSync,renameSync,rmSync,copyFileSync} from "node:fs";
import {resolve,join,dirname,relative} from "node:path";
import {createHash} from "node:crypto";
type Versions=Record<string,string>;
type Flags={apply?:boolean;archives?:string;acceptLocalRuntime?:boolean;initial?:boolean};
type Archive={version:string;archive:string;sha256:string};
const sha=(data:Buffer)=>createHash("sha256").update(data).digest("hex");
const json=(path:string)=>JSON.parse(readFileSync(path,"utf8"));
const write=(path:string,data:unknown)=>writeFileSync(path,JSON.stringify(data,null,2)+"\n");
const localName=(name:string)=>name.slice("@openadminjs/".length);
export function migrateRuntime(root:string,template:string,flags:Flags={}){
 const versions=json(join(template,"runtime-versions.json")) as Versions;
 const known=Object.keys(versions);
 if(known.some(n=>!/^@openadminjs\/[a-z-]+$/.test(n)||!/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/.test(versions[n]!)))throw Error("Invalid bundled runtime versions");
 const backup=join(root,".openadminjs-runtime-backup"),archiveDir=join(root,".openadminjs-runtime");
 if(existsSync(backup)||existsSync(archiveDir))throw Error("Runtime migration already performed; preserve or restore the backup before retrying");
 const rootPkg=json(join(root,"package.json")),tsPath=join(root,"tsconfig.base.json"),ts=json(tsPath);
 const conflicts:string[]=[];
 const packageDirs:string[]=[];
 function compare(local:string,expected:string){
  if(!existsSync(local)||lstatSync(local).isSymbolicLink()){conflicts.push(relative(root,local));return;}
  for(const e of readdirSync(local,{withFileTypes:true})){
   if(["dist","node_modules","coverage",".turbo"].includes(e.name)||e.name.endsWith(".tsbuildinfo"))continue;
   const a=join(local,e.name),b=join(expected,e.name);
   if(e.isSymbolicLink()){conflicts.push(relative(root,a));continue;}
   if(e.isDirectory()){if(!existsSync(b))conflicts.push(relative(root,a));else compare(a,b);}
   else if(!existsSync(b)||sha(readFileSync(a))!==sha(readFileSync(b)))conflicts.push(relative(root,a));
  }
 }
 for(const name of known){
  const local=join(root,"packages",localName(name));
  if(existsSync(local)){
   if(lstatSync(local).isSymbolicLink())throw Error("Symlinked runtime directory");
   packageDirs.push(local);
   if(!flags.initial)compare(local,join(template,"packages",localName(name)));
  }
 }
 if(!packageDirs.length)throw Error("No copied runtime source directories found");
 const manifests=[join(root,"package.json"),...["apps","examples"].flatMap(dir=>existsSync(join(root,dir))?readdirSync(join(root,dir),{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>join(root,dir,e.name,"package.json")).filter(existsSync):[])];
 const updates=new Map<string,unknown>();
 for(const file of manifests){
  const p=json(file);
  for(const section of ["dependencies","devDependencies","peerDependencies","optionalDependencies"]){
   if(!p[section])continue;
   for(const name of known)if(name in p[section])p[section][name]=versions[name];
  }
  if(file===manifests[0]){
   p.dependencies={...p.dependencies,...versions};
   // Packages are pinned independently; no workspace wildcard for these dependencies.
   if(flags.archives){
    if(!existsSync(join(root,"pnpm-workspace.yaml")))throw Error("Candidate archive mode requires pnpm");
    p.pnpm={...p.pnpm,overrides:{...p.pnpm?.overrides,...Object.fromEntries(known.map(name=>[name,"file:./.openadminjs-runtime/"+localName(name)+".tgz"]))}};
   }
  }
  updates.set(file,p);
 }
 if(ts.compilerOptions?.paths)for(const name of known)delete ts.compilerOptions.paths[name];
 updates.set(tsPath,ts);
 const files: {source:string;target:string}[]=[];
 if(flags.archives){
  const dir=resolve(flags.archives),manifest=json(join(dir,"runtime-manifest.json")) as Record<string,Archive>;
  for(const name of known){
   const entry=manifest[name];
   if(!entry||entry.version!==versions[name]||entry.archive!==name.replace(/^@/,"").replace("/","-")+"-"+entry.version+".tgz"||!/^\w[\w.-]*\.tgz$/.test(entry.archive))throw Error("Missing/mismatched archive "+name);
   const source=join(dir,entry.archive);
   if(sha(readFileSync(source))!==entry.sha256)throw Error("Archive checksum mismatch "+name);
   files.push({source,target:join(archiveDir,localName(name)+".tgz")});
  }
 }
 const result={mode:flags.archives?"archives":"registry",versions,conflicts,plannedManifests:[...updates.keys()].map(p=>relative(root,p)),backup:relative(root,backup),applied:false};
 if(!flags.apply||conflicts.length&&!flags.acceptLocalRuntime)return result;
 // All paths are constrained to known bundled package names. No DB or dependency installation.
 mkdirSync(backup,{mode:0o700});
 const saved: {file:string;content:Buffer}[]=[],moved: {from:string;to:string}[]=[];
 try{
  for(const [file,data] of updates){
   const content=readFileSync(file);const dest=join(backup,"manifests",relative(root,file));mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,content);saved.push({file,content});write(file,data);
  }
  for(const from of packageDirs){
   const to=join(backup,"sources",relative(root,from));mkdirSync(dirname(to),{recursive:true});renameSync(from,to);moved.push({from,to});
  }
  if(files.length){mkdirSync(archiveDir);for(const f of files)copyFileSync(f.source,f.target);}
  write(join(backup,"migration.json"),result);
  // Keep this backup out of Git and avoid accidental workspace discovery.
  const ignore=join(root,".gitignore");if(existsSync(ignore)&&!readFileSync(ignore,"utf8").includes(".openadminjs-runtime-backup/"))writeFileSync(ignore,readFileSync(ignore,"utf8")+"\n.openadminjs-runtime-backup/\n");
  if(flags.initial)rmSync(backup,{recursive:true,force:true});
  result.applied=true;return result;
 }catch(e){
  for(const {from,to} of moved.reverse())renameSync(to,from);
  for(const {file,content} of saved)writeFileSync(file,content);
  rmSync(archiveDir,{recursive:true,force:true});rmSync(backup,{recursive:true,force:true});throw e;
 }
}
