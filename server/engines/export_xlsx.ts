/**
 * Xuất bảng tính .xlsx:
 * - Sheet 1: Mẫu BXDĐ (5 cột chuẩn, có dải phân cách ngày màu vàng kim và lưu ý thay thư mời)
 * - Sheet 2: Lịch phẳng để lọc dữ liệu
 * - Sheet 3: Tổng hợp theo ngày
 * - Sheet 4: Phân công theo người
 * - Sheet 5: Xung đột đang mở
 * - Sheet 6: Thông tin ban hành
 */
import ExcelJS from 'exceljs';
import type { ConflictRecord, EventRecord, SettingsRecord } from '../types.ts';
import { buildWeekReport } from '../services/report_data.ts';
import { formatDdMmYyyy, WEEKDAY_FULL, fromIso, addDays } from '../utils/dates.ts';
import { cleanVietnameseOcrText } from '../utils/clock.ts';
import { formatBxddTime, compareDayEvents } from './official_document.ts';

const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2A5F' } };
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' };

const GOLD_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF08A' } };
const GOLD_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FF000000' }, size: 11, name: 'Calibri' };

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
  bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
  left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
  right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
};

function styleHeader(row: ExcelJS.Row): void {
  row.height = 24;
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = { bottom: { style: 'medium', color: { argb: 'FF2563EB' } } };
  });
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Nháp',
  PROPOSED: 'Đề xuất',
  APPROVED: 'Đã duyệt',
  PUBLISHED: 'Đã ban hành',
  REJECTED: 'Từ chối',
};

export interface XlsxInput {
  events: EventRecord[];
  settings: SettingsRecord;
  weekStart: string;
  conflicts: ConflictRecord[];
}

