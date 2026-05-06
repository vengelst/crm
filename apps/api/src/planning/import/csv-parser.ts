/**
 * Minimaler CSV-Parser ohne externe Dependency.
 *
 * Unterstuetzt nur den fuer den Actuals-Import benoetigten Subset von RFC 4180:
 *   - Komma als Trenner
 *   - UTF-8 (BOM wird erkannt und entfernt)
 *   - Doppel-Quote escaping (`"foo""bar"` → `foo"bar`)
 *   - LF und CRLF Zeilentrenner
 *   - Leerzeilen werden ignoriert
 *
 * Liefert ein Header-Objekt + eine Liste von Daten-Zeilen mit Zeilennummer
 * (1-basiert, inklusive Header-Zeile, sodass die Nummern direkt mit der
 * Original-Datei abgleichbar sind).
 */

export type CsvRow = {
  /** 1-basierte Zeilennummer in der Original-Datei (Header = 1). */
  rowNumber: number;
  /** Zellen der Zeile, in der Reihenfolge der Header. */
  cells: Record<string, string>;
};

export type CsvParseResult = {
  headers: string[];
  rows: CsvRow[];
};

export type CsvParseError = {
  rowNumber: number;
  message: string;
};

export class CsvFormatError extends Error {
  constructor(
    public readonly rowNumber: number,
    message: string,
  ) {
    super(message);
    this.name = 'CsvFormatError';
  }
}

/**
 * Parst eine CSV-Datei aus einem Buffer/String.
 *
 * Wirft `CsvFormatError`, wenn die Datei ueberhaupt nicht parsebar ist
 * (z. B. unbalancierte Quotes). Einzelzeilen mit zu wenigen Spalten werden
 * NICHT geworfen — der Aufrufer entscheidet, wie er damit umgeht.
 */
export function parseCsv(input: string): CsvParseResult {
  const text = stripBom(input).replace(/\r\n?/g, '\n');
  const records = splitRecords(text);
  if (records.length === 0) {
    return { headers: [], rows: [] };
  }
  const headers = records[0].cells.map((c) => c.trim());
  const dedup = new Set<string>();
  for (const h of headers) {
    if (dedup.has(h)) {
      throw new CsvFormatError(1, `Doppelter Spaltenname im Header: "${h}".`);
    }
    dedup.add(h);
  }
  const rows: CsvRow[] = [];
  for (let i = 1; i < records.length; i++) {
    const rec = records[i];
    if (rec.cells.length === 1 && rec.cells[0].trim() === '') {
      continue; // Leerzeile
    }
    const cells: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      cells[headers[j]] = (rec.cells[j] ?? '').trim();
    }
    rows.push({ rowNumber: rec.rowNumber, cells });
  }
  return { headers, rows };
}

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

type RawRecord = { rowNumber: number; cells: string[] };

function splitRecords(text: string): RawRecord[] {
  const records: RawRecord[] = [];
  let current: string[] = [];
  let cell = '';
  let inQuotes = false;
  let rowStart = 1;
  let line = 1;

  const pushCell = () => {
    current.push(cell);
    cell = '';
  };
  const pushRecord = () => {
    pushCell();
    records.push({ rowNumber: rowStart, cells: current });
    current = [];
    rowStart = line + 1;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
        if (ch === '\n') line++;
      }
      continue;
    }
    if (ch === '"') {
      if (cell.length === 0) {
        inQuotes = true;
      } else {
        // Quote mitten in unquoted Cell — als Literal akzeptieren.
        cell += ch;
      }
      continue;
    }
    if (ch === ',') {
      pushCell();
      continue;
    }
    if (ch === '\n') {
      pushRecord();
      line++;
      continue;
    }
    cell += ch;
  }
  if (inQuotes) {
    throw new CsvFormatError(rowStart, 'Unbalancierte Anfuehrungszeichen.');
  }
  // Letzten Record nur dann pushen, wenn es etwas zu pushen gibt
  // (kein Doppelpush bei abschliessendem newline).
  if (cell.length > 0 || current.length > 0) {
    pushRecord();
  }
  return records;
}
