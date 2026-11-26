import {existsSync,readFileSync,writeFileSync,mkdirSync,readdirSync,lstatSync,renameSync} from "node:fs";
import {join,resolve} from "node:path";
import {createHash} from "node:crypto";
import {composeSchema,splitSchema,moduleNames,providers} from "../packages/prisma/src/index.mjs";
const root=process.cwd(),schema=join(root,"prisma/schema.prisma"),dir=join(root,"prisma/modules"),manifest=join(dir,"manifest.json");
const [command,...args]=process.argv.slice(2);
const hash=text=>createHash("sha256").update(text).digest("hex");
const read=path=>readFileSync(path,"utf8");
function readLocal(path){if(lstatSync(path).isSymbolicLink())throw Error("Symbolic links not allowed in schema modules");return read(path);}
function providerOf(text){const p=text.match(/datasource\s+\w+\s*\{[^}]*?provider\s*=\s*"([^"]+)"/)?.[1];if(!providers.includes(p))throw Error("Unknown schema provider");return p;}
const current=read(schema);
if(command==="adopt"){
 if(existsSync(dir))throw Error("prisma/modules already exists; refusing overwrite");
 const chunks=splitSchema(current);
 mkdirSync(dir,{recursive:false});
 for(const chunk of chunks)writeFileSync(join(dir,chunk.name+".prisma"),chunk.content,{flag:"wx"});
 writeFileSync(manifest,JSON.stringify({mode:"adopted",provider:providerOf(current),files:chunks.map(c=>c.name+".prisma"),lastSchemaHash:hash(current)},null,2)+"\n",{flag:"wx"});
 console.log("Adopted existing schema losslessly. Database and migrations unchanged.");
}else if(command==="check"||command==="compose"){
 let next,config;
 if(existsSync(manifest)){
  if(lstatSync(dir).isSymbolicLink())throw Error("Symlinked schema module directory");
  config=JSON.parse(readLocal(manifest));
  if(config.mode!=="adopted"||!Array.isArray(config.files)||new Set(config.files).size!==config.files.length)throw Error("Invalid adoption manifest");
  for(const file of config.files)if(!/^[a-zA-Z0-9_-]+\.prisma$/.test(file))throw Error("Invalid module filename");
  next=config.files.map(file=>readLocal(join(dir,file))).join("");
  if(providerOf(next)!==config.provider)throw Error("Provider changes require a separate migration");
 }else{
  const custom=existsSync(dir)?readdirSync(dir).filter(x=>x.endsWith(".prisma")).sort().map(x=>readLocal(join(dir,x))):[];
  next=composeSchema({provider:providerOf(current),customFragments:custom});
 }
 if(command==="check"){if(current!==next)throw Error("Schema drift: review modules and compose; do not edit generated schema directly");console.log("Schema matches modules");}
 else{
  if(!args.includes("--write")){process.stdout.write(next);process.exit(0);}
  if(current===next){console.log("Schema already current");process.exit(0);}
  if(config&&config.lastSchemaHash!==hash(current))throw Error("Generated schema changed since adoption; merge your edits first");
  if(!config&&!args.includes("--replace-generated"))throw Error("Review output first; use --write --replace-generated only for a known generated schema, or adopt existing schema");
  const backup=schema+".before-compose";
  if(existsSync(backup))throw Error("Preserve or remove previous schema backup before composing again");
  writeFileSync(backup,current,{flag:"wx"});
  const temp=schema+".tmp";writeFileSync(temp,next,{flag:"wx"});renameSync(temp,schema);
  if(config){config.lastSchemaHash=hash(next);writeFileSync(manifest,JSON.stringify(config,null,2)+"\n");}
  console.log("Schema composed. Database unchanged; validate and create a reviewed migration.");
 }
}else if(command==="profile"){
 const provider=args[0],modules=args.slice(1);
 process.stdout.write(composeSchema({provider,modules:modules.length?modules:moduleNames}));
}else throw Error("Usage: schema.mjs check | adopt | compose [--write] | profile <provider> [modules...]");
