import { IsNumber, IsOptional, Max, Min, ValidateIf } from 'class-validator';

/**
 * Optionale Zielwerte pro Szenario. Werte koennen einzeln gesetzt oder per
 * `null` explizit zurueckgesetzt werden (z. B. wenn ein Ziel nicht mehr
 * gepflegt wird).
 */
export class UpdatePlanningTargetsDto {
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1_000_000_000)
  targetMonthlyRevenue?: number | null;

  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsOptional()
  @IsNumber()
  @Min(-1_000_000_000)
  @Max(1_000_000_000)
  targetMonthlyMargin?: number | null;

  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsOptional()
  @IsNumber()
  @Min(-100)
  @Max(100)
  targetMarginPercent?: number | null;
}
