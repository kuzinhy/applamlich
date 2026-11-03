/**
 * Xuất lịch tuần ra .docx để cán bộ văn phòng mở bằng Word, sửa thể thức rồi phát hành.
 * Hỗ trợ mẫu chuẩn Ban Xây dựng Đảng (5 cột, dải phân cách ngày màu vàng kim) và mẫu hành chính.
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
import type { ConflictRecord, EventRecord, SettingsRecord } from '../types.ts';
import { formatDdMmYyyy, WEEKDAY_FULL, fromIso, addDays } from '../utils/dates.ts';
import { buildWeekReport } from '../services/report_data.ts';
import { parentOrgLine, placeNameOf } from '../utils/organization.ts';
import { cleanVietnameseOcrText } from '../utils/clock.ts';
import { formatBxddTime, compareDayEvents } from './official_document.ts';

const FONT = 'Times New Roman';
const SIZE = 26; // 13pt (nửa point)
const TITLE_SIZE = 30; // 15pt
const SMALL = 22; // 11pt
const DASH = '—';

const BORDER = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
const TABLE_BORDERS = {
  top: BORDER,
  bottom: BORDER,
  left: BORDER,
  right: BORDER,
  insideHorizontal: BORDER,
  insideVertical: BORDER,
};

const CELL = (
  text: string,
  opts: {
    bold?: boolean;
    italics?: boolean;
    align?: (typeof AlignmentType)[keyof typeof AlignmentType];
    span?: number;
    fill?: string;
    width?: number;
    small?: boolean;
    color?: string;
  } = {}
) =>
  new TableCell({
    children: [
      new Paragraph({
        alignment: opts.align,
        children: [
          new TextRun({
            text: cleanVietnameseOcrText(text),
            bold: opts.bold,
            italics: opts.italics,
            font: FONT,
            size: opts.small ? SMALL : SIZE,
            color: opts.color,
          }),
        ],
      }),
    ],
    columnSpan: opts.span,
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.fill ? { fill: opts.fill } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
  });

function mastheadBxdd(settings: SettingsRecord): Table {
  const left = new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    },
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: parentOrgLine(settings).toUpperCase(), bold: true, font: FONT, size: SMALL }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: (settings.unit_name || 'ĐẢNG ỦY PHƯỜNG THỦ DẦU MỘT').toUpperCase(), bold: true, font: FONT, size: SIZE }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: (settings.advisor_unit || 'BAN XÂY DỰNG ĐẢNG').toUpperCase(), bold: true, font: FONT, size: SIZE }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: '*', font: FONT, size: SIZE, bold: true })],
      }),
    ],
  });

  const now = new Date();
  const place = placeNameOf(settings.unit_name) || 'Thủ Dầu Một';
  const right = new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    },
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: 'ĐẢNG CỘNG SẢN VIỆT NAM', bold: true, font: FONT, size: SIZE })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: `${place}, ngày ${now.getDate()} tháng ${now.getMonth() + 1} năm ${now.getFullYear()}`,
            italics: true,
            font: FONT,
            size: SIZE,
          }),
        ],
      }),
    ],
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    },
    rows: [new TableRow({ children: [left, right] })],
  });
}

function scheduleTableBxdd(events: EventRecord[], weekStart: string): Table {
  const header = new TableRow({
    tableHeader: true,
    children: [
      CELL('Thời gian', { bold: true, align: AlignmentType.CENTER, width: 11, fill: 'F2F2F2' }),
      CELL('Nội dung', { bold: true, align: AlignmentType.CENTER, width: 39, fill: 'F2F2F2' }),
      CELL('Người Thực hiện', { bold: true, align: AlignmentType.CENTER, width: 18, fill: 'F2F2F2' }),
      CELL('Cùng dự', { bold: true, align: AlignmentType.CENTER, width: 16, fill: 'F2F2F2' }),
      CELL('Địa điểm', { bold: true, align: AlignmentType.CENTER, width: 16, fill: 'F2F2F2' }),
    ],
  });

  const byDate = new Map<string, EventRecord[]>();
  for (const ev of events) {
    const list = byDate.get(ev.event_date) || [];
    list.push(ev);
    byDate.set(ev.event_date, list);
  }

  const rows: TableRow[] = [];
  for (let i = 0; i < 7; i += 1) {
    const date = addDays(weekStart, i);
    const dayOfWeek = fromIso(date).getDay();
    const dayLabel = `${WEEKDAY_FULL[dayOfWeek]}, NGÀY ${formatDdMmYyyy(date)}`.toUpperCase();
    const dayEvents = (byDate.get(date) || [])
      .slice()
      .sort(compareDayEvents);

    // Dải phân cách ngày màu vàng kim
    rows.push(
      new TableRow({
        children: [
          CELL(dayLabel, {
            bold: true,
            align: AlignmentType.LEFT,
            span: 5,
            fill: 'FEF08A', // Vàng kim theo đúng mẫu BXDĐ
          }),
        ],
      })
    );

    if (dayEvents.length === 0) {
      rows.push(
        new TableRow({
          children: [
            CELL('Lãnh đạo ban làm việc theo chương trình riêng', {
              italics: true,
              align: AlignmentType.CENTER,
              span: 5,
            }),
          ],
        })
      );
    } else {
      for (const ev of dayEvents) {
        const timeText = formatBxddTime(ev.start_time, ev.end_time);
        const titleLine = ev.is_supplemental ? `${ev.title} [Lịch bổ sung]` : ev.title;
        const contentLines = [titleLine];
        if (ev.content && ev.content !== ev.title) contentLines.push(ev.content);
        if (ev.preparation) contentLines.push(`(${ev.preparation})`);
        const fullContent = contentLines.filter(Boolean).join('\n');
        const textColor = ev.is_supplemental ? '1D4ED8' : undefined;

        rows.push(
          new TableRow({
            children: [
              CELL(timeText, { bold: true, align: AlignmentType.CENTER, width: 11, color: textColor }),
              CELL(fullContent, { width: 39, color: textColor }),
              CELL(ev.chair || DASH, { width: 18, color: textColor }),
              CELL(ev.participants || ev.participant_group || DASH, { width: 16, color: textColor }),
              CELL(ev.location || DASH, { width: 16, color: textColor }),
            ],
          })
        );
      }
    }
  }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: TABLE_BORDERS,
    rows: [header, ...rows],
  });
}

export interface DocxInput {
  events: EventRecord[];
  settings: SettingsRecord;
  weekStart: string;
  conflicts: ConflictRecord[];
  template?: 'bxdd' | 'admin';
}

export async function buildWeekDocx({
  events,
  settings,
  weekStart,
  conflicts,
  template = 'bxdd',
}: DocxInput): Promise<Buffer> {
  const isBxdd = template === 'bxdd';
  const report = buildWeekReport(events, settings, weekStart);
  const { meta } = report;
  const advisorName = settings.advisor_unit || 'Ban Xây dựng Đảng';

  const children: Array<Paragraph | Table> = [
    mastheadBxdd(settings),
    new Paragraph({
      spacing: { before: 240, after: 80 },
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: 'LỊCH LÀM VIỆC',
          bold: true,
          font: FONT,
          size: TITLE_SIZE,
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 60 },
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `của Lãnh đạo ${advisorName}`,
          bold: true,
          font: FONT,
          size: 28,
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 180 },
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `(Từ ngày ${formatDdMmYyyy(meta.week_start)} đến ngày ${formatDdMmYyyy(meta.week_end)})`,
          italics: true,
          font: FONT,
          size: SIZE,
        }),
      ],
    }),
    scheduleTableBxdd(events, weekStart),
    new Paragraph({
      spacing: { before: 200, after: 120 },
      children: [
        new TextRun({
          text: '* Lưu ý: ',
          bold: true,
          italics: true,
          font: FONT,
          size: SMALL,
        }),
        new TextRun({
          text: 'Lịch làm việc này thay cho Thư mời họp, tùy vào tình hình thực tế, khi cần thiết Lãnh đạo ban sẽ quyết định triệu tập các cuộc họp đột xuất (nếu có) để chỉ đạo giải quyết các vấn đề phát sinh.',
          italics: true,
          font: FONT,
          size: SMALL,
        }),
      ],
    }),
  ];

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: SIZE } } } },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1134, right: 850, bottom: 1134, left: 1134 },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
