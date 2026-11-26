import {mkdtempSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {spawnSync} from "node:child_process";
import {composeSchema,moduleNames,providers} from "../packages/prisma/src/index.mjs";
const dir=mkdtempSync(join(tmpdir(),"oajs-profiles-"));
const cli=resolve("node_modules/prisma/build/index.js");
try{
 for(const provider of providers){
  for(const modules of [moduleNames,["core"],...moduleNames.filter(x=>x!=="core").map(x=>[x])]){
   const file=join(dir,"schema.prisma");writeFileSync(file,composeSchema({provider,modules}));
   const DATABASE_URL=provider==="postgresql"?"postgresql://local:local@127.0.0.1:5432/local":provider==="mysql"?"mysql://local:local@127.0.0.1:3306/local":"file:./local.db";
   const r=spawnSync(process.execPath,[cli,"validate","--schema",file],{env:{...process.env,DATABASE_URL},encoding:"utf8"});
   if(r.status!==0)throw Error(provider+" "+modules.join(",")+"\n"+r.stderr);
  }
 }
 console.log("33 feature/provider schema combinations validated by Prisma");
}finally{rmSync(dir,{recursive:true,force:true});}
