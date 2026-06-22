import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class ReviewWithdrawalDto {
  @IsIn(["approved", "rejected"])
  decision!: "approved" | "rejected";

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  riskNote?: string;
}
