import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const ALERT_METRICS = [
  'marginPercent',
  'deltaRevenuePercent',
  'deltaCostPercent',
  'negativeMarginStreak',
  // Phase 8 Cashflow-/Budget-Metriken (alle pro Default-/Baseline-Szenario):
  'cashBalance',
  'negativeCashflowStreak',
  'capexShare',
  // Phase 9 Kapazitaets-Metriken:
  'utilizationPercent',
  'capacityDeltaHours',
  'overloadWeeksStreak',
  // Phase 10 Pipeline-Metriken:
  'pipelineWeighted',
  'pipelineEarlyStageShare',
] as const;
export type AlertMetric = (typeof ALERT_METRICS)[number];

export const ALERT_OPERATORS = ['lt', 'lte', 'gt', 'gte'] as const;
export type AlertOperator = (typeof ALERT_OPERATORS)[number];

export const ALERT_SEVERITIES = ['INFO', 'WARN', 'CRITICAL'] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export const ALERT_STATUSES = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED'] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

export class CreatePlanningAlertRuleDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  scenarioId?: string;

  @IsString()
  @IsIn(ALERT_METRICS)
  metric!: AlertMetric;

  @IsString()
  @IsIn(ALERT_OPERATORS)
  operator!: AlertOperator;

  @IsNumber()
  @Type(() => Number)
  threshold!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  consecutiveMonths?: number;

  @IsOptional()
  @IsString()
  @IsIn(ALERT_SEVERITIES)
  severity?: AlertSeverity;

  @IsOptional()
  @IsBoolean()
  channelInApp?: boolean;

  @IsOptional()
  @IsBoolean()
  channelEmail?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class PatchPlanningAlertRuleDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  scenarioId?: string | null;

  @IsOptional()
  @IsString()
  @IsIn(ALERT_METRICS)
  metric?: AlertMetric;

  @IsOptional()
  @IsString()
  @IsIn(ALERT_OPERATORS)
  operator?: AlertOperator;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  threshold?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  consecutiveMonths?: number;

  @IsOptional()
  @IsString()
  @IsIn(ALERT_SEVERITIES)
  severity?: AlertSeverity;

  @IsOptional()
  @IsBoolean()
  channelInApp?: boolean;

  @IsOptional()
  @IsBoolean()
  channelEmail?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
