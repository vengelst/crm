import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Max, Min } from 'class-validator';

/**
 * Patch-Form fuer das Default-Kapazitaetsprofil eines Szenarios.
 *
 * Wir bieten bewusst keine Listen-CRUD-Endpoints fuer Phase 9 an —
 * Mehrfachprofile (pro Team/Worker) sind im Schema vorgesehen, aber das
 * UI nutzt nur das Default-Profil. Spaetere Erweiterung (Team-spezifisch)
 * kann daran anknuepfen ohne Migration.
 */
export class PatchCapacityProfileDto {
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(168)
  weeklyTargetHours?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(1)
  availabilityFactor?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(1)
  productivityFactor?: number;
}
