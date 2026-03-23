import { IsOptional, IsString } from 'class-validator';

export class SignTimesheetDto {
  @IsString()
  signerName!: string;

  @IsOptional()
  @IsString()
  signerRole?: string;

  @IsString()
  signatureImagePath!: string;

  @IsOptional()
  @IsString()
  deviceInfo?: string;
}
