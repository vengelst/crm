import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

/**
 * Workflow-Status fuer ein Szenario:
 *   DRAFT      → Bearbeitung; nur Ersteller / Office sieht es im Editor
 *   IN_REVIEW  → eingereicht, wartet auf Approver
 *   APPROVED   → freigegeben; kann als Baseline gesetzt werden
 *   REJECTED   → abgelehnt mit Pflichtkommentar; kann erneut eingereicht werden
 *   ARCHIVED   → terminal; bleibt fuer Audit erhalten
 */
export const SCENARIO_STATUSES = [
  'DRAFT',
  'IN_REVIEW',
  'APPROVED',
  'REJECTED',
  'ARCHIVED',
] as const;
export type ScenarioStatus = (typeof SCENARIO_STATUSES)[number];

/** Aktionen, die im DecisionLog persistiert werden. */
export const DECISION_ACTIONS = [
  'SUBMIT',
  'APPROVE',
  'REJECT',
  'ARCHIVE',
  'UNARCHIVE',
  'SET_BASELINE',
  'UNSET_BASELINE',
] as const;
export type DecisionAction = (typeof DECISION_ACTIONS)[number];

/** Optionaler Kommentar bei Submit/Approve. */
export class WorkflowCommentDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

/** Pflichtkommentar bei Reject. */
export class WorkflowRejectDto {
  @IsString()
  @MaxLength(2000)
  comment!: string;
}

export const PERIOD_TYPES = ['MONTH', 'QUARTER', 'YEAR'] as const;
export type PeriodType = (typeof PERIOD_TYPES)[number];

export class SetBaselineDto {
  @IsOptional()
  @IsString()
  locationId?: string | null;

  @IsOptional()
  @IsString()
  businessUnitId?: string | null;

  @IsString()
  @IsIn(PERIOD_TYPES)
  periodType!: PeriodType;

  /**
   * Periodenbezeichnung. Format haengt am Typ:
   *   MONTH   "YYYY-MM"        z. B. "2026-04"
   *   QUARTER "YYYY-QN"        z. B. "2026-Q2"
   *   YEAR    "YYYY"           z. B. "2026"
   * Wird beim Persist normalisiert (Whitespace getrimmt).
   */
  @IsString()
  @MaxLength(20)
  periodRef!: string;
}

export class CreateOrgRefDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsString()
  @MaxLength(40)
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'code darf nur Buchstaben, Zahlen, "-", "_" und "." enthalten',
  })
  code!: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class PatchOrgRefDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'code darf nur Buchstaben, Zahlen, "-", "_" und "." enthalten',
  })
  code?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/** Erweitert die bestehenden Scenario-Felder um Phase-7-Tags. */
export class ScenarioOrgPatchDto {
  @IsOptional()
  @IsString()
  locationId?: string | null;

  @IsOptional()
  @IsString()
  businessUnitId?: string | null;
}
