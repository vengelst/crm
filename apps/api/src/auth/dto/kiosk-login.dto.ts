import { IsString, Length } from 'class-validator';

export class KioskLoginDto {
  @IsString()
  @Length(4, 8)
  pin!: string;
}
