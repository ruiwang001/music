import { IsBoolean, IsOptional, IsUUID } from "class-validator";

export class ToggleSongReactionDto {
  @IsUUID()
  songId!: string;

  @IsOptional()
  @IsBoolean()
  liked?: boolean;

  @IsOptional()
  @IsBoolean()
  favorited?: boolean;
}
