import { IsArray, IsBoolean, IsIn, IsObject, IsOptional, IsString } from "class-validator";

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
  @IsString({ each: true })
  capabilities?: string[];

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
  @IsString({ each: true })
  capabilities?: string[];
}
