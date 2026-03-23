import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
} from 'class-validator';
import { ProjectStatus, ServiceType } from '@prisma/client';

export class SaveProjectDto {
  @IsOptional()
  @IsString()
  projectNumber?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(ServiceType)
  serviceType?: ServiceType;

  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsString()
  siteName?: string;

  @IsOptional()
  @IsString()
  siteAddressLine1?: string;

  @IsOptional()
  @IsString()
  sitePostalCode?: string;

  @IsOptional()
  @IsString()
  siteCity?: string;

  @IsOptional()
  @IsString()
  siteCountry?: string;

  @IsOptional()
  @IsString()
  accommodationAddress?: string;

  @IsOptional()
  @IsDateString()
  plannedStartDate?: string;

  @IsOptional()
  @IsDateString()
  plannedEndDate?: string;

  @IsOptional()
  @IsString()
  internalProjectManagerUserId?: string;

  @IsOptional()
  @IsString()
  primaryCustomerContactId?: string;

  @IsOptional()
  @IsString()
  pauseRuleId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
