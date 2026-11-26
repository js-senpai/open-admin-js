import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,cpSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {spawnSync} from "node:child_process";
import {renderProvider,legacySqliteJsonFields} from "../packages/prisma/src/index.mjs";
const provider=process.argv[2];
assert(["postgresql","mysql","sqlite"].includes(provider));
const repo=process.cwd(),dir=mkdtempSync(join(tmpdir(),"oajs-v1-")),prisma=join(dir,"prisma");
mkdirSync(prisma);const source=join(prisma,"schema.prisma");
const cli=resolve("node_modules/prisma/build/index.js");
const url=provider==="sqlite"?"file:"+join(dir,"legacy.db"):process.env.LEGACY_DATABASE_URL;
assert(url,"Dedicated legacy test database URL required");
if(provider!=="sqlite")assert(new URL(url).pathname.includes("legacy")||new URL(url).searchParams.get("schema")==="legacy","Refusing non-legacy DB");
const env={...process.env,DATABASE_URL:url};
function run(args,cwd=repo){const r=spawnSync(process.execPath,[cli,...args],{cwd,env,encoding:"utf8",maxBuffer:20*1024*1024});if(r.status!==0)throw Error(args.join(" ")+"\n"+r.stdout+"\n"+r.stderr);return r.stdout;}
function sql(text){const path=join(dir,"step.sql");writeFileSync(path,text);run(["db","execute","--schema",source,"--file",path]);}
try{
 let schema=renderProvider(readFileSync(join(repo,"tests/fixtures/schema-v1.prisma"),"utf8"),provider);
 if(provider==="sqlite")schema=schema.replace(/\bJson\b/g,"String");
 // Preserve a custom model and a custom column in an existing core model.
 schema=schema.replace(/^model User \{\n/m,"model User {\n  customerNote String?\n")+"\nmodel CustomWidget {\n id String @id\n label String\n}\n";
 writeFileSync(source,schema);
 run(["db","push","--schema",source,"--skip-generate"]);
 const q=n=>provider==="mysql"?"\x60"+n+"\x60":'"'+n+'"';
 const str=s=>"'"+s.replaceAll("'","''")+"'";
 const insert=(table,values)=>"INSERT INTO "+q(table)+" ("+Object.keys(values).map(q).join(",")+") VALUES ("+Object.values(values).join(",")+");";
 const now=provider==="sqlite"?"CURRENT_TIMESTAMP":"CURRENT_TIMESTAMP";
 const json=s=>provider==="postgresql"?str(s)+"::jsonb":str(s);
 const scopes=provider==="postgresql"?"ARRAY['posts.read']":json('["posts.read"]');
 sql([
  insert("User",{id:str("legacy-u"),email:str("legacy@example.test"),passwordHash:str("legacy-hash"),refreshTokenHash:str("old-refresh"),customerNote:str("custom data"),updatedAt:now}),
  insert("ApiToken",{id:str("legacy-key"),name:str("key"),tokenHash:str("old-key-hash"),scopes,userId:str("legacy-u")}),
  insert("CustomWidget",{id:str("w1"),label:str("keep me")}),
  insert("Setting",{id:str("set1"),key:str("legacy.test"),group:str("test"),type:str("text"),value:provider==="sqlite"?str("old plain string"):json('"old plain string"'),updatedAt:now}),
  insert("Setting",{id:str("set2"),key:str("legacy.json"),group:str("test"),type:str("json"),value:json('{"keep":[1,true,null]}'),updatedAt:now})
 ].join("\n"));
 // Use the actual operator-facing planner from a disposable project.
 mkdirSync(join(dir,"scripts"));mkdirSync(join(dir,"packages"));
 cpSync(join(repo,"packages/prisma"),join(dir,"packages/prisma"),{recursive:true,filter:p=>!p.includes("node_modules")&&!p.includes("/dist")});
 cpSync(join(repo,"scripts/migrate-existing.mjs"),join(dir,"scripts/migrate-existing.mjs"));
 const {symlinkSync}=await import("node:fs");symlinkSync(join(repo,"node_modules"),join(dir,"node_modules"),"dir");
 const planDir=join(dir,"plan");
 const plan=spawnSync(process.execPath,["scripts/migrate-existing.mjs","--out",planDir],{cwd:dir,env,encoding:"utf8"});if(plan.status!==0)throw Error(plan.stdout+"\n"+plan.stderr);
 const target=readFileSync(join(planDir,"target.prisma"),"utf8");
 assert.match(target,/customerNote String\?/);assert.match(target,/model CustomWidget/);
 assert.equal(readFileSync(source,"utf8"),schema,"Planner mutated source schema");
 // Simulate reviewed baseline + migration against isolated database only.
 const migrations=join(prisma,"migrations");mkdirSync(join(migrations,"00000000000000_existing_baseline"),{recursive:true});mkdirSync(join(migrations,"20261126160000_upgrade"),{recursive:true});
 cpSync(join(planDir,"baseline.sql"),join(migrations,"00000000000000_existing_baseline/migration.sql"));
 cpSync(join(planDir,"migration_lock.toml"),join(migrations,"migration_lock.toml"));
 cpSync(join(planDir,"upgrade.sql"),join(migrations,"20261126160000_upgrade/migration.sql"));
 run(["migrate","resolve","--applied","00000000000000_existing_baseline","--schema",source]);
 writeFileSync(source,target.replace('provider = "prisma-client-js"','provider = "prisma-client-js"\n  output = "../generated"'));
 run(["migrate","deploy","--schema",source]);
 run(["generate","--schema",source]);
 const {PrismaClient}=await import(join(dir,"generated/index.js"));
 const db=new PrismaClient({datasourceUrl:url});
 try{
  assert.equal((await db.user.findUniqueOrThrow({where:{id:"legacy-u"}})).customerNote,"custom data");
  assert.equal((await db.user.findUniqueOrThrow({where:{id:"legacy-u"}})).refreshTokenHash,null);
  assert((await db.apiToken.findUniqueOrThrow({where:{id:"legacy-key"}})).revokedAt);
  assert.equal((await db.customWidget.findUniqueOrThrow({where:{id:"w1"}})).label,"keep me");
  assert.equal((await db.setting.findUniqueOrThrow({where:{id:"set1"}})).value,"old plain string");
  assert.deepEqual((await db.setting.findUniqueOrThrow({where:{id:"set2"}})).value,{keep:[1,true,null]});
  assert.equal(await db.session.count(),0);
 }finally{await db.$disconnect();}
 console.log(provider+" legacy migration: custom schema/data, native JSON, token revocation and session schema verified");
}finally{rmSync(dir,{recursive:true,force:true});}
