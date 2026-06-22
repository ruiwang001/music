import { IsBoolean, IsOptional, IsUUID } from "class-validator";

export class ToggleFollowDto {
  @IsUUID()
  creatorId!: string;

  @IsOptional()
  @IsBoolean()
  following?: boolean;
}
