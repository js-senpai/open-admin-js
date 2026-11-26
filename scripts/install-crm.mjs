import {readFileSync,writeFileSync,existsSync,mkdirSync,rmSync,readdirSync} from "node:fs";
import {resolve,join} from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
const root=process.cwd();
const example=fileURLToPath(new URL("../examples/crm-admin/",import.meta.url));
const schemaPath=join(root,"prisma/schema.prisma");
const registryPath=join(root,"apps/api/src/resources/registry.ts");
const args=process.argv.slice(2);
if(args.length!==1||!["--dry-run","--apply"].includes(args[0]))throw Error("Usage: node scripts/install-crm.mjs --dry-run|--apply");
const schema=readFileSync(schemaPath,"utf8"),registry=readFileSync(registryPath,"utf8");
const names=["companies","contacts","deals","activities"];
const fragment=readFileSync(join(example,"prisma/models.fragment.prisma"),"utf8");
for(const name of ["Contact","Company","Deal","Activity"])if(new RegExp("\\bmodel\\s+"+name+"\\s*\\{").test(schema))throw Error("Existing model: "+name);
const resourceDir=join(root,"apps/api/src/resources/crm");
if(existsSync(resourceDir))throw Error("CRM directory already exists");
const marker="export const resources = [";
if(registry.split(marker).length!==2)throw Error("Registry changed; merge the example manually");
for(const name of names)if(registry.includes("crm/"+name+".resource"))throw Error("Already registered");
const source=names.map(name=>[name,readFileSync(join(example,"src/resources/"+name+".resource.ts"),"utf8")]);
const imports=names.map(name=>"import crm_"+name+" from \"./crm/"+name+".resource\";").join("\n");
const nextRegistry=imports+"\n"+registry.replace(marker,marker+"\n  "+names.map(n=>"crm_"+n).join(",\n  ")+",");
console.log("Plan: add a CRM schema module, add 4 resource modules, register 4 resources. No database commands.");
if(args[0]==="--dry-run")process.exit(0);
const moduleDir=join(root,"prisma/modules"),manifestPath=join(moduleDir,"manifest.json"),moduleFile=join(moduleDir,"crm.prisma");
const originalManifest=existsSync(manifestPath)?readFileSync(manifestPath,"utf8"):undefined;
const manifest=originalManifest?JSON.parse(originalManifest):null;
const sha=s=>createHash("sha256").update(s).digest("hex");
if(existsSync(moduleFile))throw Error("CRM schema module already exists");
const {composeSchema,schemaProvider}=await import("../packages/prisma/src/index.mjs").catch(()=>import("@openadminjs/prisma"));
const provider=schemaProvider(schema);
let nextSchema;
if(manifest){
 if(manifest.lastSchemaHash!==sha(schema))throw Error("Adopted schema has drift; reconcile first");
 nextSchema=schema+"\n"+fragment+"\n";
}else{
 const custom=existsSync(moduleDir)?readdirSync(moduleDir).filter(n=>n.endsWith(".prisma")).sort().map(n=>[n,readFileSync(join(moduleDir,n),"utf8")]):[];
 if(composeSchema({provider,customFragments:custom.map(x=>x[1])})!==schema)throw Error("Schema has local edits; run schema adopt before installing CRM");
 nextSchema=composeSchema({provider,customFragments:[...custom,["crm.prisma",fragment]].sort((a,b)=>a[0].localeCompare(b[0])).map(x=>x[1])});
}
try{
 mkdirSync(resourceDir);
 for(const [name,body] of source)writeFileSync(join(resourceDir,name+".resource.ts"),body,{flag:"wx"});
 mkdirSync(moduleDir,{recursive:true});
 writeFileSync(moduleFile,manifest?"\n"+fragment+"\n":fragment,{flag:"wx"});
 writeFileSync(schemaPath,nextSchema);
 if(manifest){manifest.files.push("crm.prisma");manifest.lastSchemaHash=sha(nextSchema);writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+"\n");}
 writeFileSync(registryPath,nextRegistry);
}catch(error){rmSync(moduleFile,{force:true});if(originalManifest)writeFileSync(manifestPath,originalManifest);writeFileSync(schemaPath,schema);writeFileSync(registryPath,registry);rmSync(resourceDir,{recursive:true,force:true});throw error;}
console.log("CRM installed. Review schema, create a migration and seed permissions before starting.");
