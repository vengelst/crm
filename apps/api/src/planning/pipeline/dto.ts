import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Standardisierte Pipeline-Stufen. Nicht-aufgefuehrte Werte werden vom
 * Service abgewiesen, damit das UI eine geschlossene Auswahl hat. Die
 * Schema-Spalte bleibt bewusst String, damit eine spaetere Erweiterung
 * (z. B. zusaetzliche Stages pro Mandant) ohne Migration moeglich ist.
 */
export const PIPELINE_STAGES = [
  'LEAD',
  'QUALIFIED',
  'OFFERED',
  'NEGOTIATION',
  'WON',
  'LOST',
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const PIPELINE_SCENARIOS = ['base', 'best', 'worst'] as const;
export type PipelineScenario = (typeof PIPELINE_SCENARIOS)[number];

export const PIPELINE_RANGES = ['month', 'quarter', 'halfyear'] as const;
export type PipelineRange = (typeof PIPELINE_RANGES)[number];

export class CreatePipelineItemDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  customerId?: string | null;

  @IsOptional()
  @IsString()
  projectId?: string | null;

  @IsOptional()
  @IsString()
  ownerUserId?: string | null;

  @IsString()
  @IsIn(PIPELINE_STAGES)
  stage!: PipelineStage;

  @IsNumber()
  @Type(() => Number)
  @Min(0)
  amountTotal!: number;

  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  winProbability!: number;

  @IsDateString()
  expectedStartDate!: string;

  @IsOptional()
  @IsDateString()
  expectedEndDate?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  expectedWeeklyHours?: number | null;

  @IsOptional()
  @IsString()
  locationId?: string | null;

  @IsOptional()
  @IsString()
  businessUnitId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class PatchPipelineItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  customerId?: string | null;

  @IsOptional()
  @IsString()
  projectId?: string | null;

  @IsOptional()
  @IsString()
  ownerUserId?: string | null;

  @IsOptional()
  @IsString()
  @IsIn(PIPELINE_STAGES)
  stage?: PipelineStage;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  amountTotal?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  winProbability?: number;

  @IsOptional()
  @IsDateString()
  expectedStartDate?: string;

  @IsOptional()
  @IsDateString()
  expectedEndDate?: string | null;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  expectedWeeklyHours?: number | null;

  @IsOptional()
  @IsString()
  locationId?: string | null;

  @IsOptional()
  @IsString()
  businessUnitId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}