export async function buildWeekXlsx({ events, settings, weekStart, conflicts }: XlsxInput): Promise<Buffer> {
  const report = buildWeekReport(events, settings, weekStart);
  const weekEnd = addDays(weekStart, 6);
  const advisorName = settings.advisor_unit || 'Ban Xây dựng Đảng';
  const unitName = settings.unit_name || 'Đảng ủy Phường Thủ Dầu Một';

  const wb = new ExcelJS.Workbook();
  wb.creator = advisorName;
  wb.created = new Date();

  // ---------- Sheet 1: Mẫu BXDĐ chuẩn (5 cột) ----------
  const bxddSheet = wb.addWorksheet('Mẫu BXDĐ (5 cột)');
  bxddSheet.columns = [
    { key: 'time', width: 14 },
    { key: 'content', width: 48 },
    { key: 'executor', width: 28 },
    { key: 'attendees', width: 26 },
    { key: 'location', width: 26 },
  ];

  // Tiêu đề đầu văn bản
  const r1 = bxddSheet.addRow([`${unitName.toUpperCase()} - ${advisorName.toUpperCase()}`, '', '', 'ĐẢNG CỘNG SẢN VIỆT NAM', '']);
  r1.font = { bold: true, size: 10, name: 'Calibri' };

  const r2 = bxddSheet.addRow([`LỊCH LÀM VIỆC CỦA LÃNH ĐẠO ${advisorName.toUpperCase()}`, '', '', '', '']);
  bxddSheet.mergeCells(`A${r2.number}:E${r2.number}`);
  r2.height = 24;
  r2.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  r2.getCell(1).font = { bold: true, size: 13, name: 'Calibri', color: { argb: 'FF0F2A5F' } };

  const r3 = bxddSheet.addRow([`(Từ ngày ${formatDdMmYyyy(weekStart)} đến ngày ${formatDdMmYyyy(weekEnd)})`, '', '', '', '']);
  bxddSheet.mergeCells(`A${r3.number}:E${r3.number}`);
  r3.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  r3.getCell(1).font = { italic: true, size: 11, name: 'Calibri', color: { argb: 'FF475569' } };

  bxddSheet.addRow([]); // Dòng trống

  // Dòng tiêu đề cột
  const hRow = bxddSheet.addRow(['Thời gian', 'Nội dung', 'Người Thực hiện', 'Cùng dự', 'Địa điểm']);
  hRow.height = 22;
  hRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    cell.font = { bold: true, size: 11, name: 'Calibri', color: { argb: 'FF0F2A5F' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = THIN_BORDER;
  });

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

    // Dải phân cách ngày màu vàng kim
    const dayRow = bxddSheet.addRow([dayLabel, '', '', '', '']);
    const dayRowNum = dayRow.number;
    bxddSheet.mergeCells(`A${dayRowNum}:E${dayRowNum}`);
    dayRow.height = 20;
    const dayCell = dayRow.getCell(1);
    dayCell.fill = GOLD_FILL;
    dayCell.font = GOLD_FONT;
    dayCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    dayCell.border = THIN_BORDER;

    if (dayEvents.length === 0) {
      const emptyRow = bxddSheet.addRow(['Lãnh đạo ban làm việc theo chương trình riêng', '', '', '', '']);
      const emptyNum = emptyRow.number;
      bxddSheet.mergeCells(`A${emptyNum}:E${emptyNum}`);
      emptyRow.height = 20;
      const ec = emptyRow.getCell(1);
      ec.font = { italic: true, size: 10, color: { argb: 'FF555555' }, name: 'Calibri' };
      ec.alignment = { vertical: 'middle', horizontal: 'center' };
      ec.border = THIN_BORDER;
    } else {
      for (const ev of dayEvents) {
        const timeText = formatBxddTime(ev.start_time, ev.end_time);
        const contentLines = [cleanVietnameseOcrText(ev.title)];
        if (ev.content && ev.content !== ev.title) contentLines.push(cleanVietnameseOcrText(ev.content));
        if (ev.preparation) contentLines.push(`(${cleanVietnameseOcrText(ev.preparation)})`);

        const evRow = bxddSheet.addRow({
          time: timeText,
          content: contentLines.filter(Boolean).join('\n'),
          executor: cleanVietnameseOcrText(ev.chair || '—'),
          attendees: cleanVietnameseOcrText(ev.participants || ev.participant_group || '—'),
          location: cleanVietnameseOcrText(ev.location || '—'),
        });
        evRow.alignment = { vertical: 'top', wrapText: true };
        evRow.getCell(1).alignment = { vertical: 'top', horizontal: 'center' };
        evRow.getCell(1).font = { bold: true, size: 10.5, name: 'Calibri' };
        evRow.eachCell((cell) => {
          cell.border = THIN_BORDER;
        });
      }
    }
  }

  // Chú thích Lưu ý thay cho Thư mời họp
  bxddSheet.addRow([]);
  const noteRow = bxddSheet.addRow([
    '* Lưu ý: Lịch làm việc này thay cho Thư mời họp, tùy vào tình hình thực tế, khi cần thiết Lãnh đạo ban sẽ quyết định triệu tập các cuộc họp đột xuất (nếu có) để chỉ đạo giải quyết các vấn đề phát sinh.',
    '', '', '', ''
  ]);
  const noteNum = noteRow.number;
  bxddSheet.mergeCells(`A${noteNum}:E${noteNum}`);
  noteRow.getCell(1).font = { italic: true, size: 10, color: { argb: 'FF333333' }, name: 'Calibri' };
  noteRow.getCell(1).alignment = { vertical: 'middle', wrapText: true };

  // ---------- Sheet 2: Lịch phẳng (lọc dữ liệu) ----------
  const flatSheet = wb.addWorksheet('Lịch phẳng (dữ liệu)', { views: [{ state: 'frozen', ySplit: 1 }] });
  flatSheet.columns = [
    { header: 'Ngày', key: 'date', width: 12 },
    { header: 'Thứ', key: 'weekday', width: 11 },
    { header: 'Bắt đầu', key: 'start', width: 9 },
    { header: 'Kết thúc', key: 'end', width: 9 },
    { header: 'Nội dung', key: 'title', width: 46 },
    { header: 'Người Thực hiện', key: 'chair', width: 24 },
    { header: 'Cùng dự / Thành phần', key: 'participants', width: 30 },
    { header: 'Địa điểm', key: 'location', width: 24 },
    { header: 'Chuẩn bị', key: 'preparation', width: 30 },
    { header: 'Trạng thái', key: 'status', width: 13 },
    { header: 'Ưu tiên', key: 'priority', width: 9 },
  ];
  styleHeader(flatSheet.getRow(1));

  for (const day of report.days) {
    for (const ev of day.events) {
      const row = flatSheet.addRow({
        date: formatDdMmYyyy(day.date),
        weekday: day.weekday,
        start: ev.start_time,
        end: ev.end_time,
        title: ev.title,
        chair: ev.chair || '',
        participants: ev.participants || ev.participant_group || '',
        location: ev.location || '',
        preparation: ev.preparation || '',
        status: STATUS_LABEL[ev.status] || ev.status,
        priority: ev.priority_score,
      });
      row.alignment = { vertical: 'top', wrapText: true };
      if (ev.priority_score >= 80) row.getCell('priority').font = { bold: true, color: { argb: 'FFB91C1C' } };
    }
  }
  flatSheet.autoFilter = { from: 'A1', to: 'K1' };

  // ---------- Sheet 3: Tổng hợp ngày ----------
  const daySheet = wb.addWorksheet('Theo ngày', { views: [{ state: 'frozen', ySplit: 1 }] });
  daySheet.columns = [
    { header: 'Ngày', key: 'date', width: 12 },
    { header: 'Thứ', key: 'weekday', width: 12 },
    { header: 'Số mục', key: 'count', width: 9 },
    { header: 'Số giờ', key: 'hours', width: 9 },
    { header: 'Mục ưu tiên cao', key: 'high', width: 15 },
  ];
  styleHeader(daySheet.getRow(1));
  for (const day of report.days) {
    daySheet.addRow({
      date: formatDdMmYyyy(day.date),
      weekday: day.weekday,
      count: day.events.length,
      hours: Math.round(day.minutes / 6) / 10,
      high: day.events.filter((e) => e.priority_score >= 80).length,
    });
  }
  const totalRow = daySheet.addRow({
    date: 'TỔNG',
    weekday: '',
    count: report.totals.events,
    hours: Math.round(report.totals.minutes / 6) / 10,
    high: report.totals.high_priority,
  });
  totalRow.font = { bold: true };

  // ---------- Sheet 4: Theo người ----------
  const personSheet = wb.addWorksheet('Theo người', { views: [{ state: 'frozen', ySplit: 1 }] });
  personSheet.columns = [
    { header: 'Cán bộ / người thực hiện', key: 'person', width: 32 },
    { header: 'Số mục', key: 'events', width: 10 },
    { header: 'Số giờ', key: 'hours', width: 10 },
    { header: 'Mục ưu tiên cao', key: 'high', width: 16 },
  ];
  styleHeader(personSheet.getRow(1));
  for (const p of report.by_person) {
    personSheet.addRow({ person: p.person, events: p.events, hours: Math.round(p.minutes / 6) / 10, high: p.high_priority });
  }
  if (!report.by_person.length) personSheet.addRow({ person: '(Chưa có dữ liệu phân công)', events: 0, hours: 0, high: 0 });

  // ---------- Sheet 5: Xung đột ----------
  const conflictSheet = wb.addWorksheet('Xung đột mở', { views: [{ state: 'frozen', ySplit: 1 }] });
  conflictSheet.columns = [
    { header: 'Mức độ', key: 'severity', width: 12 },
    { header: 'Loại', key: 'type', width: 18 },
    { header: 'Sự kiện 1', key: 'one', width: 40 },
    { header: 'Sự kiện 2', key: 'two', width: 40 },
    { header: 'Mô tả', key: 'detail', width: 60 },
  ];
  styleHeader(conflictSheet.getRow(1));
  const byId = new Map(events.map((e) => [e.id, e]));
  const open = conflicts.filter((c) => c.status === 'OPEN');
  for (const c of open) {
    const a = byId.get(c.event_id_1);
    const b = byId.get(c.event_id_2);
    conflictSheet.addRow({
      severity: c.severity || '',
      type: c.conflict_type || '',
      one: a ? `${formatDdMmYyyy(a.event_date)} ${a.start_time} — ${a.title}` : c.event_id_1,
      two: b ? `${formatDdMmYyyy(b.event_date)} ${b.start_time} — ${b.title}` : c.event_id_2,
      detail: c.description || '',
    });
  }
  if (!open.length) conflictSheet.addRow({ severity: '', type: '', one: 'Không có xung đột mở', two: '', detail: '' });

  // ---------- Sheet 6: Thông tin ----------
  const info = wb.addWorksheet('Thông tin');
  info.columns = [{ width: 26 }, { width: 70 }];
  const rows: Array<[string, string]> = [
    ['Cơ quan ban hành', unitName],
    ['Đơn vị lập lịch', advisorName],
    ['Số hiệu văn bản', settings.document_number || ''],
    ['Người ký', settings.signer || ''],
    ['Tuần số', String(report.meta.week_number)],
    ['Từ ngày', formatDdMmYyyy(report.meta.week_start)],
    ['Đến ngày', formatDdMmYyyy(report.meta.week_end)],
    ['Năm', String(report.meta.year)],
    ['Tổng số mục', String(report.totals.events)],
    ['Tổng số giờ', String(Math.round(report.totals.minutes / 6) / 10)],
    ['Xuất lúc', new Date().toLocaleString('vi-VN')],
  ];
  for (const [key, value] of rows) {
    const row = info.addRow([key, value]);
    row.getCell(1).font = { bold: true };
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}
