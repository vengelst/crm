import { IsIn, IsOptional, IsString } from 'class-validator';

/** Strategie bei (year, month)-Duplikat. */
export const DUPLICATE_STRATEGIES = ['skip', 'overwrite'] as const;
export type DuplicateStrategy = (typeof DUPLICATE_STRATEGIES)[number];

/**
 * Wird sowohl fuer Dry-Run als auch Commit als zusaetzliches Form-Feld
 * neben der CSV-Datei geschickt. Aus Multipart-Body kommen alle Felder
 * als Strings, daher kein `IsEnum` mit Coercion-Magie.
 */
export class PlanningImportOptionsDto {
  @IsOptional()
  @IsString()
  @IsIn(DUPLICATE_STRATEGIES)
  duplicateStrategy?: DuplicateStrategy;
}
