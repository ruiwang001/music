import { Transform } from "class-transformer";
import { IsString, IsUUID, Length } from "class-validator";

export class CreateCommentDto {
  @IsUUID()
  songId!: string;

  @IsString()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @Length(1, 500)
  body!: string;
}
