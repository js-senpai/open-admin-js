import {readFileSync,existsSync,readdirSync} from "node:fs";
import {join,resolve} from "node:path";
import {spawnSync} from "node:child_process";
import {createRequire} from "node:module";
const root=process.cwd();
const {schemaProvider}=await import("../packages/prisma/src/index.mjs").catch(()=>import("@openadminjs/prisma"));
const schema=join(root,"prisma/schema.prisma"),provider=schemaProvider(readFileSync(schema,"utf8"));
const history=join(root,"prisma/migrations");
const hasHistory=existsSync(history)&&readdirSync(history,{withFileTypes:true}).some(e=>e.isDirectory());
const cli=resolve("node_modules/prisma/build/index.js");
if(!existsSync(cli))throw Error("Install dependencies first");
if(!process.env.DATABASE_URL){
  const envFile=[join(root,".env"),join(root,"apps/api/.env")].find(existsSync);
  if(envFile){
    const dotenv=createRequire(join(root,"apps/api/package.json"))("dotenv");
    dotenv.config({path:envFile});
  }
}
if(!process.env.DATABASE_URL)throw Error("Set DATABASE_URL for this project");
const url=process.env.DATABASE_URL;
if(provider==="sqlite"?!url.startsWith("file:"):provider==="mysql"?!url.startsWith("mysql:"):!/^postgres(?:ql)?:/.test(url))throw Error("Database URL and schema provider mismatch");
if(provider==="postgresql"&&!hasHistory)throw Error("PostgreSQL requires reviewed migration history");
if(!hasHistory&&process.env.NODE_ENV==="production")throw Error("Production requires reviewed migration history; schema push is disabled");
if(hasHistory){
 const lock=readFileSync(join(history,"migration_lock.toml"),"utf8");
 if(!lock.includes('provider = "'+provider+'"'))throw Error("Migration provider mismatch");
}
const run=args=>{
 const result=spawnSync(process.execPath,[cli,...args,"--schema",schema],{stdio:"inherit"});
 if(result.error||result.status!==0)process.exit(result.status??1);
};
run(hasHistory?["migrate","deploy"]:["db","push","--skip-generate"]);
run(["generate"]);
