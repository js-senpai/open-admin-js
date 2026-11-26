/**
 * Plan a same-provider upgrade of a V1 project. Does not apply SQL, mark
 * migrations as applied, change source files, or write credentials.
 */
import {readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync} from "node:fs";
import {resolve,join} from "node:path";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
const {mergeLegacySchema,providers,schemaProvider}=await import("../packages/prisma/src/index.mjs").catch(()=>import("@openadminjs/prisma"));
const args=process.argv.slice(2);
if(args.length!==2||args[0]!=="--out")throw Error("Usage: node scripts/migrate-existing.mjs --out <new-directory> (DATABASE_URL must point to a staging copy)");
const root=process.cwd(),source=join(root,"prisma/schema.prisma"),out=resolve(args[1]);
if(existsSync(out))throw Error("Output directory already exists");
if(!process.env.DATABASE_URL)throw Error("Set DATABASE_URL explicitly to an isolated staging database");
const original=readFileSync(source,"utf8"),provider=schemaProvider(original);
if(!providers.includes(provider))throw Error("Unsupported provider");
const url=process.env.DATABASE_URL;
if(provider==="sqlite"?!url.startsWith("file:"):provider==="mysql"?!url.startsWith("mysql:"):!/^postgres(?:ql)?:/.test(url))throw Error("DATABASE_URL provider mismatch");
const plan=mergeLegacySchema(original,provider);
const prisma=join(root,"node_modules/prisma/build/index.js");
if(!existsSync(prisma))throw Error("Install this project's Prisma 6 CLI first");
function run(args,allowed=[0]){
 const r=spawnSync(process.execPath,[prisma,...args],{cwd:root,env:process.env,encoding:"utf8",maxBuffer:20*1024*1024});
 if(!allowed.includes(r.status))throw Error("Prisma command failed: "+args[0]+" "+args[1]+" (exit "+r.status+"). Validate schema/connection in staging.");
 return {status:r.status,stdout:r.stdout||""};
}
// Refuse a plan based on a stale datamodel. Never introspect and overwrite source.
const drift=run(["migrate","diff","--from-schema-datasource",source,"--to-schema-datamodel",source,"--exit-code"],[0,2]);
if(drift.status===2)throw Error("Live staging database differs from the supplied source schema; reconcile drift before planning");
mkdirSync(out,{recursive:false,mode:0o700});
const write=(name,value)=>writeFileSync(join(out,name),value,{flag:"wx",mode:0o600});
const target=join(out,"target.prisma");
write("target.prisma",plan.schema);
write("source.prisma",original);
run(["validate","--schema",target]);
const sql=run(["migrate","diff","--from-schema-datamodel",source,"--to-schema-datamodel",target,"--script"]).stdout;
const quote=name=>provider==="mysql"?"\x60"+name+"\x60":'"'+name+'"';
const cleanup=[];
if(provider==="sqlite")for(const {table,field} of plan.normalizations){const t=quote(table),f=quote(field);cleanup.push("UPDATE "+t+" SET "+f+" = json_quote("+f+") WHERE "+f+" IS NOT NULL AND NOT json_valid("+f+");");}
if(plan.clearLegacyRefresh&&/\brefreshTokenHash\s+String\?/.test(original))cleanup.push("UPDATE "+quote("User")+" SET "+quote("refreshTokenHash")+" = NULL;");
if(plan.revokeLegacyKeys&&/^model ApiToken\s*\{/m.test(original))cleanup.push("UPDATE "+quote("ApiToken")+" SET "+quote("revokedAt")+" = CURRENT_TIMESTAMP WHERE "+quote("revokedAt")+" IS NULL;");
const upgrade=(cleanup.length?"-- Preserve legacy JSON semantics and invalidate obsolete credentials.\n"+cleanup.join("\n")+"\n\n":"")+sql;
write("upgrade.sql",upgrade);
const history=join(root,"prisma/migrations");
const hasHistory=existsSync(history)&&readdirSync(history,{withFileTypes:true}).some(e=>e.isDirectory());
if(!hasHistory){
 const baseline=run(["migrate","diff","--from-empty","--to-schema-datamodel",source,"--script"]).stdout;
 write("baseline.sql",baseline);
 write("migration_lock.toml",'provider = "'+provider+'"\n');
}
const flags=upgrade.split("\n").filter(l=>/\bDROP\b|\bTRUNCATE\b|\bDELETE\s+FROM\b|ALTER\s+COLUMN|MODIFY\s+COLUMN|NOT NULL/i.test(l)).map(l=>l.trim()).slice(0,100);
// These are file integrity checksums, not credential hashes. The files contain schema/DDL, not rows.
const fileChecksum=name=>createHash("sha256").update(readFileSync(join(out,name))).digest("hex");
write("plan.json",JSON.stringify({provider,sourceSha256:fileChecksum("source.prisma"),targetSha256:fileChecksum("target.prisma"),upgradeSha256:fileChecksum("upgrade.sql"),hasMigrationHistory:hasHistory,changes:plan.changes,reviewRequired:flags},null,2)+"\n");
write("README.md",[
 "# Reviewed migration plan — never apply blindly",
 "",
 "Generated against a staging database whose schema matched the source datamodel. Source schema and database were not modified.",
 "Back up the database and files; stop writers. Review target.prisma, upgrade.sql and plan.json, including all table rebuilds and constraints. Check row counts, foreign keys, JSON values and legacy credential revocation after applying to a disposable copy.",
 hasHistory?"Existing migration history detected: do not create a duplicate baseline. For PostgreSQL projects with the original OpenAdminJS history, use the unchanged shipped migrations; do not apply this equivalent SQL on top. For customized histories, add reviewed SQL as a new migration only after checking the deployed migration history.":"No local migration history: confirm the database truly has no applied migration records. Copy baseline.sql into prisma/migrations/00000000000000_existing_baseline/migration.sql, copy migration_lock.toml, then mark that baseline applied with prisma migrate resolve --applied 00000000000000_existing_baseline --schema prisma/schema.prisma. Never execute baseline.sql against the existing database. Add upgrade.sql as a new timestamped migration.",
 "Replace schema.prisma with reviewed target.prisma, then run prisma migrate deploy and prisma generate in staging; run schema adopt to split the updated project without losing custom models.",
 "No automatic SQL application or rollback is provided. Restore the pre-migration database + application snapshot if staging fails. MySQL DDL is not generally transactional; SQLite table rebuilds require sufficient disk space.",
 "For SQLite legacy JSON, valid JSON text stays JSON; invalid text is converted to a JSON string. Review malformed scope values separately; obsolete API keys are revoked.",
].join("\n")+"\n");
console.log("Migration plan written to "+out+"; database unchanged. Review before applying.");
