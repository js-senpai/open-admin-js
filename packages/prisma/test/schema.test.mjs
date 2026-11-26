import {test} from "node:test";
import assert from "node:assert/strict";
import {composeSchema,resolveModules,splitSchema,legacySqliteNormalizationSql,mergeLegacySchema} from "../src/index.mjs";
test("full schema contains all modules and provider types",()=>{const pg=composeSchema(),sqlite=composeSchema({provider:"sqlite"});assert.match(pg,/model AiArtifact/);assert.match(pg,/scopes\s+String\[\]/);assert.match(sqlite,/scopes\s+Json/);assert.match(sqlite,/posts\s+Post\[\]/);});
test("minimal profiles omit optional relations and resolve dependencies",()=>{const core=composeSchema({modules:["core"]});assert.match(core,/model Session/);assert.doesNotMatch(core,/\bPost\b|\bOrder\b|\bAiArtifact\b/);assert.deepEqual(resolveModules(["content"]),["core","media","content"]);assert.throws(()=>resolveModules(["unknown"]));});
test("custom models and exact adoption",()=>{const schema="// custom\n"+composeSchema({customFragments:["model Widget {\n id String @id\n}"]});assert.equal(splitSchema(schema).map(x=>x.content).join(""),schema);assert.throws(()=>composeSchema({customFragments:["model User {\n id String @id\n}"]}));assert.match(legacySqliteNormalizationSql(),/json_quote/);});

test("legacy upgrade preserves user fields and custom models and converts SQLite JSON text",()=>{
 let old=composeSchema({provider:"sqlite"}).replace("scopes    Json","scopes    String").replace("value     Json","value     String").replace("tokenHash String @unique","tokenHash String").replace("  sessions           Session[]\n","").replace(/\nmodel Session \{[\s\S]*?\n}\n/g,"\n").replace(/\nmodel SessionToken \{[\s\S]*?\n}\n/g,"\n");
 old=old.replace("  email              String","  customField        String?\n  email              String")+"\nmodel Widget {\n  id String @id\n}\n";
 const result=mergeLegacySchema(old,"sqlite");
 assert.match(result.schema,/customField/);assert.match(result.schema,/model Widget/);assert.match(result.schema,/model Session/);assert.match(result.schema,/scopes\s+Json/);assert(result.clearLegacyRefresh);assert(result.revokeLegacyKeys);assert(result.normalizations.length>=1);
 assert.throws(()=>mergeLegacySchema(old.replace("email              String","email              Int"),"sqlite"),/Incompatible customized field/);
});
