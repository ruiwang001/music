import { IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import type { Plan } from "../../../common/domain/plans";

export class CreateChallengeDto {
  @IsString()
  @MaxLength(120)
  title!: string;

  @IsString()
  @MaxLength(500)
  theme!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsISO8601()
  startsAt!: string;

  @IsISO8601()
  endsAt!: string;

  @IsIn(["free", "pro", "creator"])
  minPlan!: Plan;

  @IsInt()
  @Min(0)
  @Max(100000)
  rewardPoints!: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
