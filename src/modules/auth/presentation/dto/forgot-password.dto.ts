import { IsEmail, IsString, MaxLength } from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail()
  @IsString()
  @MaxLength(254)
  email!: string;
}
