import { IsDateString, IsOptional, IsString } from 'class-validator';

export class AssignWorkerDto {
  @IsString()
  workerId!: string;

  @IsOptional()
  @IsString()
  roleName?: string;

  @IsDateString()
  startDate!: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
