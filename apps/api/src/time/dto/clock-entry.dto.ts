import { IsNumber, IsOptional, IsString } from 'class-validator';

export class ClockEntryDto {
  @IsString()
  workerId!: string;

  @IsString()
  projectId!: string;

  @IsOptional()
  @IsString()
  occurredAtClient?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsNumber()
  accuracy?: number;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsString()
  sourceDevice?: string;
}
