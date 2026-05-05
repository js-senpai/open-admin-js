import { chmodSync, existsSync } from "node:fs";

const file = process.argv[2];
if (file && existsSync(file)) chmodSync(file, 0o755);
