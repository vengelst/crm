import { IsArray, IsEmail, IsOptional, IsString } from 'class-validator';

export class SendTimesheetEmailDto {
  @IsArray()
  @IsEmail({}, { each: true })
  recipients!: string[];

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  message?: string;
}
