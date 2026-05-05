import { Injectable } from '@nestjs/common';
import {
  CsvFormatError,
  CsvRow,
  parseCsv,
} from './csv-parser';
import {
  ParseError,
  ParsedActualCandidate,
  PlanningDataProvider,
  ProviderInput,
  ProviderResult,
} from './data-provider';

/**
 * Provider fuer monatliche Ist-Werte im CSV-Format.
 *
 * Erwarteter Header (Reihenfolge egal, exakte Schreibweise):
 *   year, month, actualRevenue, actualCost, actualHours?, actualOvertimeHours?, source?, note?
 *
 * Plausibilitaetspruefungen:
 *   - Pflichtfelder vorhanden + nicht leer (year, month, actualRevenue, actualCost)
 *   - year in [2020, 2100], month in [1, 12]
 *   - Numerische Felder: nicht negativ, gueltige Zahl
 *   - source ∈ {manual, import} oder leer (Default "import")
 *
 * Hinweis: Duplikatpruefung (gleiche year/month gegen DB) ist NICHT Teil
 * des Providers — die uebernimmt der ImportService gegen die DB.
 */

const REQUIRED_HEADERS = [
  'year',
  'month',
  'actualRevenue',
  'actualCost',
] as const;

const KNOWN_HEADERS = new Set([
  'year',
  'month',
  'actualRevenue',
  'actualCost',
  'actualHours',
  'actualOvertimeHours',
  'source',
  'note',
]);

const MIN_YEAR = 2020;
const MAX_YEAR = 2100;

const ALLOWED_SOURCES = new Set(['manual', 'import']);

@Injectable()
export class CsvActualsProvider implements PlanningDataProvider {
  readonly type = 'csv' as const;

  parse(input: ProviderInput): ProviderResult {
    const text = input.text ?? '';
    if (!text.trim()) {
      return {
        candidates: [],
        errors: [
          {
            rowNumber: 1,
            code: 'EMPTY_FILE',
            message: 'Datei ist leer.',
          },
        ],
      };
    }
    let parsed;
    try {
      parsed = parseCsv(text);
    } catch (e) {
      const err = e as CsvFormatError;
      return {
        candidates: [],
        errors: [
          {
            rowNumber: err.rowNumber ?? 1,
            code: 'CSV_FORMAT',
            message: err.message,
          },
        ],
      };
    }
    const headerErrors = validateHeaders(parsed.headers);
    if (headerErrors.length > 0) {
      return { candidates: [], errors: headerErrors };
    }
    const candidates: ParsedActualCandidate[] = [];
    const errors: ParseError[] = [];
    const seen = new Map<string, number>();
    for (const row of parsed.rows) {
      const result = parseRow(row);
      if ('error' in result) {
        errors.push(...result.error);
        continue;
      }
      const key = `${result.candidate.year}-${result.candidate.month}`;
      const previous = seen.get(key);
      if (previous != null) {
        errors.push({
          rowNumber: row.rowNumber,
          code: 'DUPLICATE_IN_FILE',
          message: `Doppelter Eintrag fuer ${key} (zuvor bereits in Zeile ${previous}).`,
        });
        continue;
      }
      seen.set(key, row.rowNumber);
      candidates.push(result.candidate);
    }
    return { candidates, errors };
  }
}

function validateHeaders(headers: string[]): ParseError[] {
  const errors: ParseError[] = [];
  for (const required of REQUIRED_HEADERS) {
    if (!headers.includes(required)) {
      errors.push({
        rowNumber: 1,
        code: 'MISSING_HEADER',
        message: `Pflichtspalte "${required}" fehlt im Header.`,
      });
    }
  }
  for (const h of headers) {
    if (h && !KNOWN_HEADERS.has(h)) {
      errors.push({
        rowNumber: 1,
        code: 'UNKNOWN_HEADER',
        message: `Unbekannte Spalte "${h}" wird ignoriert.`,
      });
    }
  }
  return errors.filter((e) => e.code !== 'UNKNOWN_HEADER');
  // Anmerkung: Unbekannte Spalten werden bewusst nur als Hinweis vermerkt,
  // brechen den Import aber nicht ab — daher hier herausgefiltert.
  // (Hilft dabei, leichte Header-Abweichungen aus Excel zu ueberleben.)
}

type RowResult =
  | { candidate: ParsedActualCandidate }
  | { error: ParseError[] };

