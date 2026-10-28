/**
 * Xuất lịch tuần ra PDF cục bộ, không cần internet hay dịch vụ ngoài.
 * PDF cần font Unicode để giữ dấu tiếng Việt: lấy font hệ thống (Windows/macOS/Linux)
 * hoặc đặt PDF_FONT_PATH / PDF_FONT_BOLD_PATH. Không tìm thấy font thì báo lỗi rõ ràng
 * thay vì xuất tệp mất dấu.
 */
import fs from 'node:fs';
import PDFDocument from 'pdfkit';
import type { ConflictRecord, SettingsRecord } from '../types.ts';
import { buildWeekReport } from '../services/report_data.ts';
import { parentOrgLine, placeNameOf, rightHeadLines } from '../utils/organization.ts';
import { formatDdMmYyyy, WEEKDAY_LABELS, fromIso } from '../utils/dates.ts';

/**
 * Các họ font Unicode, mỗi họ gồm cả regular lẫn bold. Ưu tiên nhóm serif vì văn bản
 * hành chính in ra phải dùng Times New Roman; nhóm sans chỉ là phương án cuối khi máy
 * không có serif nào hỗ trợ tiếng Việt.
 */
const FONT_GROUPS: Array<{ name: string; regular: string[]; bold: string[] }> = [
  {
    name: 'Times New Roman',
    regular: ['C:/Windows/Fonts/times.ttf', '/System/Library/Fonts/Supplemental/Times New Roman.ttf'],
    bold: ['C:/Windows/Fonts/timesbd.ttf', '/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf'],
  },
  {
    name: 'Liberation Serif',
    regular: ['/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf'],
    bold: ['/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf'],
  },
  {
    name: 'DejaVu Serif',
    regular: ['/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf'],
    bold: ['/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf'],
  },
  {
    name: 'Arial',
    regular: ['C:/Windows/Fonts/arial.ttf', '/Library/Fonts/Arial Unicode.ttf'],
    bold: ['C:/Windows/Fonts/arialbd.ttf'],
  },
  {
    name: 'Segoe UI',
    regular: ['C:/Windows/Fonts/segoeui.ttf'],
    bold: ['C:/Windows/Fonts/segoeuib.ttf'],
  },
  {
    name: 'DejaVu Sans',
    regular: ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'],
    bold: ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'],
  },
];

function firstExisting(candidates: Array<string | undefined>): string | null {
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // thử đường dẫn kế tiếp
    }
  }
  return null;
}

export function resolvePdfFonts(): { regular: string; bold: string } {
  const envRegular = process.env.PDF_FONT_PATH;
  const envBold = process.env.PDF_FONT_BOLD_PATH;
  // PDF_FONT_PATH đi trước các họ dựng sẵn; bold lấy theo đúng họ của nó để không lệch font giữa thường và đậm.
  const siblingBold = FONT_GROUPS.find((group) => group.regular.includes(envRegular ?? ''))?.bold ?? [];
  const groups: Array<{ regular: Array<string | undefined>; bold: Array<string | undefined> }> = envRegular
    ? [{ regular: [envRegular], bold: [envBold, ...siblingBold] }, ...FONT_GROUPS]
    : FONT_GROUPS;
  for (const group of groups) {
    const regular = firstExisting(group.regular);
    if (!regular) continue;
    return { regular, bold: firstExisting([envBold, ...group.bold]) || regular };
  }
  throw new Error('Không tìm thấy font Unicode để xuất PDF có dấu tiếng Việt. Đặt biến môi trường PDF_FONT_PATH trỏ tới một tệp .ttf (ví dụ C:/Windows/Fonts/times.ttf).');
}

export interface PdfInput {
  events: Parameters<typeof buildWeekReport>[0];
  settings: SettingsRecord;
  weekStart: string;
  conflicts: ConflictRecord[];
}

const DASH = '…';
const COLS: Array<{ key: 'time' | 'title' | 'participants' | 'location' | 'chair' | 'preparation'; label: string; width: number }> = [
  { key: 'time', label: 'THỜI GIAN', width: 0.11 },
  { key: 'title', label: 'NỘI DUNG', width: 0.25 },
  { key: 'participants', label: 'THÀNH PHẦN', width: 0.19 },
  { key: 'location', label: 'ĐỊA ĐIỂM', width: 0.16 },
  { key: 'chair', label: 'CHỦ TRÌ', width: 0.14 },
  { key: 'preparation', label: 'CHUẨN BỊ', width: 0.15 },
];

