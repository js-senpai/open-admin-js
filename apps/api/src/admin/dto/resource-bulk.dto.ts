import { ArrayMaxSize, ArrayMinSize, IsArray, IsObject, IsOptional, IsString } from "class-validator";

export class ResourceBulkDto {
  /** Use `"delete"` for bulk delete, or a key from `resource.actions`. */
  @IsString()
  action!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsString({ each: true })
  ids!: string[];

  @IsOptional()
  @IsObject()
  input?: Record<string, unknown>;
}
