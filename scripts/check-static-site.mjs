import { existsSync, readFileSync } from "node:fs";

const required = ["site/index.html", "site/assets/css/styles.css", "site/assets/js/main.js"];

const missing = required.filter((file) => !existsSync(file));
if (missing.length) {
  console.error(`Static site check failed. Missing:\n${missing.map((file) => `- ${file}`).join("\n")}`);
  process.exit(1);
}

const index = readFileSync("site/index.html", "utf8");
if (!index.includes("OpenAdminJS") || !index.includes("./assets/css/styles.css")) {
  console.error("Static site check failed. Landing page must reference OpenAdminJS and styles.");
  process.exit(1);
}

console.log("Static site check passed.");
