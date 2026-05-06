import { IsString, MaxLength } from 'class-validator';

export class ResendVerificationDto {
  @IsString()
  @MaxLength(254)
  email!: string;
}
