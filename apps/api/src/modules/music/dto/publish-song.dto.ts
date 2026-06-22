import { IsUUID } from "class-validator";

export class PublishSongDto {
  @IsUUID()
  songId!: string;
}
