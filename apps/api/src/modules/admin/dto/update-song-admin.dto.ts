import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateSongAdminDto {
  @IsOptional()
  @IsIn(["private", "public"])
  visibility?: "private" | "public";

  @IsOptional()
  @IsString()
  @MaxLength(300)
  moderationNote?: string;
}
