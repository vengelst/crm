/**
 * Abstraktion fuer Quellen, aus denen Ist-Werte importiert werden koennen.
 *
 * Aktiv:
 *   - csv      → CsvActualsProvider (siehe csv-actuals-provider.ts)
 *
 * Vorbereitet (noch nicht implementiert):
 *   - manual   → kein Import; Eintraege ueber den Editor
 *   - datev    → DATEV-Connector (TODO)
 *   - erp      → generischer ERP-Connector (TODO)
 *
 * Provider liefern eine bereits geparste, normalisierte Liste von
 * `ParsedActualCandidate`-Eintraegen plus Format-Fehler. Sie kennen den
 * spezifischen Quelle-Layout-Wahnsinn — die ImportService bleibt
 * Provider-agnostisch und kuemmert sich nur um Validierung gegen die
 * Geschaeftsregeln, Duplikatstrategie und Persistenz.
 */

export type PlanningProviderType = 'csv' | 'manual' | 'datev' | 'erp';

/** Ein Kandidaten-Datensatz fuer einen Ist-Wert (bereits normalisiert). */
export type ParsedActualCandidate = {
  /** 1-basiert; bei CSV identisch mit der Zeilennummer der Quelldatei. */
  rowNumber: number;
  year: number;
  month: number;
  actualRevenue: number;
  actualCost: number;
  actualHours?: number;
  actualOvertimeHours?: number;
  source?: string;
  note?: string;
};

/** Ein Format-/Parse-Fehler einer Zeile (z. B. nicht-numerisches Feld). */
export type ParseError = {
  rowNumber: number;
  /** Maschinen-lesbarer Code, z. B. "MISSING_FIELD", "INVALID_NUMBER". */
  code: string;
  /** Menschen-lesbare Erklaerung (de). */
  message: string;
  /** Roher Eingabewert, falls fuer den Bericht nuetzlich. */
  raw?: string;
};

export type ProviderResult = {
  candidates: ParsedActualCandidate[];
  errors: ParseError[];
};

/** Implementiert von konkreten Providern (CSV etc.). */
export interface PlanningDataProvider {
  readonly type: PlanningProviderType;
  /** Parst die Eingabe und liefert Kandidaten + Format-Fehler. */
  parse(input: ProviderInput): Promise<ProviderResult> | ProviderResult;
}

/**
 * Eingabe-Container fuer Provider — heute nur `text` (CSV). Spaeter koennten
 * Connector-spezifische Felder (z. B. apiUrl, dateRange) hinzukommen.
 */
export type ProviderInput = {
  text?: string;
};

/** Registry fuer aktuell implementierte Provider. */
export const PROVIDER_TYPES: ReadonlyArray<PlanningProviderType> = [
  'csv',
  'manual',
  'datev',
  'erp',
];

/** Welche Provider liefern import-faehige Daten? */
export function isImportableProviderType(t: PlanningProviderType): boolean {
  return t === 'csv';
}
