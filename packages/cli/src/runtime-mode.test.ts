import {describe,it,expect} from "vitest";
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from "node:fs";
import {join,dirname} from "node:path";
import {tmpdir} from "node:os";
import {migrateRuntime} from "./runtime-mode.js";
describe("runtime migration",()=>{
 it("plans, reports custom runtime edits, and preserves sources when explicitly applied",()=>{
  const d=mkdtempSync(join(tmpdir(),"runtime-mode-")),root=join(d,"project"),template=join(d,"template");
  try{
   const write=(p:string,value:string)=>{mkdirSync(dirname(p),{recursive:true});writeFileSync(p,value);};
   write(join(template,"runtime-versions.json"),JSON.stringify({"@openadminjs/core":"0.2.0-rc.1"}));
   write(join(template,"packages/core/src/index.ts"),"export const value=1;");
   write(join(root,"packages/core/src/index.ts"),"export const value=2;");
   write(join(root,"package.json"),JSON.stringify({private:true}));
   write(join(root,"apps/api/package.json"),JSON.stringify({dependencies:{"@openadminjs/core":"workspace:*"}}));
   write(join(root,"tsconfig.base.json"),JSON.stringify({compilerOptions:{paths:{"@openadminjs/core":["packages/core/src/index.ts"],"@local/*":["src/*"]}}}));
   write(join(root,"prisma/schema.prisma"),"untouched");
   const plan=migrateRuntime(root,template);
   expect(plan.conflicts).toContain("packages/core/src/index.ts");
   expect(migrateRuntime(root,template,{apply:true}).applied).toBe(false);
   expect(existsSync(join(root,"packages/core"))).toBe(true);
   const applied=migrateRuntime(root,template,{apply:true,acceptLocalRuntime:true});
   expect(applied.applied).toBe(true);
   expect(existsSync(join(root,"packages/core"))).toBe(false);
   expect(readFileSync(join(root,".openadminjs-runtime-backup/sources/packages/core/src/index.ts"),"utf8")).toBe("export const value=2;");
   expect(JSON.parse(readFileSync(join(root,"apps/api/package.json"),"utf8")).dependencies["@openadminjs/core"]).toBe("0.2.0-rc.1");
   expect(JSON.parse(readFileSync(join(root,"tsconfig.base.json"),"utf8")).compilerOptions.paths).toEqual({"@local/*":["src/*"]});
   expect(readFileSync(join(root,"prisma/schema.prisma"),"utf8")).toBe("untouched");
  }finally{rmSync(d,{recursive:true,force:true});}
 });
});
