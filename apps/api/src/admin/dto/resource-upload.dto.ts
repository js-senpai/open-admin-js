import { IsOptional, IsString, MaxLength } from "class-validator";

export class ResourceUploadDto {
  @IsString()
  @MaxLength(260)
  filename!: string;

  @IsString()
  @MaxLength(120)
  mimeType!: string;

  /** Base64 body without data-uri prefix. */
  @IsString()
  contentBase64!: string;

  @IsOptional()
  @IsString()
  @MaxLength(260)
  targetPath?: string;
}
