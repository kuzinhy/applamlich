/**
 * Xuất lịch tuần ra PDF cục bộ, không cần internet hay dịch vụ ngoài.
 * Hỗ trợ mẫu chuẩn Ban Xây dựng Đảng (5 cột, dải phân cách ngày màu vàng kim) và mẫu hành chính.
 */
import fs from 'node:fs';
import PDFDocument from 'pdfkit';
import type { ConflictRecord, EventRecord, SettingsRecord } from '../types.ts';
import { parentOrgLine, placeNameOf } from '../utils/organization.ts';
import { formatDdMmYyyy, WEEKDAY_FULL, fromIso, addDays } from '../utils/dates.ts';
import { cleanVietnameseOcrText } from '../utils/clock.ts';
import { formatBxddTime, compareDayEvents } from './official_document.ts';

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
  events: EventRecord[];
  settings: SettingsRecord;
  weekStart: string;
  conflicts: ConflictRecord[];
  template?: 'bxdd' | 'admin';
}

const DASH = '—';

const BXDD_COLS = [
  { key: 'time', label: 'THỜI GIAN', width: 0.12 },
  { key: 'content', label: 'NỘI DUNG', width: 0.40 },
  { key: 'executor', label: 'NGƯỜI THỰC HIỆN', width: 0.18 },
  { key: 'attendees', label: 'CÙNG DỰ', width: 0.15 },
  { key: 'location', label: 'ĐỊA ĐIỂM', width: 0.15 },
];

