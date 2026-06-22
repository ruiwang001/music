import { IsString, MinLength } from "class-validator";

export class VerifyIapDto {
  @IsString()
  productId!: string;

  @IsString()
  @MinLength(10)
  signedTransactionInfo!: string;
}
