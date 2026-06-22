import { IsEmail, IsOptional, IsString, Length } from "class-validator";

export class AuthDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(8, 80)
  password!: string;

  @IsOptional()
  @IsString()
  @Length(2, 40)
  displayName?: string;
}
