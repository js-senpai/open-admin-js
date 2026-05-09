import { IsArray, IsBoolean, IsIn, IsObject, IsOptional, IsString } from "class-validator";

const PLUGIN_CAPABILITIES = [
  "db.read",
  "db.write",
  "resource.hooks",
  "api.hooks",
  "api.routes",
  "media.pipeline",
  "seo.extend",
  "jobs.run",
  "admin.ui.extend"
] as const;

type PluginCapability = (typeof PLUGIN_CAPABILITIES)[number];

export class AddPluginDto {
  @IsString()
  id!: string;

  @IsOptional()
  @IsString()
  bundled?: string;

  @IsOptional()
  @IsString()
  package?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsIn(["trusted", "sandboxed"])
  trustMode?: "trusted" | "sandboxed";

  @IsOptional()
  @IsArray()
  @IsIn(PLUGIN_CAPABILITIES, { each: true })
  capabilities?: PluginCapability[];

  /** When true and `package` is set, runs `pnpm add <package> --filter @openadminjs/api` (dev / non-production only). */
  @IsOptional()
  @IsBoolean()
  runPnpmInstall?: boolean;
}

export class PatchPluginDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsIn(["trusted", "sandboxed"])
  trustMode?: "trusted" | "sandboxed";

  @IsOptional()
  @IsArray()
  @IsIn(PLUGIN_CAPABILITIES, { each: true })
  capabilities?: PluginCapability[];
}
