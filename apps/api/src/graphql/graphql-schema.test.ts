import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { AdminResourceListArgs, AdminResourceRecordArgs } from "./admin-resources.args";
import { AdminResourcesResolver } from "./admin-resources.resolver";

describe("GraphQL schema (admin resources)", () => {
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
