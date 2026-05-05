import {
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Eingaben fuer ein Planungsszenario (Erstellen/Aktualisieren). Alle Werte
 * sind nicht-negative Zahlen. `weeksPerMonth` ist optional und faellt im
 * Backend auf den Default 4.33 zurueck.
 */
export class UpsertPlanningScenarioDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsNumber()
  @Min(0)
  @Max(1000)
  teamsPerWeek!: number;

  @IsNumber()
  @Min(0)
  @Max(1000)
  workersPerTeam!: number;

  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  costPerWorkerWeek!: number;

  @IsNumber()
  @Min(0)
  @Max(168)
  regularHoursPerWorkerWeek!: number;

  @IsNumber()
  @Min(0)
  @Max(168)
  overtimeHoursPerWorkerWeek!: number;

  @IsNumber()
  @Min(0)
  @Max(10_000)
  regularRatePerHour!: number;

  @IsNumber()
  @Min(0)
  @Max(10_000)
  overtimeRatePerHour!: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(6)
  weeksPerMonth?: number;
}

export class PatchPlanningScenarioDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1000)
  teamsPerWeek?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1000)
  workersPerTeam?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  costPerWorkerWeek?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(168)
  regularHoursPerWorkerWeek?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(168)
  overtimeHoursPerWorkerWeek?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10_000)
  regularRatePerHour?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10_000)
  overtimeRatePerHour?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(6)
  weeksPerMonth?: number;
}
