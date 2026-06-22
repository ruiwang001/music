import { Transform } from "class-transformer";
import { IsArray, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";

export class CreateMvTaskDto {
  @IsUUID()
  songId!: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @MaxLength(1500)
  prompt?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(12)
  imageCount?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(160, { each: true })
  imageNames?: string[];
}
