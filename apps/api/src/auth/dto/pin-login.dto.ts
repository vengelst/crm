import { IsString, Length } from 'class-validator';

export class PinLoginDto {
  @IsString()
  workerNumber!: string;

  @IsString()
  @Length(4, 8)
  pin!: string;
}
