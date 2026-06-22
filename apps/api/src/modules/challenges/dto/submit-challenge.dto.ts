import { IsUUID } from "class-validator";

export class SubmitChallengeDto {
  @IsUUID()
  songId!: string;
}
