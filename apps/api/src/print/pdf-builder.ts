import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 40;
const BOTTOM_MARGIN = 50;

const TITLE_SIZE = 18;
const HEADING_SIZE = 13;
const BODY_SIZE = 10;
const META_SIZE = 9;

const META_COLOR = rgb(0.4, 0.45, 0.55);
const HEADING_COLOR = rgb(0.12, 0.18, 0.27);
const TABLE_BORDER = rgb(0.85, 0.88, 0.92);

/**
 * Light wrapper around pdf-lib for the print bundle. Owns a single
 * PDFDocument and the current page+cursor; auto-paginates as content is
 * appended. Sufficient for plain ASCII/Latin-1 layouts (Helvetica), no
 * unicode font embedding here — keep input clean (umlauts work via Helvetica
 * because pdf-lib's WinAnsi encoder accepts them, but emoji etc. would
 * throw).
 */
export class PdfBuilder {
  readonly pdf!: PDFDocument;
  private font!: PDFFont;
  private bold!: PDFFont;
  private page!: PDFPage;
  private y = 0;

  static async create(): Promise<PdfBuilder> {
    const builder = new PdfBuilder();
    await builder.init();
    return builder;
  }

  private async init(): Promise<void> {
    (this as { pdf: PDFDocument }).pdf = await PDFDocument.create();
    this.font = await this.pdf.embedFont(StandardFonts.Helvetica);
    this.bold = await this.pdf.embedFont(StandardFonts.HelveticaBold);
    this.newPage();
  }

  private newPage(): void {
    this.page = this.pdf.addPage([A4_WIDTH, A4_HEIGHT]);
    this.y = A4_HEIGHT - MARGIN;
  }

  private ensureSpace(needed: number): void {
    if (this.y - needed < BOTTOM_MARGIN) {
      this.newPage();
    }
  }

  // ── Whitespace ─────────────────────────────────────────────
  spacer(amount = 8): void {
    this.y -= amount;
    if (this.y < BOTTOM_MARGIN) this.newPage();
  }

