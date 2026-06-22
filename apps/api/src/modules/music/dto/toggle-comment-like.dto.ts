import { IsBoolean, IsOptional } from "class-validator";

export class ToggleCommentLikeDto {
  @IsOptional()
  @IsBoolean()
  liked?: boolean;
}
