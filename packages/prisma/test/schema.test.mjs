import {test} from "node:test";
import assert from "node:assert/strict";
import {composeSchema,resolveModules,splitSchema,legacySqliteNormalizationSql} from "../src/index.mjs";
test("full schema contains all modules and provider types",()=>{const pg=composeSchema(),sqlite=composeSchema({provider:"sqlite"});assert.match(pg,/model AiArtifact/);assert.match(pg,/scopes\s+String\[\]/);assert.match(sqlite,/scopes\s+Json/);assert.match(sqlite,/posts\s+Post\[\]/);});
test("minimal profiles omit optional relations and resolve dependencies",()=>{const core=composeSchema({modules:["core"]});assert.match(core,/model Session/);assert.doesNotMatch(core,/\bPost\b|\bOrder\b|\bAiArtifact\b/);assert.deepEqual(resolveModules(["content"]),["core","media","content"]);assert.throws(()=>resolveModules(["unknown"]));});
test("custom models and exact adoption",()=>{const schema="// custom\n"+composeSchema({customFragments:["model Widget {\n id String @id\n}"]});assert.equal(splitSchema(schema).map(x=>x.content).join(""),schema);assert.throws(()=>composeSchema({customFragments:["model User {\n id String @id\n}"]}));assert.match(legacySqliteNormalizationSql(),/json_quote/);});
