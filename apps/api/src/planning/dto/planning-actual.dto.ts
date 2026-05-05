import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const SOURCES = ['manual', 'import'] as const;
type ActualSource = (typeof SOURCES)[number];

/** Monatlicher Ist-Datensatz (anlegen). */
export class UpsertPlanningActualDto {
  @IsInt()
  @Min(1900)
  @Max(2200)
  year!: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @IsNumber()
  @Min(0)
  actualRevenue!: number;

  @IsNumber()
  @Min(0)
  actualCost!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  actualHours?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  actualOvertimeHours?: number;

  @IsOptional()
  @IsIn(SOURCES)
  source?: ActualSource;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/** Patch-Variante: alle Felder optional, year/month aenderbar. */
export class PatchPlanningActualDto {
  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2200)
  year?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  actualRevenue?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  actualCost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  actualHours?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  actualOvertimeHours?: number;

  @IsOptional()
  @IsIn(SOURCES)
  source?: ActualSource;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/** Optionaler Vermerk beim Restore einer alten Version. */
export class RestorePlanningVersionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  changeNote?: string;
}
