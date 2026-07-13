import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const moduleSource = readFileSync(join(here, "graphql.module.ts"), "utf8");

// Strip comments so assertions check actual configuration, not explanatory prose
// (a comment that names `graphql-playground` must not trip the guard below).
const moduleCode = moduleSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("Apollo driver config (peer-conflict regression)", () => {
  it("does not enable the deprecated graphql-playground landing page", () => {
    // `playground: true` pulls in @apollo/server-plugin-landing-page-graphql-playground,
    // which has a non-optional @apollo/server@4 peer dependency and breaks a clean install.
    expect(moduleCode).toMatch(/playground:\s*false/);
    expect(moduleCode).not.toMatch(/playground:\s*true/);
    expect(moduleCode).not.toMatch(/graphql-playground/);
  });

  it("uses the Apollo Server 5 landing page plugin", () => {
    expect(moduleSource).toContain("@apollo/server/plugin/landingPage/default");
    expect(moduleSource).toMatch(/ApolloServerPluginLandingPage(Local|Production)Default/);
  });
});