  hLine(): void {
    this.ensureSpace(8);
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: A4_WIDTH - MARGIN, y: this.y },
      thickness: 0.5,
      color: TABLE_BORDER,
    });
    this.y -= 8;
  }

  // ── Text primitives ────────────────────────────────────────
  title(text: string): void {
    this.ensureSpace(TITLE_SIZE + 8);
    this.page.drawText(sanitize(text), {
      x: MARGIN,
      y: this.y - TITLE_SIZE,
      size: TITLE_SIZE,
      font: this.bold,
      color: HEADING_COLOR,
    });
    this.y -= TITLE_SIZE + 6;
  }

  meta(text: string): void {
    this.ensureSpace(META_SIZE + 4);
    this.page.drawText(sanitize(text), {
      x: MARGIN,
      y: this.y - META_SIZE,
      size: META_SIZE,
      font: this.font,
      color: META_COLOR,
    });
    this.y -= META_SIZE + 6;
  }

  heading(text: string): void {
    this.spacer(6);
    this.ensureSpace(HEADING_SIZE + 8);
    this.page.drawText(sanitize(text), {
      x: MARGIN,
      y: this.y - HEADING_SIZE,
      size: HEADING_SIZE,
      font: this.bold,
      color: HEADING_COLOR,
    });
    this.y -= HEADING_SIZE + 4;
    this.hLine();
  }

  paragraph(text: string): void {
    if (!text) return;
    const maxWidth = A4_WIDTH - MARGIN * 2;
    const lines = wrapText(text, BODY_SIZE, this.font, maxWidth);
    for (const line of lines) {
      this.ensureSpace(BODY_SIZE + 3);
      this.page.drawText(sanitize(line), {
        x: MARGIN,
        y: this.y - BODY_SIZE,
        size: BODY_SIZE,
        font: this.font,
      });
      this.y -= BODY_SIZE + 3;
    }
  }

  // ── Key-value grid ─────────────────────────────────────────
  grid(rows: Array<[string, string | null | undefined]>): void {
    const labelX = MARGIN;
    const valueX = MARGIN + 140;
    const valueWidth = A4_WIDTH - valueX - MARGIN;
    for (const [label, raw] of rows) {
      const valueLines = wrapText(raw ?? '-', BODY_SIZE, this.font, valueWidth);
      const blockHeight = Math.max(
        BODY_SIZE + 4,
        valueLines.length * (BODY_SIZE + 2),
      );
      this.ensureSpace(blockHeight);
      this.page.drawText(sanitize(label), {
        x: labelX,
        y: this.y - BODY_SIZE,
        size: BODY_SIZE,
        font: this.bold,
        color: META_COLOR,
      });
      let lineY = this.y - BODY_SIZE;
      for (const line of valueLines) {
        this.page.drawText(sanitize(line), {
          x: valueX,
          y: lineY,
          size: BODY_SIZE,
          font: this.font,
        });
        lineY -= BODY_SIZE + 2;
      }
      this.y -= blockHeight;
    }
  }

  // ── Table (uniform columns, auto-page-break per row) ───────
  table(headers: string[], rows: string[][], columnWidths?: number[]): void {
    if (rows.length === 0 && headers.length === 0) return;
    const totalWidth = A4_WIDTH - MARGIN * 2;
    const widths =
      columnWidths && columnWidths.length === headers.length
        ? columnWidths
        : Array(headers.length).fill(totalWidth / headers.length);

    const rowHeight = BODY_SIZE + 6;
    const drawHeader = () => {
      this.ensureSpace(rowHeight);
      let x = MARGIN;
      for (let i = 0; i < headers.length; i++) {
        this.page.drawText(sanitize(headers[i]), {
          x: x + 2,
          y: this.y - BODY_SIZE,
          size: BODY_SIZE,
          font: this.bold,
          color: META_COLOR,
        });
        x += widths[i];
      }
      this.y -= rowHeight;
      this.page.drawLine({
        start: { x: MARGIN, y: this.y + 2 },
        end: { x: A4_WIDTH - MARGIN, y: this.y + 2 },
        thickness: 0.5,
        color: TABLE_BORDER,
      });
      this.y -= 2;
    };

    drawHeader();
    for (const row of rows) {
      this.ensureSpace(rowHeight);
      // After a page break, redraw the header on the new page.
      if (this.y === A4_HEIGHT - MARGIN) {
        drawHeader();
      }
      let x = MARGIN;
      for (let i = 0; i < row.length && i < widths.length; i++) {
        const truncated = truncateToWidth(
          row[i] ?? '',
          this.font,
          BODY_SIZE,
          widths[i] - 4,
        );
        this.page.drawText(sanitize(truncated), {
          x: x + 2,
          y: this.y - BODY_SIZE,
          size: BODY_SIZE,
          font: this.font,
        });
        x += widths[i];
      }
      this.y -= rowHeight;
    }
    this.spacer(4);
  }

  /** Add a freshly created page used by document-merge to host an image. */
  addImagePage(width: number, height: number): PDFPage {
    return this.pdf.addPage([width, height]);
  }

  async save(): Promise<Uint8Array> {
    return this.pdf.save();
  }
}

// ── Helpers ──────────────────────────────────────────────────

/**
 * Helvetica's WinAnsi encoder rejects characters outside Latin-1. Strip them
 * to avoid pdf-lib throwing mid-render — happens for emoji or some special
 * unicode in user-entered notes/descriptions.
 */
function sanitize(text: string): string {
  // Replace any character that isn't representable in WinAnsi with '?'.
  return text.replace(/[Ā-￿]/g, '?');
}

function wrapText(
  text: string,
  size: number,
  font: PDFFont,
  maxWidth: number,
): string[] {
  if (!text) return [''];
  const paragraphs = text.split(/\r?\n/);
  const result: string[] = [];
  for (const para of paragraphs) {
    const words = para.split(/\s+/);
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      const w = font.widthOfTextAtSize(sanitize(candidate), size);
      if (w <= maxWidth) {
        current = candidate;
      } else {
        if (current) result.push(current);
        current = word;
      }
    }
    if (current) result.push(current);
    if (paragraphs.length > 1) result.push('');
  }
  // Drop trailing empty caused by paragraph joiner.
  while (result.length > 0 && result[result.length - 1] === '') result.pop();
  return result.length > 0 ? result : [''];
}

function truncateToWidth(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string {
  const sanitized = sanitize(text);
  if (font.widthOfTextAtSize(sanitized, size) <= maxWidth) return sanitized;
  let lo = 0;
  let hi = sanitized.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const candidate = sanitized.slice(0, mid) + '...';
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return sanitized.slice(0, Math.max(0, lo - 1)) + '...';
}