function cellText(ev: Parameters<typeof buildWeekReport>[0][number], key: (typeof COLS)[number]['key']): string {
  switch (key) {
    case 'time':
      return `${ev.start_time}${ev.end_time ? ` – ${ev.end_time}` : ''}`;
    case 'title':
      return [ev.title || DASH, ev.content].filter(Boolean).join('. ');
    case 'participants':
      return ev.participants || ev.participant_group || DASH;
    case 'location':
      return ev.location || DASH;
    case 'chair':
      return ev.chair || DASH;
    case 'preparation':
      return ev.preparation || DASH;
    default:
      return '';
  }
}

export function buildWeekPdf({ events, settings, weekStart, conflicts }: PdfInput): Promise<Buffer> {
  const fonts = resolvePdfFonts();
  const report = buildWeekReport(events, settings, weekStart);
  const doc = new PDFDocument({ size: 'A4', margins: { top: 36, bottom: 42, left: 36, right: 36 }, bufferPages: true, info: { Title: `Lịch công tác tuần ${report.meta.week_number}`, Author: settings.unit_name || '' } });

  doc.registerFont('body', fonts.regular);
  doc.registerFont('bold', fonts.bold);

  const left = doc.page.margins.left;
  const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const bottomLimit = () => doc.page.height - doc.page.margins.bottom - 10;

  const placeName = placeNameOf(settings.unit_name) || '…………';
  const now = new Date();

  // ---- Đầu văn bản hai cột ----
  const colWidth = contentWidth / 2;
  const leftLines = [
    { text: parentOrgLine(settings).toUpperCase(), bold: true },
    { text: (settings.unit_name || '…………').toUpperCase(), bold: true },
    { text: '***', bold: false },
    { text: `Số: ${settings.document_number || '…'}`, bold: false },
  ];
  const rightLines = [
    ...rightHeadLines(settings).map((text) => ({ text, bold: true })),
    { text: '***', bold: false },
    { text: `${placeName}, ngày ${now.getDate()} tháng ${now.getMonth() + 1} năm ${now.getFullYear()}`, bold: false },
  ];
  const headTop = doc.y;
  const columnBottom = (lines: { text: string; bold: boolean }[], x: number): number => {
    let y = headTop;
    for (const line of lines) {
      doc.font(line.bold ? 'bold' : 'body').fontSize(10.5).fillColor('#000000');
      doc.text(line.text, x, y, { width: colWidth - 2, align: 'center' });
      y = doc.y;
    }
    return y;
  };
  doc.y = Math.max(columnBottom(leftLines, left), columnBottom(rightLines, left + colWidth + 2)) + 8;

  doc.font('bold').fontSize(14).text(`LỊCH CÔNG TÁC TUẦN ${report.meta.week_number}`, { align: 'center' });
  doc.font('body').fontSize(10.5).text(`(Từ ngày ${formatDdMmYyyy(report.meta.week_start)} đến ngày ${formatDdMmYyyy(report.meta.week_end)})`, { align: 'center' });
  doc.moveDown(0.6);

  // ---- Bảng ----
  const colWidths = COLS.map((c) => contentWidth * c.width);
  const pad = 4;

  const rowHeight = (cells: string[], fontSize: number): number => {
    const heights = cells.map((text, i) => doc.font('body').fontSize(fontSize).heightOfString(text || ' ', { width: colWidths[i] - pad * 2 }));
    return Math.max(...heights, 12) + pad * 2;
  };

  const drawRowFrames = (y: number, height: number, verticals = true) => {
    doc.save().lineWidth(0.5).strokeColor('#B6C2D2');
    doc.moveTo(left, y + height).lineTo(left + contentWidth, y + height).stroke();
    if (verticals) {
      let x = left;
      for (let i = 0; i < colWidths.length - 1; i += 1) {
        x += colWidths[i];
        doc.moveTo(x, y).lineTo(x, y + height).stroke();
      }
    }
    doc.restore();
  };

  const drawHeaderRow = () => {
    const height = rowHeight(COLS.map((c) => c.label), 8.5);
    const y = doc.y;
    doc.save().rect(left, y, contentWidth, height).fill('#F1F5F9').restore();
    doc.fillColor('#0F2A5F').font('bold').fontSize(8.5);
    let x = left;
    for (let i = 0; i < COLS.length; i += 1) {
      doc.text(COLS[i].label, x + pad, y + pad, { width: colWidths[i] - pad * 2, align: 'center' });
      x += colWidths[i];
    }
    drawRowFrames(y, height);
    doc.fillColor('#000000');
    doc.y = y + height;
  };

  drawHeaderRow();
  const ensureSpace = (height: number) => {
    if (doc.y + height <= bottomLimit()) return;
    doc.addPage();
    doc.y = doc.page.margins.top;
    drawHeaderRow();
  };

  for (const day of report.days) {
    const label = `${WEEKDAY_LABELS[fromIso(day.date).getDay()]} — ${formatDdMmYyyy(day.date)}`.toUpperCase();
    const height = rowHeight([label], 9.5);
    ensureSpace(height);
    const y = doc.y;
    doc.save().rect(left, y, contentWidth, height).fill('#E8EEFC').restore();
    doc.fillColor('#0F2A5F').font('bold').fontSize(9.5).text(label, left + pad, y + pad, { width: contentWidth - pad * 2 });
    drawRowFrames(y, height, false);
    doc.fillColor('#000000');
    doc.y = y + height;

    for (const ev of day.events) {
      const cells = COLS.map((c) => cellText(ev, c.key));
      const height = rowHeight(cells, 8.5);
      ensureSpace(height);
      const y = doc.y;
      doc.font('body').fontSize(8.5).fillColor('#000000');
      let x = left;
      for (let i = 0; i < COLS.length; i += 1) {
        doc.text(cells[i] || DASH, x + pad, y + pad, { width: colWidths[i] - pad * 2, align: i === 0 ? 'center' : 'left' });
        x += colWidths[i];
      }
      drawRowFrames(y, height);
      doc.y = y + height;
    }
  }

  if (!report.days.length) {
    const height = rowHeight(['Tuần này chưa có sự kiện nào.'], 9);
    doc.font('body').fontSize(9).text('Tuần này chưa có sự kiện nào.', left + pad, doc.y + pad, { width: contentWidth - pad * 2, align: 'center' });
    drawRowFrames(doc.y, height);
    doc.y += height;
  }

  const openConflicts = conflicts.filter((c) => c.status === 'OPEN');
  if (openConflicts.length) {
    doc.moveDown(0.6);
    doc.font('bold').fontSize(9.5).fillColor('#B45309')
      .text(`Lưu ý: còn ${openConflicts.length} mốc trùng lịch cần xử lý trước khi ban hành.`, left, doc.y, { width: contentWidth });
    doc.fillColor('#000000');
  }

  doc.moveDown(0.8);
  doc.font('body').fontSize(9).fillColor('#334155').text(
    `Tổng hợp: ${report.totals.events} mục lịch · ${Math.round(report.totals.minutes / 6) / 10} giờ · ${report.totals.pending_preparation} mục chưa ghi chuẩn bị.`,
    left,
    doc.y,
    { width: contentWidth },
  );
  doc.fillColor('#000000');
  doc.moveDown(0.8);
  if (doc.y > bottomLimit() - 120) doc.addPage();
  doc.font('bold').fontSize(10.5).text('Nơi nhận:', left, doc.y, { width: contentWidth });
  doc.font('body').fontSize(10).text('- Thường trực Đảng ủy, UBND (để b/c);', left, doc.y, { width: contentWidth });
  doc.font('body').fontSize(10).text('- Các ban, ngành, đoàn thể;', left, doc.y, { width: contentWidth });
  doc.font('body').fontSize(10).text('- Lưu: VP.', left, doc.y, { width: contentWidth });
  doc.moveDown(1.2);
  doc.font('bold').fontSize(10.5).text('CHẤP HÀNH ĐẢNG BỘ / CHỦ TỊCH UBND', left + contentWidth * 0.45, doc.y, { width: contentWidth * 0.55, align: 'center' });
  doc.font('body').fontSize(9).text('(Ký, đóng dấu)', left + contentWidth * 0.45, doc.y, { width: contentWidth * 0.55, align: 'center' });
  doc.moveDown(2.4);
  doc.font('bold').fontSize(10.5).text(settings.signer || '…………', left + contentWidth * 0.45, doc.y, { width: contentWidth * 0.55, align: 'center' });

  // ---- Số trang ----
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font('body').fontSize(8).fillColor('#94A3B8').text(
      `Trang ${i - range.start + 1}/${range.count}`,
      doc.page.margins.left,
      doc.page.height - 26,
      { width: contentWidth, align: 'center', lineBreak: false },
    );
    doc.page.margins.bottom = savedBottom;
  }

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}
