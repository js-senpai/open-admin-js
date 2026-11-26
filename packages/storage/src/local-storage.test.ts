import {describe,it,expect} from "vitest";
import {mkdtemp,rm,symlink,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {LocalStorage} from "./index";
describe("private local storage",()=>{
 it("roundtrips and rejects traversal and symlinks",async()=>{
  const root=await mkdtemp(join(tmpdir(),"oajs-storage-"));
  try {
    const storage=new LocalStorage(root);
    const file=await storage.put(Buffer.from("hello"),{filename:"hello.txt",mimeType:"text/plain",path:"",size:0});
    expect(file.path).toMatch(/^uploads\/[a-f0-9]{48}$/);
    expect((await storage.read(file.path)).toString()).toBe("hello");
    await expect(storage.read("../secret")).rejects.toThrow();
    await writeFile(join(root,"secret"),"secret");
    const key="a".repeat(48);
    await symlink(join(root,"secret"),join(root,key));
    await expect(storage.read("uploads/"+key)).rejects.toThrow();
    await storage.delete(file.path);
    await expect(storage.read(file.path)).rejects.toThrow();
  }finally{await rm(root,{recursive:true,force:true});}
 });
});