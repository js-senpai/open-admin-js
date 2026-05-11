import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class ResourceReorderDto {
  /** Ids in desired order (first = lowest `order` value). */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  ids!: string[];

  /** When reordering a single page, pass `(page - 1) * pageSize` so `order` stays globally consistent. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  baseIndex?: number;
}
