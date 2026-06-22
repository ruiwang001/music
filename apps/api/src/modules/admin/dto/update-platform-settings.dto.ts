import { IsInt, IsOptional, Max, Min } from "class-validator";

export class UpdatePlatformSettingsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  pointsPerUsdc?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000000)
  minWithdrawalPoints?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  publishRewardPoints?: number;
}