export function buildWeekPdf({ events, settings, weekStart, conflicts, template = 'bxdd' }: PdfInput): Promise<Buffer> {
  const fonts = resolvePdfFonts();
  const weekEnd = addDays(weekStart, 6);
  const advisorName = settings.advisor_unit || 'Ban Xây dựng Đảng';
  const unitName = settings.unit_name || 'Đảng ủy Phường Thủ Dầu Một';

  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 36, bottom: 42, left: 36, right: 36 },
    bufferPages: true,
    info: { Title: `Lịch làm việc - ${advisorName}`, Author: unitName },
  });

  doc.registerFont('body', fonts.regular);
  doc.registerFont('bold', fonts.bold);

  const left = doc.page.margins.left;
  const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const bottomLimit = () => doc.page.height - doc.page.margins.bottom - 10;

  const placeName = placeNameOf(settings.unit_name) || 'Thủ Dầu Một';
  const now = new Date();

  // ---- Đầu văn bản hai cột ----
  const colWidth = contentWidth / 2;
  const leftLines = [
    { text: parentOrgLine(settings).toUpperCase(), bold: true, size: 9.5 },
    { text: unitName.toUpperCase(), bold: true, size: 10.5 },
    { text: (settings.advisor_unit || 'BAN XÂY DỰNG ĐẢNG').toUpperCase(), bold: true, size: 10.5 },
    { text: '*', bold: true, size: 11 },
  ];
  const rightLines = [
    { text: 'ĐẢNG CỘNG SẢN VIỆT NAM', bold: true, size: 10.5 },
    { text: `${placeName}, ngày ${now.getDate()} tháng ${now.getMonth() + 1} năm ${now.getFullYear()}`, bold: false, size: 10 },
  ];

  const headTop = doc.y;
  const columnBottom = (lines: { text: string; bold: boolean; size: number }[], x: number): number => {
    let y = headTop;
    for (const line of lines) {
      doc.font(line.bold ? 'bold' : 'body').fontSize(line.size).fillColor('#000000');
      doc.text(line.text, x, y, { width: colWidth - 4, align: 'center' });
      y = doc.y + 1;
    }
    return y;
  };
  doc.y = Math.max(columnBottom(leftLines, left), columnBottom(rightLines, left + colWidth + 4)) + 6;

  // ---- Tiêu đề ----
  doc.font('bold').fontSize(14).text('LỊCH LÀM VIỆC', { align: 'center' });
  doc.font('bold').fontSize(12).text(`của Lãnh đạo ${advisorName}`, { align: 'center' });
  doc.font('body').fontSize(10).text(`(Từ ngày ${formatDdMmYyyy(weekStart)} đến ngày ${formatDdMmYyyy(weekEnd)})`, { align: 'center' });
  doc.moveDown(0.6);

  // ---- Bảng 5 cột BXDĐ ----
  const colWidths = BXDD_COLS.map((c) => contentWidth * c.width);
  const pad = 4;

  const rowHeight = (cells: string[], fontSize: number): number => {
    const heights = cells.map((text, i) =>
      doc.font('body').fontSize(fontSize).heightOfString(text || ' ', { width: colWidths[i] - pad * 2 })
    );
    return Math.max(...heights, 12) + pad * 2;
  };

  const drawRowFrames = (y: number, height: number, verticals = true) => {
    doc.save().lineWidth(0.5).strokeColor('#333333');
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
    const height = rowHeight(BXDD_COLS.map((c) => c.label), 8.5);
    const y = doc.y;
    doc.save().rect(left, y, contentWidth, height).fill('#F2F2F2').restore();
    doc.fillColor('#000000').font('bold').fontSize(8.5);
    let x = left;
    for (let i = 0; i < BXDD_COLS.length; i += 1) {
      doc.text(BXDD_COLS[i].label, x + pad, y + pad, { width: colWidths[i] - pad * 2, align: 'center' });
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

  const byDate = new Map<string, EventRecord[]>();
  for (const ev of events) {
    const list = byDate.get(ev.event_date) || [];
    list.push(ev);
    byDate.set(ev.event_date, list);
  }

  for (let i = 0; i < 7; i += 1) {
    const date = addDays(weekStart, i);
    const dayOfWeek = fromIso(date).getDay();
    const dayLabel = `${WEEKDAY_FULL[dayOfWeek]}, NGÀY ${formatDdMmYyyy(date)}`.toUpperCase();
    const dayEvents = (byDate.get(date) || [])
      .slice()
      .sort(compareDayEvents);

    // Dải phân cách ngày màu vàng kim chuẩn BXDĐ (#FEF08A)
    const height = rowHeight([dayLabel], 9);
    ensureSpace(height);
    const y = doc.y;
    doc.save().rect(left, y, contentWidth, height).fill('#FEF08A').restore();
    doc.fillColor('#000000').font('bold').fontSize(9).text(dayLabel, left + pad, y + pad, { width: contentWidth - pad * 2 });
    drawRowFrames(y, height, false);
    doc.y = y + height;

    if (dayEvents.length === 0) {
      const emptyText = 'Lãnh đạo ban làm việc theo chương trình riêng';
      const emptyHeight = 20;
      ensureSpace(emptyHeight);
      const ey = doc.y;
      doc.font('body').fontSize(8.5).fillColor('#333333').text(emptyText, left + pad, ey + pad, { width: contentWidth - pad * 2, align: 'center' });
      drawRowFrames(ey, emptyHeight, false);
      doc.y = ey + emptyHeight;
    } else {
      for (const ev of dayEvents) {
        const timeText = formatBxddTime(ev.start_time, ev.end_time);
        const contentLines = [cleanVietnameseOcrText(ev.title)];
        if (ev.content && ev.content !== ev.title) contentLines.push(cleanVietnameseOcrText(ev.content));
        if (ev.preparation) contentLines.push(`(${cleanVietnameseOcrText(ev.preparation)})`);
        const fullContent = contentLines.filter(Boolean).join('\n');

        const cells = [
          timeText,
          fullContent,
          cleanVietnameseOcrText(ev.chair || DASH),
          cleanVietnameseOcrText(ev.participants || ev.participant_group || DASH),
          cleanVietnameseOcrText(ev.location || DASH),
        ];

        const rowH = rowHeight(cells, 8.5);
        ensureSpace(rowH);
        const ry = doc.y;
        doc.font('body').fontSize(8.5).fillColor('#000000');
        let x = left;
        for (let j = 0; j < BXDD_COLS.length; j += 1) {
          const isTime = j === 0;
          if (isTime) doc.font('bold');
          doc.text(cells[j] || DASH, x + pad, ry + pad, {
            width: colWidths[j] - pad * 2,
            align: isTime ? 'center' : 'left',
          });
          if (isTime) doc.font('body');
          x += colWidths[j];
        }
        drawRowFrames(ry, rowH);
        doc.y = ry + rowH;
      }
    }
  }

  // ---- Lưu ý thay cho Thư mời họp ----
  doc.moveDown(0.8);
  if (doc.y > bottomLimit() - 50) doc.addPage();
  doc.font('bold').fontSize(9).text('* Lưu ý: ', left, doc.y, { continued: true });
  doc.font('body').fontSize(9).text(
    'Lịch làm việc này thay cho Thư mời họp, tùy vào tình hình thực tế, khi cần thiết Lãnh đạo ban sẽ quyết định triệu tập các cuộc họp đột xuất (nếu có) để chỉ đạo giải quyết các vấn đề phát sinh.',
    { width: contentWidth, align: 'justify' }
  );

  // ---- Số trang ----
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font('body').fontSize(8).fillColor('#64748B').text(
      `Trang ${i - range.start + 1}/${range.count}`,
      doc.page.margins.left,
      doc.page.height - 24,
      { width: contentWidth, align: 'center', lineBreak: false }
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
