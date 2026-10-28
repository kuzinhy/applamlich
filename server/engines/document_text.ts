import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

/** Đọc văn bản từ .docx mà không cần thư viện: docx là một file ZIP,
    chỉ cần lấy entry word/document.xml rồi giải nén raw deflate. */
function readZipEntry(buffer: Buffer, wanted: string): Buffer | null {
  // Duyệt Local File Header (PK\x03\x04) cho tới hết mảng ký tự "PK" hợp lệ.
  let offset = 0;
  while (offset + 30 <= buffer.length) {
    if (buffer.readUInt32LE(offset) !== 0x04034b50) break;
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.slice(offset + 30, offset + 30 + nameLength).toString('utf8');
    const dataStart = offset + 30 + nameLength + extraLength;
    if (dataStart + compressedSize > buffer.length) break;
    if (name === wanted) return buffer.slice(dataStart, dataStart + compressedSize);
    offset = dataStart + compressedSize;
  }
  return null;
}

function xmlToPlainText(xml: string): string {
  return xml
    .replace(/<w:tab[^>]*\/>/g, '\t')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface TextReadResult {
  text: string;
  chars: number;
  error?: string;
  /** Số trang PDF / số sheet Excel / có phải OCR hay không. */
  meta?: { pages?: number; sheets?: string[]; ocr?: boolean; kind?: string };
}

export const PDF_EXTENSIONS = ['.pdf'];
export const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tif', '.tiff'];
export const SPREADSHEET_EXTENSIONS = ['.xlsx'];
export const SUPPORTED_UPLOAD_EXTENSIONS = [
  '.docx', '.txt', '.md', '.csv', '.html', '.htm', '.json',
  ...PDF_EXTENSIONS, ...IMAGE_EXTENSIONS, ...SPREADSHEET_EXTENSIONS,
];

/** Vân tay nội dung để chặn nạp trùng cùng một văn bản dưới hai tên tệp. */
export function contentFingerprint(text: string): string {
  const normalized = String(text || '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/** Định dạng đọc đồng bộ (không cần thư viện ngoài, không cần mạng). */
export function extractText(fileName: string, buffer: Buffer): TextReadResult {
  const ext = path.extname(fileName).toLowerCase();
  try {
    if (ext === '.docx') {
      const entry = readZipEntry(buffer, 'word/document.xml');
      if (!entry) return { text: '', chars: 0, error: 'File .docx không có phần word/document.xml (có thể là file rỗng hoặc định dạng .doc cũ).' };
      let xml: string;
      try {
        xml = zlib.inflateRawSync(entry).toString('utf8');
      } catch {
        xml = entry.toString('utf8');
      }
      const text = xmlToPlainText(xml);
      return { text, chars: text.length, ...(text ? {} : { error: 'File .docx không chứa ký tự nào.' }) };
    }
    if (['.txt', '.md', '.csv', '.json', '.html', '.htm', ''].includes(ext)) {
      const raw = buffer.toString('utf8');
      const text = ['.html', '.htm'].includes(ext) ? xmlToPlainText(raw) : raw.trim();
      return { text, chars: text.length, ...(text ? {} : { error: 'Tệp trống.' }) };
    }
    if (ext === '.pdf') {
      return { text: '', chars: 0, error: 'PDF cần đọc qua bộ đọc nâng cao (extractTextAsync).' };
    }
    if (IMAGE_EXTENSIONS.includes(ext)) {
      return { text: '', chars: 0, error: `Ảnh ${ext} cần OCR — dùng bộ đọc nâng cao (extractTextAsync).` };
    }
    if (ext === '.xlsx') {
      return { text: '', chars: 0, error: 'Excel cần đọc qua bộ đọc nâng cao (extractTextAsync).' };
    }
    if (ext === '.doc' || ext === '.xls') {
      return { text: '', chars: 0, error: `Định dạng ${ext} (Office cũ) chưa hỗ trợ — hãy lưu lại thành ${ext === '.doc' ? '.docx' : '.xlsx'} hoặc PDF.` };
    }
    return { text: '', chars: 0, error: `Định dạng ${ext || '(không rõ)'} chưa được hỗ trợ.` };
  } catch (err) {
    return { text: '', chars: 0, error: err instanceof Error ? err.message : 'Không đọc được file.' };
  }
}

/** Trích text một PDF; nếu trang là ảnh scan (ít chữ) thì render trang rồi OCR tiếng Việt. */
async function extractPdf(buffer: Buffer): Promise<TextReadResult> {
  const MAX_OCR_PAGES = Math.max(0, Number(process.env.PDF_OCR_MAX_PAGES || 10));
  let pdf: any;
  try {
    const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
    pdf = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      disableFontFace: true,
      isEvalSupported: false,
    }).promise;
  } catch (err) {
    return { text: '', chars: 0, error: `Không mở được PDF: ${err instanceof Error ? err.message : String(err)}` };
  }

  const pageTexts: string[] = [];
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    const text = content.items
      .map((item: any) => {
        const value = typeof item.str === 'string' ? item.str : '';
        return item.hasEOL ? `${value}\n` : value;
      })
      .join(' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    pageTexts.push(text);
  }

  const scannedPages = pageTexts
    .map((text, index) => ({ text, pageNo: index + 1 }))
    .filter((item) => item.text.replace(/\s/g, '').length < 25)
    .slice(0, MAX_OCR_PAGES);

  let ocrUsed = false;
  if (scannedPages.length && process.env.PDF_OCR_DISABLED !== '1') {
    try {
      const { renderPdfPageToPng } = await import('./pdf_render.ts');
      for (const item of scannedPages) {
        const png = await renderPdfPageToPng(pdf, item.pageNo, 2);
        const ocr = await ocrImage(png);
        if (ocr.text.trim()) {
          pageTexts[item.pageNo - 1] = ocr.text.trim();
          ocrUsed = true;
        }
      }
    } catch {
      /* Thiếu canvas/hạ tầng OCR: giữ phần chữ đọc được, không làm hỏng cả tệp. */
    }
  }

  const text = pageTexts.filter(Boolean).join('\n\n').trim();
  const meta = { pages: pdf.numPages, ocr: ocrUsed, kind: 'pdf' };
  if (!text) {
    return {
      text: '',
      chars: 0,
      error: 'PDF không có lớp chữ và OCR không đọc được. Hãy dán nội dung hoặc nạp tệp .docx/ảnh rõ nét.',
      meta,
    };
  }
  return { text, chars: text.length, meta };
}

let ocrWorkerPromise: Promise<any> | null = null;

async function getOcrWorker(): Promise<any> {
  if (!ocrWorkerPromise) {
    const { createWorker } = await import('tesseract.js');
    const cachePath = process.env.TESSDATA_DIR || path.resolve(process.cwd(), 'data', 'ocr-cache');
    fs.mkdirSync(cachePath, { recursive: true });
    ocrWorkerPromise = createWorker('vie+eng', 1, { cachePath, gzip: true }).catch((err: unknown) => {
      ocrWorkerPromise = null;
      throw err;
    });
  }
  return ocrWorkerPromise;
}

/** OCR một ảnh (Buffer PNG/JPG...). Tesseract tải dữ liệu tiếng Việt một lần rồi lưu vào data/ocr-cache. */
export async function ocrImage(buffer: Buffer): Promise<TextReadResult> {
  try {
    const worker = await getOcrWorker();
    const { data } = await worker.recognize(buffer);
    const text = String(data?.text || '').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').trim();
    return {
      text,
      chars: text.length,
      meta: { ocr: true, kind: 'image' },
      ...(text ? {} : { error: 'OCR không nhận ra chữ trong ảnh. Hãy chụp thẳng, đủ sáng, độ phân giải cao hơn.' }),
    };
  } catch (err) {
    return {
      text: '',
      chars: 0,
      error: `Chưa chạy được OCR (${err instanceof Error ? err.message : String(err)}). Lần đầu cần mạng để tải dữ liệu tiếng Việt; sau đó chạy offline.`,
    };
  }
}

async function extractSpreadsheet(buffer: Buffer): Promise<TextReadResult> {
  try {
    const ExcelJSModule: any = await import('exceljs');
    const ExcelJS = ExcelJSModule.default || ExcelJSModule;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const blocks: string[] = [];
    const sheets: string[] = [];
    workbook.eachSheet((sheet: any) => {
      sheets.push(sheet.name);
      const lines: string[] = [];
      sheet.eachRow({ includeEmpty: false }, (row: any) => {
        const values = Array.isArray(row.values) ? row.values.slice(1) : [];
        const cells = values.map((value: any) => {
          if (value === null || value === undefined) return '';
          if (typeof value === 'object') {
            if (value.text) return String(value.text);
            if (value.result !== undefined) return String(value.result);
            if (value.richText) return value.richText.map((part: any) => part.text).join('');
            return '';
          }
          return String(value);
        });
        const line = cells.join(' | ').replace(/\s+/g, ' ').trim();
        if (line) lines.push(line);
      });
      if (lines.length) blocks.push(`[${sheet.name}]\n${lines.join('\n')}`);
    });
    const text = blocks.join('\n\n').trim();
    return {
      text,
      chars: text.length,
      meta: { sheets, kind: 'xlsx' },
      ...(text ? {} : { error: 'Bảng tính không có ô dữ liệu nào.' }),
    };
  } catch (err) {
    return { text: '', chars: 0, error: `Không đọc được .xlsx: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Bộ đọc đầy đủ: .docx/.txt/.html/.csv/.json (đồng bộ) + PDF (kèm OCR trang scan),
 * ảnh (OCR tiếng Việt) và .xlsx. Tự tải thư viện khi cần nên khởi động server vẫn nhanh.
 */
export async function extractTextAsync(fileName: string, buffer: Buffer): Promise<TextReadResult> {
  const ext = path.extname(fileName).toLowerCase();
  if (PDF_EXTENSIONS.includes(ext)) return extractPdf(buffer);
  if (IMAGE_EXTENSIONS.includes(ext)) return ocrImage(buffer);
  if (SPREADSHEET_EXTENSIONS.includes(ext)) return extractSpreadsheet(buffer);
  return extractText(fileName, buffer);
}
