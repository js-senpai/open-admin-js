import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { ensureGqlFieldTypes, ensureGqlParamTypes } from "./ensure-gql-paramtypes";

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

  it("defines missing design:type metadata for GraphQL fields", () => {
    class Sample {
      name!: string;
      count!: number;
    }
    ensureGqlFieldTypes(Sample.prototype, { name: String, count: Number });
    expect(Reflect.getMetadata("design:type", Sample.prototype, "name")).toBe(String);
    expect(Reflect.getMetadata("design:type", Sample.prototype, "count")).toBe(Number);
  });

  it("does not overwrite existing field metadata", () => {
    class Sample {
      createdAt!: Date;
    }
    Reflect.defineMetadata("design:type", Date, Sample.prototype, "createdAt");
    ensureGqlFieldTypes(Sample.prototype, { createdAt: String });
    expect(Reflect.getMetadata("design:type", Sample.prototype, "createdAt")).toBe(Date);
  });
});
