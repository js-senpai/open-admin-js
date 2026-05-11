import { Injectable } from "@nestjs/common";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createLogger, format, transports, type Logger } from "winston";
import DailyRotateFile from "winston-daily-rotate-file";

type LogLevel = "info" | "error";

type QueryLogsInput = {
  level?: LogLevel;
  search?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
};

type ParsedLog = {
  timestamp: string;
  level: string;
  message: string;
  context?: string;
  path?: string;
  method?: string;
  statusCode?: number;
  durationMs?: number;
  userId?: string;
  ip?: string;
};

@Injectable()
export class AppLoggerService {
  private readonly dir = join(process.cwd(), "logs");
  private readonly logger: Logger;

  constructor() {
    this.ensureDir();
    this.logger = createLogger({
      level: "info",
      format: format.combine(format.timestamp(), format.json()),
      transports: [
        new DailyRotateFile({
          dirname: this.dir,
          filename: "info-%DATE%.log",
          datePattern: "YYYY-MM-DD",
          level: "info",
          maxFiles: "7d",
          zippedArchive: false
        }),
        new DailyRotateFile({
          dirname: this.dir,
          filename: "error-%DATE%.log",
          datePattern: "YYYY-MM-DD",
          level: "error",
          maxFiles: "30d",
          zippedArchive: false
        }),
        ...(process.env.NODE_ENV !== "production"
          ? [new transports.Console({ format: format.combine(format.colorize(), format.simple()) })]
          : [])
      ]
    });
  }

  info(message: string, meta?: Record<string, unknown>) {
    this.logger.info(message, meta);
  }

  error(message: string, meta?: Record<string, unknown>) {
    this.logger.error(message, meta);
  }

  async query(input: QueryLogsInput) {
    const level = input.level === "error" ? "error" : "info";
    const page = Math.max(1, Number(input.page ?? 1));
    const limit = Math.min(200, Math.max(1, Number(input.limit ?? 50)));
    const search = input.search?.trim().toLowerCase() ?? "";
    const fromMs = input.from ? Date.parse(input.from) : NaN;
    const toMs = input.to ? Date.parse(input.to) : NaN;

    const files = await this.pickFiles(level);
    const all: ParsedLog[] = [];
    for (const file of files) {
      const full = join(this.dir, file);
      const content = await readFile(full, "utf8").catch(() => "");
      if (!content) continue;
      const lines = content.split("\n");
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line) as ParsedLog;
          const ts = Date.parse(String(parsed.timestamp ?? ""));
          if (!Number.isNaN(fromMs) && (Number.isNaN(ts) || ts < fromMs)) continue;
          if (!Number.isNaN(toMs) && (Number.isNaN(ts) || ts > toMs + 86_400_000)) continue;
          if (search) {
            const blob = JSON.stringify(parsed).toLowerCase();
            if (!blob.includes(search)) continue;
          }
          all.push(parsed);
        } catch {
          // skip malformed line
        }
      }
    }

    all.sort((a, b) => Date.parse(String(b.timestamp ?? 0)) - Date.parse(String(a.timestamp ?? 0)));
    const total = all.length;
    const start = (page - 1) * limit;
    const data = all.slice(start, start + limit);
    return {
      data,
      meta: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit))
      }
    };
  }

  private async pickFiles(level: LogLevel): Promise<string[]> {
    await this.ensureDir();
    const entries = await readdir(this.dir).catch(() => []);
    return entries
      .filter((name) => name.startsWith(`${level}-`) && name.endsWith(".log"))
      .sort()
      .reverse()
      .slice(0, level === "error" ? 31 : 8);
  }

  private async ensureDir() {
    if (!existsSync(this.dir)) {
      await mkdir(this.dir, { recursive: true });
    }
  }
}