function parseRow(row: CsvRow): RowResult {
  const errors: ParseError[] = [];
  const c = row.cells;

  const year = parseInteger(c.year, 'year', row.rowNumber, errors);
  const month = parseInteger(c.month, 'month', row.rowNumber, errors);
  const actualRevenue = parseFloatField(
    c.actualRevenue,
    'actualRevenue',
    row.rowNumber,
    errors,
  );
  const actualCost = parseFloatField(
    c.actualCost,
    'actualCost',
    row.rowNumber,
    errors,
  );
  const actualHours = parseOptionalFloat(
    c.actualHours,
    'actualHours',
    row.rowNumber,
    errors,
  );
  const actualOvertimeHours = parseOptionalFloat(
    c.actualOvertimeHours,
    'actualOvertimeHours',
    row.rowNumber,
    errors,
  );

  if (year != null && (year < MIN_YEAR || year > MAX_YEAR)) {
    errors.push({
      rowNumber: row.rowNumber,
      code: 'OUT_OF_RANGE',
      message: `Jahr "${year}" liegt ausserhalb von ${MIN_YEAR}..${MAX_YEAR}.`,
      raw: c.year,
    });
  }
  if (month != null && (month < 1 || month > 12)) {
    errors.push({
      rowNumber: row.rowNumber,
      code: 'OUT_OF_RANGE',
      message: `Monat "${month}" muss zwischen 1 und 12 liegen.`,
      raw: c.month,
    });
  }
  if (actualRevenue != null && actualRevenue < 0) {
    errors.push({
      rowNumber: row.rowNumber,
      code: 'NEGATIVE_VALUE',
      message: 'actualRevenue darf nicht negativ sein.',
      raw: c.actualRevenue,
    });
  }
  if (actualCost != null && actualCost < 0) {
    errors.push({
      rowNumber: row.rowNumber,
      code: 'NEGATIVE_VALUE',
      message: 'actualCost darf nicht negativ sein.',
      raw: c.actualCost,
    });
  }
  if (actualHours != null && actualHours < 0) {
    errors.push({
      rowNumber: row.rowNumber,
      code: 'NEGATIVE_VALUE',
      message: 'actualHours darf nicht negativ sein.',
      raw: c.actualHours,
    });
  }
  if (actualOvertimeHours != null && actualOvertimeHours < 0) {
    errors.push({
      rowNumber: row.rowNumber,
      code: 'NEGATIVE_VALUE',
      message: 'actualOvertimeHours darf nicht negativ sein.',
      raw: c.actualOvertimeHours,
    });
  }

  let source: string | undefined;
  if (c.source) {
    if (!ALLOWED_SOURCES.has(c.source)) {
      errors.push({
        rowNumber: row.rowNumber,
        code: 'INVALID_SOURCE',
        message: `Unbekannter Quelltyp "${c.source}". Erlaubt: manual, import.`,
        raw: c.source,
      });
    } else {
      source = c.source;
    }
  }

  const note = c.note ? c.note.slice(0, 500) : undefined;

  if (errors.length > 0) {
    return { error: errors };
  }
  return {
    candidate: {
      rowNumber: row.rowNumber,
      year: year as number,
      month: month as number,
      actualRevenue: actualRevenue as number,
      actualCost: actualCost as number,
      actualHours,
      actualOvertimeHours,
      source: source ?? 'import',
      note,
    },
  };
}

function parseInteger(
  raw: string | undefined,
  field: string,
  rowNumber: number,
  errors: ParseError[],
): number | null {
  const v = (raw ?? '').trim();
  if (!v) {
    errors.push({
      rowNumber,
      code: 'MISSING_FIELD',
      message: `Pflichtfeld "${field}" fehlt.`,
    });
    return null;
  }
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n) || String(n) !== v) {
    errors.push({
      rowNumber,
      code: 'INVALID_NUMBER',
      message: `Feld "${field}" ist keine gueltige Ganzzahl: "${v}".`,
      raw: v,
    });
    return null;
  }
  return n;
}

function parseFloatField(
  raw: string | undefined,
  field: string,
  rowNumber: number,
  errors: ParseError[],
): number | null {
  const v = (raw ?? '').trim();
  if (!v) {
    errors.push({
      rowNumber,
      code: 'MISSING_FIELD',
      message: `Pflichtfeld "${field}" fehlt.`,
    });
    return null;
  }
  // Komma als Dezimaltrennzeichen erlauben — Standard in DE/AT.
  const normalized = v.replace(/\s/g, '').replace(',', '.');
  const n = Number.parseFloat(normalized);
  if (!Number.isFinite(n)) {
    errors.push({
      rowNumber,
      code: 'INVALID_NUMBER',
      message: `Feld "${field}" ist keine gueltige Zahl: "${v}".`,
      raw: v,
    });
    return null;
  }
  return n;
}

function parseOptionalFloat(
  raw: string | undefined,
  field: string,
  rowNumber: number,
  errors: ParseError[],
): number | undefined {
  const v = (raw ?? '').trim();
  if (!v) return undefined;
  const normalized = v.replace(/\s/g, '').replace(',', '.');
  const n = Number.parseFloat(normalized);
  if (!Number.isFinite(n)) {
    errors.push({
      rowNumber,
      code: 'INVALID_NUMBER',
      message: `Feld "${field}" ist keine gueltige Zahl: "${v}".`,
      raw: v,
    });
    return undefined;
  }
  return n;
}
