import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const COST_TYPES = ['OPEX', 'CAPEX'] as const;
export type CostType = (typeof COST_TYPES)[number];

export const FREQUENCIES = ['ONE_TIME', 'MONTHLY', 'QUARTERLY'] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export class CreateBudgetItemDto {
  @IsString()
  @MaxLength(80)
  category!: string;

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsString()
  @IsIn(COST_TYPES)
  costType!: CostType;

  @IsNumber()
  @Type(() => Number)
  amount!: number;

  @IsString()
  @IsIn(FREQUENCIES)
  frequency!: Frequency;

  @IsDateString()
  startDate!: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  locationId?: string | null;

  @IsOptional()
  @IsString()
  businessUnitId?: string | null;
}

export class PatchBudgetItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @IsIn(COST_TYPES)
  costType?: CostType;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  amount?: number;

  @IsOptional()
  @IsString()
  @IsIn(FREQUENCIES)
  frequency?: Frequency;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string | null;

  @IsOptional()
  @IsString()
  locationId?: string | null;

  @IsOptional()
  @IsString()
  businessUnitId?: string | null;
}

export class PatchCashflowConfigDto {
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  startingCash?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(180)
  revenueDelayDays?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(180)
  expenseDelayDays?: number;
}
