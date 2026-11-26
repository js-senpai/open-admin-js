import {describe,it,expect} from "vitest";
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from "node:fs";
import {join,dirname} from "node:path";
import {tmpdir} from "node:os";
import {upgradeManaged,writeManagedBaseline} from "./upgrade.js";
describe("managed patch",()=>{
 it("previews, preserves local changes, applies clean files and rolls back",()=>{
  const root=mkdtempSync(join(tmpdir(),"oajs-upgrade-")),project=join(root,"project"),template=join(root,"template"),path="packages/core/src/index.ts";
  try{
   for(const dir of [project,template])mkdirSync(dirname(join(dir,path)),{recursive:true});
   writeFileSync(join(project,path),"old");writeFileSync(join(template,path),"new");
   writeManagedBaseline(project);
   expect(upgradeManaged(project,template)[0]?.status).toBe("update");
   expect(readFileSync(join(project,path),"utf8")).toBe("old");
   writeFileSync(join(project,path),"user edit");
   expect(upgradeManaged(project,template,{apply:true})[0]?.status).toBe("conflict");
   expect(readFileSync(join(project,path),"utf8")).toBe("user edit");
   writeFileSync(join(project,path),"old");
   upgradeManaged(project,template,{apply:true});
   expect(readFileSync(join(project,path),"utf8")).toBe("new");
   upgradeManaged(project,template,{rollback:true});
   expect(readFileSync(join(project,path),"utf8")).toBe("old");
  }finally{rmSync(root,{recursive:true,force:true});}
 });
});
