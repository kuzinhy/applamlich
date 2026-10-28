/**
 * Xuất lịch tuần ra .docx để cán bộ văn phòng mở bằng Word, sửa thể thức rồi phát hành.
 * Dùng font Times New Roman 13pt giống mẫu văn bản hành chính.
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';
import type { ConflictRecord } from '../types.ts';
import { formatDdMmYyyy, WEEKDAY_LABELS, fromIso } from '../utils/dates.ts';
import { buildWeekReport } from '../services/report_data.ts';
import { parentOrgLine, placeNameOf, rightHeadLines } from '../utils/organization.ts';
import type { SettingsRecord } from '../types.ts';

const FONT = 'Times New Roman';
const SIZE = 26; // nửa point: 13pt
const SMALL = 22;
const DASH = 'Chưa có trong văn bản';
const EMPTY_CELL = (text: string, opts: { bold?: boolean; align?: typeof AlignmentType[keyof typeof AlignmentType]; span?: number; fill?: string; width?: number; small?: boolean } = {}) =>
  new TableCell({
    children: [new Paragraph({
      alignment: opts.align,
      children: [new TextRun({ text, bold: opts.bold, font: FONT, size: opts.small ? SMALL : SIZE })],
    })],
    columnSpan: opts.span,
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.fill ? { fill: opts.fill } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
  });

const BORDER = { style: BorderStyle.SINGLE, size: 4, color: '555555' };
const TABLE_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER, insideHorizontal: BORDER, insideVertical: BORDER };

function masthead(settings: SettingsRecord): Table {
  const left = new TableCell({
    width: { size: 45, type: WidthType.PERCENTAGE },
    borders: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER },
    children: [
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: parentOrgLine(settings).toUpperCase(), bold: true, font: FONT, size: SIZE })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: (settings.unit_name || '…………').toUpperCase(), bold: true, font: FONT, size: SIZE })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '***', font: FONT, size: SIZE })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `Số: ${settings.document_number || '…'}`, italics: true, font: FONT, size: SIZE })] }),
    ],
  });
  const now = new Date();
  const right = new TableCell({
    width: { size: 55, type: WidthType.PERCENTAGE },
    borders: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER },
    children: [
      ...rightHeadLines(settings).map((text) => new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, bold: true, font: FONT, size: SIZE })] })),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '***', font: FONT, size: SIZE })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${placeNameOf(settings.unit_name) || '…………'}, ngày ${now.getDate()} tháng ${now.getMonth() + 1} năm ${now.getFullYear()}`, italics: true, font: FONT, size: SIZE })] }),
    ],
  });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER, insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } },
    rows: [new TableRow({ children: [left, right] })],
  });
}

function scheduleTable(report: ReturnType<typeof buildWeekReport>): Table {
  const header = new TableRow({
    tableHeader: true,
    children: [
      EMPTY_CELL('Thời gian', { bold: true, align: AlignmentType.CENTER, width: 11, fill: 'F2F2F2' }),
      EMPTY_CELL('Nội dung', { bold: true, align: AlignmentType.CENTER, width: 25, fill: 'F2F2F2' }),
      EMPTY_CELL('Thành phần', { bold: true, align: AlignmentType.CENTER, width: 19, fill: 'F2F2F2' }),
      EMPTY_CELL('Địa điểm', { bold: true, align: AlignmentType.CENTER, width: 16, fill: 'F2F2F2' }),
      EMPTY_CELL('Chủ trì', { bold: true, align: AlignmentType.CENTER, width: 14, fill: 'F2F2F2' }),
      EMPTY_CELL('Chuẩn bị', { bold: true, align: AlignmentType.CENTER, width: 15, fill: 'F2F2F2' }),
    ],
  });

  const rows: TableRow[] = [];
  for (const day of report.days) {
    rows.push(new TableRow({
      children: [EMPTY_CELL(`${WEEKDAY_LABELS[fromIso(day.date).getDay()]} — ${formatDdMmYyyy(day.date)}`.toUpperCase(), { bold: true, align: AlignmentType.CENTER, span: 6, fill: 'E8EEFC' })],
    }));
    for (const ev of day.events) {
      rows.push(new TableRow({
        children: [
          EMPTY_CELL(`${ev.start_time}${ev.end_time ? ` – ${ev.end_time}` : ''}`, { align: AlignmentType.CENTER, width: 11 }),
          EMPTY_CELL([ev.title || DASH, ev.content].filter(Boolean).join('. '), { width: 25 }),
          EMPTY_CELL(ev.participants || ev.participant_group || DASH, { width: 19 }),
          EMPTY_CELL(ev.location || DASH, { width: 16 }),
          EMPTY_CELL(ev.chair || DASH, { width: 14 }),
          EMPTY_CELL(ev.preparation || DASH, { width: 15, small: true }),
        ],
      }));
    }
  }
  if (!rows.length) {
    rows.push(new TableRow({ children: [EMPTY_CELL('Tuần này chưa có sự kiện nào.', { align: AlignmentType.CENTER, span: 6 })] }));
  }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: TABLE_BORDERS,
    rows: [header, ...rows],
  });
}

export interface DocxInput {
  events: Parameters<typeof buildWeekReport>[0];
  settings: SettingsRecord;
  weekStart: string;
  conflicts: ConflictRecord[];
}

export async function buildWeekDocx({ events, settings, weekStart, conflicts }: DocxInput): Promise<Buffer> {
  const report = buildWeekReport(events, settings, weekStart);
  const { meta, totals } = report;
  const openConflicts = conflicts.filter((c) => c.status === 'OPEN' && c.event_id_1 && events.some((e) => e.id === c.event_id_1 || e.id === c.event_id_2));

  const children: Array<Paragraph | Table> = [
    masthead(settings),
    new Paragraph({ spacing: { before: 240 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: `LỊCH CÔNG TÁC TUẦN ${meta.week_number}`, bold: true, font: FONT, size: 30 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `(Từ ngày ${formatDdMmYyyy(meta.week_start)} đến ngày ${formatDdMmYyyy(meta.week_end)})`, font: FONT, size: SIZE })] }),
    new Paragraph({ spacing: { after: 120 }, children: [] }),
    scheduleTable(report),
  ];

  if (openConflicts.length) {
    children.push(new Paragraph({
      spacing: { before: 200 },
      children: [new TextRun({ text: `Lưu ý: còn ${openConflicts.length} mốc trùng lịch cần xử lý trước khi ban hành.`, bold: true, font: FONT, size: SIZE, color: 'B45309' })],
    }));
  }

  children.push(
    new Paragraph({ spacing: { before: 240 }, children: [new TextRun({ text: `Tổng hợp: ${totals.events} mục lịch · ${Math.round(totals.minutes / 6) / 10} giờ · ${totals.pending_preparation} mục chưa ghi chuẩn bị.`, font: FONT, size: SMALL, italics: true })] }),
    new Paragraph({ spacing: { before: 240 }, children: [new TextRun({ text: 'Nơi nhận:', bold: true, font: FONT, size: SIZE })] }),
    new Paragraph({ children: [new TextRun({ text: '- Thường trực Đảng ủy, UBND (để b/c);', font: FONT, size: SIZE })] }),
    new Paragraph({ children: [new TextRun({ text: '- Các ban, ngành, đoàn thể;', font: FONT, size: SIZE })] }),
    new Paragraph({ children: [new TextRun({ text: '- Lưu: VP.', font: FONT, size: SIZE })] }),
    new Paragraph({
      spacing: { before: 320 },
      alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text: 'CHẤP HÀNH ĐẢNG BỘ / CHỦ TỊCH UBND', bold: true, font: FONT, size: SIZE })],
    }),
    new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: '(Ký, đóng dấu)', italics: true, font: FONT, size: SMALL })] }),
    new Paragraph({ spacing: { before: 600 }, alignment: AlignmentType.RIGHT, children: [new TextRun({ text: settings.signer || '…………', bold: true, font: FONT, size: SIZE })] }),
  );

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: SIZE } } } },
    sections: [{
      properties: { page: { margin: { top: 1134, right: 850, bottom: 1134, left: 1134 } } },
      children,
    }],
  });
  return Packer.toBuffer(doc);
}
