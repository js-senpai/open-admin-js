import {readFileSync} from "node:fs";
const load=name=>readFileSync(new URL("../schema/"+name,import.meta.url),"utf8");
const spec=JSON.parse(load("modules.json"));
export const moduleNames=Object.freeze(Object.keys(spec.modules));
export const providers=Object.freeze(["postgresql","mysql","sqlite"]);
export function resolveModules(requested=moduleNames){
 if(!Array.isArray(requested))throw Error("Modules must be an array");
 const enabled=new Set();
 function add(name){if(!Object.hasOwn(spec.modules,name))throw Error("Unknown schema module: "+name);if(enabled.has(name))return;enabled.add(name);for(const dep of spec.modules[name])add(dep);}
 add("core");for(const name of requested)add(name);
 return moduleNames.filter(name=>enabled.has(name));
}
const scalars=new Set(["String","Boolean","Int","BigInt","Float","Decimal","DateTime","Bytes","Json"]);
export function renderProvider(schema,provider){
 if(!providers.includes(provider))throw Error("Unsupported provider: "+provider);
 let result=schema.replace(/(datasource\s+\w+\s*\{[^}]*?provider\s*=\s*)"[^"]+"/,(_,prefix)=>prefix+JSON.stringify(provider));
 if(provider==="postgresql")return result;
 let model=false,comment=false;
 return result.split(/(\r?\n)/).map(line=>{
  if(/^\s*\/\*/.test(line))comment=true;
  if(comment){if(line.includes("*/"))comment=false;return line;}
  if(/^\s*(model|type)\s+\w+\s*\{/.test(line)){model=true;return line;}
  if(/^\s*}\s*(?:\/\/.*)?$/.test(line)){model=false;return line;}
  if(!model)return line;
  return line.replace(/^(\s*\w+\s+)(\w+)\[\](?=\s|$)/,(match,prefix,type)=>scalars.has(type)?prefix+"Json":match);
 }).join("");
}
/** Built-in feature fragments, with explicit inverse relations for disabled features. */
export function composeSchema({provider="postgresql",modules=moduleNames,customFragments=[]}={}){
 const enabled=resolveModules(modules),names=new Set(enabled);
 const chunks=[load("header.prisma").trim()];
 for(const name of enabled){
  let model="";
  const content=load(name+".prisma").trim().split("\n").filter(line=>{
   const start=line.match(/^model\s+(\w+)/);if(start)model=start[1];
   const field=line.match(/^\s+(\w+)\s+/)?.[1];
   const feature=field&&spec.optionalRelations[model]?.[field];
   return !feature||names.has(feature);
  }).join("\n");
  chunks.push(content);
 }
 for(const fragment of customFragments){
  if(typeof fragment!=="string"||/^\s*(generator|datasource)\s+/m.test(fragment))throw Error("Custom fragments cannot redefine generator or datasource");
  if(fragment.trim())chunks.push(fragment.trim());
 }
 const schema=chunks.join("\n\n")+"\n";
 const declarations=new Set();
 for(const m of schema.matchAll(/^\s*(model|enum|type|view)\s+(\w+)\s*\{/gm)){
  if(declarations.has(m[2]))throw Error("Duplicate schema declaration: "+m[2]);declarations.add(m[2]);
 }
 return renderProvider(schema,provider);
}
/** Lossless adoption of an existing monolithic schema; custom declarations are never replaced. */
export function splitSchema(schema){
 if(typeof schema!=="string"||!schema.trim())throw Error("Empty schema");
 const starts=[...schema.matchAll(/^(generator|datasource|model|enum|type|view)\s+(\w+)\s*\{/gm)];
 if(!starts.length)throw Error("No supported Prisma declarations");
 const chunks=[];
 if(starts[0].index>0)chunks.push({name:"000-preamble",content:schema.slice(0,starts[0].index)});
 for(let i=0;i<starts.length;i++){
  const m=starts[i],end=starts[i+1]?.index??schema.length;
  chunks.push({name:String(i+1).padStart(3,"0")+"-"+m[1]+"-"+m[2],content:schema.slice(m.index,end)});
 }
 if(chunks.map(x=>x.content).join("")!==schema)throw Error("Schema split is not lossless");
 return chunks;
}
export const legacySqliteJsonFields=Object.freeze({AuditLog:["before","after"],Setting:["value"],ApiToken:["scopes"],JobLog:["payload"],Product:["metadata"],Order:["metadata"],Transaction:["metadata"],WebhookLog:["payload"],AiMessage:["meta"],AiArtifact:["meta"]});
/** Legacy codec parsed valid JSON and returned invalid JSON text verbatim. Preserve that meaning. */
export function legacySqliteNormalizationSql(){
 return Object.entries(legacySqliteJsonFields).flatMap(([table,fields])=>fields.map(field=>'UPDATE "'+table+'" SET "'+field+'" = json_quote("'+field+'") WHERE "'+field+'" IS NOT NULL AND NOT json_valid("'+field+'");')).join("\n")+"\n";
}

/** Prepare an upgrade target from the existing schema, keeping custom models/fields.
 * Only known type changes are applied. Incompatible customizations fail closed.
 * No database connection or filesystem mutation occurs here.
 */
export function mergeLegacySchema(schema,provider){
 const actual=schema.match(/datasource\s+\w+\s*\{[^}]*?provider\s*=\s*"([^"]+)"/)?.[1];
 if(actual!==provider||!providers.includes(provider))throw Error("Provider mismatch; cross-provider migration is not supported");
 const canonical=composeSchema({provider});
 const models=text=>[...text.matchAll(/^model\s+(\w+)\s*\{[\s\S]*?^}/gm)];
 const before=new Map(models(schema).map(m=>[m[1],m[0]]));
 const after=new Map(models(canonical).map(m=>[m[1],m[0]]));
 const changes=[],normalizations=[];
 const fieldMap=block=>new Map(block.split("\n").flatMap(line=>{const m=line.match(/^\s+(\w+)\s+([A-Za-z][\w]*(?:\[\]|\?)?)(?=\s|$)/);return m?[[m[1],{type:m[2],line}]]:[];}));
 let result=schema;
 for(const [model,target] of after){
  const old=before.get(model);
  if(!old){result=result.trimEnd()+"\n\n"+target+"\n";changes.push("Add model "+model);continue;}
  let next=old;const existing=fieldMap(old),fields=fieldMap(target),additions=[];
  for(const [name,field] of fields){
   const prior=existing.get(name);
   if(!prior){additions.push(field.line);changes.push("Add "+model+"."+name);continue;}
   if(prior.type!==field.type){
    if(provider==="sqlite"&&legacySqliteJsonFields[model]?.includes(name)&&prior.type.replace("?","")==="String"&&field.type.replace("?","")==="Json"&&prior.type.endsWith("?")===field.type.endsWith("?")){
     next=next.replace(prior.line,prior.line.replace(/^(\s+\w+\s+)String(\??)/,(_,prefix,suffix)=>prefix+"Json"+suffix));
     normalizations.push({table:model,field:name});changes.push("Convert "+model+"."+name+" from legacy JSON text");
    }else throw Error("Incompatible customized field "+model+"."+name+": "+prior.type+" vs "+field.type);
   }
   if(model==="ApiToken"&&name==="tokenHash"&&!/\s@unique\b/.test(prior.line)){
    if(/\s\/\//.test(prior.line))throw Error("Review custom ApiToken.tokenHash declaration manually");
    next=next.replace(prior.line,prior.line+" @unique");changes.push("Add ApiToken.tokenHash unique constraint");
   }
  }
  const attrs=target.split("\n").filter(l=>/^\s*@@/.test(l));
  const normalize=l=>l.replace(/\s+/g,"");
  for(const attr of attrs)if(!old.split("\n").some(l=>normalize(l)===normalize(attr))){additions.push(attr);changes.push("Add "+model+" "+attr.trim());}
  if(additions.length)next=next.slice(0,next.lastIndexOf("}")).trimEnd()+"\n\n"+additions.join("\n")+"\n}";
  result=result.replace(old,()=>next);
 }
 // Unformatted built-in definitions must not accidentally be added twice.
 const duplicates=new Set();
 for(const m of result.matchAll(/^\s*(?:model|enum|type|view)\s+(\w+)\s*\{/gm)){if(duplicates.has(m[1]))throw Error("Duplicate declaration; format original schema before merging: "+m[1]);duplicates.add(m[1]);}
 return {schema:result,changes,normalizations,clearLegacyRefresh:!before.has("Session"),revokeLegacyKeys:!(/\s@unique\b/.test(fieldMap(before.get("ApiToken")||"").get("tokenHash")?.line||""))};
}
