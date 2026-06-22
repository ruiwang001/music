import { IsInt, IsString, Max, MaxLength, Min, MinLength } from "class-validator";

export class ClaimRewardDto {
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  walletAddress!: string;

  @IsInt()
  @Min(10)
  @Max(100000)
  amountPoints!: number;
}
