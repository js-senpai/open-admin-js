import { spawn } from "node:child_process";
import type { PackageManager } from "./adapt-package-manager.js";
import { runScriptPrefix } from "./detect-package-manager.js";

export type DbAction = "migrate" | "seed" | "studio" | "reset";

export type DbCommand = {
  cmd: string;
  args: string[];
  /** Human-readable form for --dry-run / logging. */
  label: string;
  /** True for destructive commands that require explicit confirmation. */
  destructive: boolean;
};

const DB_SCRIPTS: Record<string, string> = {
  "migrate:dev": "db:migrate",
  "migrate:deploy": "db:migrate:deploy",
  seed: "db:seed",
  studio: "db:studio",
  reset: "db:reset"
};

/**
 * Builds the process invocation for a db command using an argument array (never
 * an interpolated shell string), so user input cannot inject shell commands.
 */
export function buildDbCommand(
  action: DbAction,
  mode: string | undefined,
  pm: PackageManager
): DbCommand {
  let key: string;
  let destructive = false;
  switch (action) {
    case "migrate": {
      const m = (mode ?? "dev").toLowerCase();
      if (m !== "dev" && m !== "deploy") {
        throw new Error(`Unknown migrate mode "${mode}". Use "dev" or "deploy".`);
      }
      key = `migrate:${m}`;
      break;
    }
    case "seed":
      key = "seed";
      break;
    case "studio":
      key = "studio";
      break;
    case "reset":
      key = "reset";
      destructive = true;
      break;
    default:
      throw new Error(`Unknown db action "${action}". Use: migrate, seed, studio, reset.`);
  }

  const script = DB_SCRIPTS[key];
  if (!script) throw new Error(`No script mapping for "${key}".`);
  const [cmd, args] = runScriptPrefix(pm, script);
  return { cmd, args, label: `${cmd} ${args.join(" ")}`, destructive };
}

/**
 * Spawns a command inheriting stdio, forwarding SIGINT/SIGTERM to the child, and
 * resolving with the child's exit code.
 */
export function runInherit(cmd: string, args: string[], cwd: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: "inherit" });
    const forward = (signal: NodeJS.Signals) => {
      if (!child.killed) child.kill(signal);
    };
    process.on("SIGINT", forward);
    process.on("SIGTERM", forward);
    const cleanup = () => {
      process.off("SIGINT", forward);
      process.off("SIGTERM", forward);
    };
    child.on("error", (err) => {
      cleanup();
      reject(err);
    });
    child.on("close", (code, signal) => {
      cleanup();
      if (signal) {
        resolve(1);
        return;
      }
      resolve(code ?? 0);
    });
  });
}
