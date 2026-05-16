import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { ensureGqlParamTypes } from "./ensure-gql-paramtypes";

describe("ensureGqlParamTypes", () => {
  it("defines design:paramtypes when missing", () => {
    class Sample {
      handler(_a: string, _b: number) {}
    }
    ensureGqlParamTypes(Sample.prototype, "handler", [String, Number]);
    expect(Reflect.getMetadata("design:paramtypes", Sample.prototype, "handler")).toEqual([
      String,
      Number
    ]);
  });

  it("does not overwrite existing metadata", () => {
    class Sample {
      handler() {}
    }
    Reflect.defineMetadata("design:paramtypes", [Date], Sample.prototype, "handler");
    ensureGqlParamTypes(Sample.prototype, "handler", [String]);
    expect(Reflect.getMetadata("design:paramtypes", Sample.prototype, "handler")).toEqual([Date]);
  });
});
