import {describe,expect,it} from "vitest";
import {materializeAllRoles} from "@openadminjs/permissions";
import {roleBlueprints,catalogSlugList} from "./catalog";
import {publicRoleBlueprints,publicPermissionCatalog} from "./public-catalog";
describe("default role and realm matrix",()=>{
 const publicSlugs=publicPermissionCatalog.map(p=>p.name);
 const matrix=materializeAllRoles([...roleBlueprints,...publicRoleBlueprints],[...catalogSlugList,...publicSlugs],{admin:catalogSlugList,public:publicSlugs});
 const permissions=(key:string)=>matrix.get(key)??[];
 it("viewer has no mutation or integration permissions",()=>{
  expect(permissions("admin:viewer")).toContain("posts.read");
  for(const p of ["posts.create","posts.delete","files.create","orders.refund","settings.update","ai.config.update","*"])expect(permissions("admin:viewer")).not.toContain(p);
 });
 it("editor inherits viewer but cannot refund or configure providers",()=>{
  expect(permissions("admin:editor")).toEqual(expect.arrayContaining([...permissions("admin:viewer"),"posts.create","files.create"]));
  for(const p of ["orders.refund","ai.config.update","*"])expect(permissions("admin:editor")).not.toContain(p);
 });
 it("expands admin wildcard without granting public slugs",()=>{
  expect(permissions("admin:admin")).toEqual(expect.arrayContaining(["*","orders.refund",...catalogSlugList]));
  for(const p of publicSlugs)expect(permissions("admin:admin")).not.toContain(p);
 });
 it("public guest has no privileges; member is restricted to public realm",()=>{
  expect(permissions("public:guest")).toEqual([]);
  expect(permissions("public:member")).toEqual([...publicSlugs].sort());
 });
});
