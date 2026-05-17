import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { AdminResourceListArgs, AdminResourceRecordArgs } from "./admin-resources.args";
import { AdminResourcesResolver } from "./admin-resources.resolver";

describe("GraphQL schema (admin resources)", () => {
  it("exposes design:type metadata for args fields when the compiler does not emit it", () => {
    expect(Reflect.getMetadata("design:type", AdminResourceListArgs.prototype, "name")).toBe(String);
    expect(Reflect.getMetadata("design:type", AdminResourceListArgs.prototype, "page")).toBe(Number);
    expect(Reflect.getMetadata("design:type", AdminResourceListArgs.prototype, "filter")).toBeTruthy();
    expect(Reflect.getMetadata("design:type", AdminResourceRecordArgs.prototype, "id")).toBe(String);
  });

  it("exposes design:paramtypes for Nest GraphQL when the compiler does not emit it", () => {
    expect(
      Reflect.getMetadata("design:paramtypes", AdminResourcesResolver.prototype, "adminResourceList")
    ).toEqual([AdminResourceListArgs, Object]);
    expect(
      Reflect.getMetadata("design:paramtypes", AdminResourcesResolver.prototype, "adminResourceRecord")
    ).toEqual([AdminResourceRecordArgs, Object]);
    expect(
      Reflect.getMetadata("design:paramtypes", AdminResourcesResolver.prototype, "adminRegisteredResourceNames")
    ).toEqual([Object]);
  });

});
