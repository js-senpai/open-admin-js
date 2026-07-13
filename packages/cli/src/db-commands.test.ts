import { describe, expect, it } from "vitest";
import { buildDbCommand } from "./db-commands.js";

describe("buildDbCommand", () => {
  it("maps migrate dev/deploy per package manager", () => {
    expect(buildDbCommand("migrate", "dev", "pnpm")).toMatchObject({ cmd: "pnpm", args: ["db:migrate"] });
    expect(buildDbCommand("migrate", "deploy", "pnpm")).toMatchObject({ cmd: "pnpm", args: ["db:migrate:deploy"] });
    expect(buildDbCommand("migrate", "dev", "npm")).toMatchObject({ cmd: "npm", args: ["run", "db:migrate"] });
    expect(buildDbCommand("migrate", undefined, "yarn")).toMatchObject({ cmd: "yarn", args: ["db:migrate"] });
  });

  it("maps seed and studio", () => {
    expect(buildDbCommand("seed", undefined, "pnpm").args).toEqual(["db:seed"]);
    expect(buildDbCommand("studio", undefined, "npm").args).toEqual(["run", "db:studio"]);
  });

  it("marks reset as destructive", () => {
    const cmd = buildDbCommand("reset", undefined, "pnpm");
    expect(cmd.destructive).toBe(true);
  });

  it("never interpolates a shell string (args are an array)", () => {
    const cmd = buildDbCommand("migrate", "dev", "pnpm");
    expect(Array.isArray(cmd.args)).toBe(true);
  });

  it("throws on invalid action/mode", () => {
    expect(() => buildDbCommand("migrate", "bogus", "pnpm")).toThrow(/migrate mode/);
    // @ts-expect-error invalid action
    expect(() => buildDbCommand("nope", undefined, "pnpm")).toThrow(/Unknown db action/);
  });
});
