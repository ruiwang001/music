import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import type { SongMode } from "../../../common/domain/plans";

export class GenerateMusicDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsString()
  @MinLength(4)
  @MaxLength(500)
  theme!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  style!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  mood!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  lyrics?: string;

  @IsIn(["instrumental", "vocal"])
  mode!: SongMode;

  @IsOptional()
  @IsBoolean()
  lyricsOptimizer?: boolean;

  @IsOptional()
  @IsString()
  referenceAudioUrl?: string;
}
