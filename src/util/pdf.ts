// A minimal PDF writer: pages of text in the standard serif and sans fonts, with JPEG pictures.
// It writes a real PDF file (no print dialog), which is all the planet's history book needs.

type Font = 'serif' | 'italic' | 'bold' | 'sans';
const FONT_NAME: Record<Font, string> = { serif: 'Times-Roman', italic: 'Times-Italic', bold: 'Times-Bold', sans: 'Helvetica' };
const FONT_KEY: Record<Font, string> = { serif: 'F1', italic: 'F2', bold: 'F3', sans: 'F4' };

/** Rough advance widths (in thousandths of the font size) so text can be wrapped and centred without font files. */
function charWidth(ch: string, font: Font): number {
  const wide = font === 'sans' ? 1.08 : font === 'bold' ? 1.05 : 1;
  if (ch === ' ') return 250 * wide;
  if ('il.,;:\'!|'.includes(ch)) return 280 * wide;
  if ('fjtrI-()'.includes(ch)) return 333 * wide;
  if ('mwMW'.includes(ch)) return 800 * wide;
  if (ch >= 'A' && ch <= 'Z') return 680 * wide;
  if (ch >= '0' && ch <= '9') return 500 * wide;
  return 470 * wide;
}

export function textWidth(s: string, size: number, font: Font = 'serif'): number {
  let w = 0;
  for (const ch of s) w += charWidth(ch, font);
  return (w / 1000) * size;
}

/** Break text into lines no wider than maxWidth. */
export function wrapText(s: string, size: number, maxWidth: number, font: Font = 'serif'): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of s.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (textWidth(next, size, font) > maxWidth && line) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Text as a PDF string in Windows Latin encoding: anything outside it becomes a plain stand-in. */
function pdfString(s: string): string {
  let out = '';
  for (const ch of s) {
    let c = ch.charCodeAt(0);
    if (ch === '’' || ch === '‘') c = 39;
    else if (ch === '“' || ch === '”') c = 34;
    else if (ch === '—' || ch === '–') c = 45;
    else if (ch === '°') c = 176;
    if (c > 255) c = 63;
    if (c === 40 || c === 41 || c === 92) out += `\\${String.fromCharCode(c)}`;
    else if (c < 32 || c > 126) out += `\\${c.toString(8).padStart(3, '0')}`;
    else out += String.fromCharCode(c);
  }
  return out;
}

interface Image { data: Uint8Array; width: number; height: number; }
interface Page { ops: string[]; images: number[]; }

export class PdfDoc {
  /** Page size in points: A4 portrait. */
  readonly width = 595;
  readonly height = 842;
  private pages: Page[] = [];
  private images: Image[] = [];
  private page!: Page;

  constructor() {
    this.addPage();
  }

  addPage(): void {
    this.page = { ops: [], images: [] };
    this.pages.push(this.page);
  }

  get pageCount(): number { return this.pages.length; }

  /** Fill the whole page with a colour (0..1 each). */
  background(r: number, g: number, b: number): void {
    this.page.ops.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg 0 0 ${this.width} ${this.height} re f`);
  }

  /** A filled rectangle; y is measured from the top of the page. */
  rect(x: number, y: number, w: number, h: number, r: number, g: number, b: number): void {
    this.page.ops.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg ${x.toFixed(2)} ${(this.height - y - h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
  }

  /** One line of text with its baseline at y from the top. */
  text(s: string, x: number, y: number, size: number, font: Font = 'serif', colour: [number, number, number] = [0.1, 0.1, 0.1], align: 'left' | 'centre' = 'left'): void {
    const tx = align === 'centre' ? x - textWidth(s, size, font) / 2 : x;
    this.page.ops.push(`BT ${colour[0].toFixed(3)} ${colour[1].toFixed(3)} ${colour[2].toFixed(3)} rg /${FONT_KEY[font]} ${size} Tf ${tx.toFixed(2)} ${(this.height - y).toFixed(2)} Td (${pdfString(s)}) Tj ET`);
  }

  /** Wrapped text; returns the y just below the last line. */
  paragraph(s: string, x: number, y: number, size: number, maxWidth: number, font: Font = 'serif', colour: [number, number, number] = [0.1, 0.1, 0.1], leading = 1.35): number {
    for (const line of wrapText(s, size, maxWidth, font)) { this.text(line, x, y, size, font, colour); y += size * leading; }
    return y;
  }

  /** Place a JPEG (raw file bytes) with its top-left corner at x, y. */
  jpeg(data: Uint8Array, pixelWidth: number, pixelHeight: number, x: number, y: number, w: number, h: number): void {
    this.images.push({ data, width: pixelWidth, height: pixelHeight });
    const id = this.images.length - 1;
    this.page.images.push(id);
    this.page.ops.push(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${(this.height - y - h).toFixed(2)} cm /Im${id} Do Q`);
  }

  save(): Blob {
    const chunks: Uint8Array[] = [];
    const offsets: number[] = [];
    let length = 0;
    const enc = new TextEncoder();
    const put = (s: string | Uint8Array) => { const b = typeof s === 'string' ? enc.encode(s) : s; chunks.push(b); length += b.length; };
    const latin = (s: string) => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; return b; };
    put('%PDF-1.4\n%âãÏÓ\n');
    // object numbers: 1 catalog, 2 pages, 3..6 fonts, then images, then a page and its content for every page
    const fontBase = 3, imageBase = 7, pageBase = imageBase + this.images.length;
    const obj = (n: number, body: string | (() => void)) => {
      offsets[n] = length;
      put(`${n} 0 obj\n`);
      if (typeof body === 'string') put(body); else body();
      put('\nendobj\n');
    };
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, `<< /Type /Pages /Kids [${this.pages.map((_, i) => `${pageBase + i * 2} 0 R`).join(' ')}] /Count ${this.pages.length} >>`);
    (Object.keys(FONT_NAME) as Font[]).forEach((f, i) => obj(fontBase + i, `<< /Type /Font /Subtype /Type1 /BaseFont /${FONT_NAME[f]} /Encoding /WinAnsiEncoding >>`));
    this.images.forEach((im, i) => obj(imageBase + i, () => {
      put(`<< /Type /XObject /Subtype /Image /Width ${im.width} /Height ${im.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.data.length} >>\nstream\n`);
      put(im.data);
      put('\nendstream');
    }));
    this.pages.forEach((pg, i) => {
      const content = latin(pg.ops.join('\n'));
      const fonts = (Object.keys(FONT_NAME) as Font[]).map((f, k) => `/${FONT_KEY[f]} ${fontBase + k} 0 R`).join(' ');
      const xo = pg.images.length ? ` /XObject << ${pg.images.map((id) => `/Im${id} ${imageBase + id} 0 R`).join(' ')} >>` : '';
      obj(pageBase + i * 2, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.width} ${this.height}] /Resources << /Font << ${fonts} >>${xo} >> /Contents ${pageBase + i * 2 + 1} 0 R >>`);
      obj(pageBase + i * 2 + 1, () => { put(`<< /Length ${content.length} >>\nstream\n`); put(content); put('\nendstream'); });
    });
    const count = pageBase + this.pages.length * 2;
    const xref = length;
    put(`xref\n0 ${count}\n0000000000 65535 f \n`);
    for (let n = 1; n < count; n++) put(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`);
    put(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(chunks as BlobPart[], { type: 'application/pdf' });
  }
}
