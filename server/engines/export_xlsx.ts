/**
 * Xuất bảng tính .xlsx: một sheet lịch tuần phẳng để lọc/đếm, một sheet tổng hợp theo ngày,
 * một sheet tải việc theo người và một sheet xung đột đang mở.
 */
import ExcelJS from 'exceljs';
import type { ConflictRecord, EventRecord, SettingsRecord } from '../types.ts';
import { buildWeekReport } from '../services/report_data.ts';
import { formatDdMmYyyy } from '../utils/dates.ts';

const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2A5F' } };
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' };

function styleHeader(row: ExcelJS.Row): void {
  row.height = 22;
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF2563EB' } } };
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
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Lịch công tác phường';
  wb.created = new Date();

  // ---------- Sheet 1: lịch phẳng ----------
  const sheet = wb.addWorksheet('Lịch tuần', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = [
    { header: 'Ngày', key: 'date', width: 12 },
    { header: 'Thứ', key: 'weekday', width: 11 },
    { header: 'Bắt đầu', key: 'start', width: 9 },
    { header: 'Kết thúc', key: 'end', width: 9 },
    { header: 'Nội dung', key: 'title', width: 46 },
    { header: 'Thành phần', key: 'participants', width: 30 },
    { header: 'Địa điểm', key: 'location', width: 24 },
    { header: 'Chủ trì', key: 'chair', width: 22 },
    { header: 'Chuẩn bị', key: 'preparation', width: 30 },
    { header: 'Trạng thái', key: 'status', width: 13 },
    { header: 'Ưu tiên', key: 'priority', width: 9 },
  ];
  styleHeader(sheet.getRow(1));

  for (const day of report.days) {
    for (const ev of day.events) {
      const row = sheet.addRow({
        date: formatDdMmYyyy(day.date),
        weekday: day.weekday,
        start: ev.start_time,
        end: ev.end_time,
        title: ev.title,
        participants: ev.participants || ev.participant_group || '',
        location: ev.location || '',
        chair: ev.chair || '',
        preparation: ev.preparation || '',
        status: STATUS_LABEL[ev.status] || ev.status,
        priority: ev.priority_score,
      });
      row.alignment = { vertical: 'top', wrapText: true };
      if (ev.priority_score >= 80) row.getCell('priority').font = { bold: true, color: { argb: 'FFB91C1C' } };
    }
  }
  sheet.autoFilter = { from: 'A1', to: 'K1' };

  // ---------- Sheet 2: tổng hợp ngày ----------
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

  // ---------- Sheet 3: theo người ----------
  const personSheet = wb.addWorksheet('Theo người', { views: [{ state: 'frozen', ySplit: 1 }] });
  personSheet.columns = [
    { header: 'Cán bộ / thành phần', key: 'person', width: 32 },
    { header: 'Số mục', key: 'events', width: 10 },
    { header: 'Số giờ', key: 'hours', width: 10 },
    { header: 'Mục ưu tiên cao', key: 'high', width: 16 },
  ];
  styleHeader(personSheet.getRow(1));
  for (const p of report.by_person) {
    personSheet.addRow({ person: p.person, events: p.events, hours: Math.round(p.minutes / 6) / 10, high: p.high_priority });
  }
  if (!report.by_person.length) personSheet.addRow({ person: '(Chưa có dữ liệu phân công)', events: 0, hours: 0, high: 0 });

  // ---------- Sheet 4: xung đột ----------
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

  // ---------- Sheet 5: thông tin ----------
  const info = wb.addWorksheet('Thông tin');
  info.columns = [{ width: 26 }, { width: 70 }];
  const rows: Array<[string, string]> = [
    ['Đơn vị', settings.unit_name || ''],
    ['Số hiệu văn bản', settings.document_number || ''],
    ['Người ký', settings.signer || ''],
    ['Tuần số', String(report.meta.week_number)],
    ['Từ ngày', formatDdMmYyyy(report.meta.week_start)],
    ['Đến ngày', formatDdMmYyyy(report.meta.week_end)],
    ['Năm', String(report.meta.year)],
    ['Tổng số mục', String(report.totals.events)],
    ['Tổng số giờ', String(Math.round(report.totals.minutes / 6) / 10)],
    ['Chưa ghi chuẩn bị', String(report.totals.pending_preparation)],
    ['Xuất lúc', new Date().toLocaleString('vi-VN')],
  ];
  for (const [key, value] of rows) {
    const row = info.addRow([key, value]);
    row.getCell(1).font = { bold: true };
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}
