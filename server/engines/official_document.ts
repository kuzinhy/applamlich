import type { ConflictRecord, EventRecord, SettingsRecord } from '../types.ts';
import { formatDdMmYyyy, WEEKDAY_FULL, fromIso, addDays } from '../utils/dates.ts';
import { isPartyDocument, parentOrgLine, placeNameOf } from '../utils/organization.ts';
import { cleanVietnameseOcrText } from '../utils/clock.ts';

const esc = (value: unknown): string =>
  cleanVietnameseOcrText(String(value ?? ''))
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br/>');

export function compareDayEvents(a: EventRecord, b: EventRecord): number {
  if (typeof a.sort_order === 'number' && typeof b.sort_order === 'number' && a.sort_order !== b.sort_order) {
    return a.sort_order - b.sort_order;
  }
  return String(a.start_time || '').localeCompare(String(b.start_time || ''));
}

function normalizeSingleBxddClock(raw: string): string {
  const clean = cleanVietnameseOcrText(raw.trim());
  const m = /^(\d{1,2})\s*(?:[:hg]|giờ)\s*(\d{0,2})/i.exec(clean);
  if (m) {
    let h = Number(m[1]);
    const min = (m[2] || '00').padStart(2, '0');
    if (h >= 1 && h <= 5) h += 12;
    return `${h}g${min}`;
  }
  return clean
    .replace(/^0(\d)/, '$1')
    .replace(/(\d{1,2})[:h](\d{2})/, '$1g$2')
    .replace(/(\d{1,2})\s*giờ\s*(\d{2})/, '$1g$2')
    .replace(/(\d{1,2})\s*giờ$/, '$1g00');
}

export function formatBxddTime(startTime?: string | null, endTime?: string | null): string {
  if (!startTime) return '';
  let formatted = normalizeSingleBxddClock(startTime);
  if (endTime) {
    formatted += ` – ${normalizeSingleBxddClock(endTime)}`;
  }
  return formatted;
}

export interface DocInput {
  events: EventRecord[];
  settings: SettingsRecord;
  weekStart: string;
  weekEnd: string;
  weekNumber: number;
  conflicts: ConflictRecord[];
  /** Trang chia sẻ công khai: ẩn bảng nút gọi API nội bộ, chỉ giữ nút in. */
  publicMode?: boolean;
  /** Mẫu hiển thị: 'bxdd' (mẫu 5 cột chuẩn Ban Xây dựng Đảng) hoặc 'admin' (mẫu 6 cột hành chính). */
  template?: 'bxdd' | 'admin';
}

/** Tạo các dòng cho mẫu Ban Xây dựng Đảng (5 cột) */
function renderBxddTable(events: EventRecord[], weekStart: string): string {
  const byDate = new Map<string, EventRecord[]>();
  for (const ev of events) {
    const list = byDate.get(ev.event_date) || [];
    list.push(ev);
    byDate.set(ev.event_date, list);
  }

  // Duyệt đủ 7 ngày trong tuần
  const daysHtml: string[] = [];
  for (let i = 0; i < 7; i += 1) {
    const date = addDays(weekStart, i);
    const dayOfWeek = fromIso(date).getDay();
    const dayLabel = `${WEEKDAY_FULL[dayOfWeek]}, NGÀY ${formatDdMmYyyy(date)}`.toUpperCase();
    const dayEvents = (byDate.get(date) || [])
      .slice()
      .sort(compareDayEvents);

    const rows = dayEvents.length > 0
      ? dayEvents.map((ev) => {
          const timeText = formatBxddTime(ev.start_time, ev.end_time);
          const executor = ev.chair || '—';
          const attendees = ev.participants || ev.participant_group || '';
          const location = ev.location || '—';

          // Format nội dung có các dấu + hoặc 1. 2. 3.
          let contentHtml = '';
          if (ev.title) {
            contentHtml += `<strong>${esc(ev.title)}</strong>`;
          }
          if (ev.is_supplemental) {
            contentHtml += ` <span class="supp-badge">[Lịch bổ sung]</span>`;
          }
          if (ev.content && ev.content !== ev.title) {
            contentHtml += `${contentHtml ? '<br/>' : ''}<div class="content-body">${esc(ev.content)}</div>`;
          }
          if (ev.preparation) {
            contentHtml += `<div class="prep-note">(${esc(ev.preparation)})</div>`;
          }

          return `
            <tr class="${ev.is_supplemental ? 'supplemental-row' : ''}">
              <td class="c time-cell"><strong>${esc(timeText)}</strong></td>
              <td class="content-cell">${contentHtml || '—'}</td>
              <td class="exec-cell">${esc(executor)}</td>
              <td class="attend-cell">${attendees ? esc(attendees) : '—'}</td>
              <td class="loc-cell">${esc(location)}</td>
            </tr>`;
        }).join('')
      : `<tr>
          <td colspan="5" class="empty-day-cell">Lãnh đạo ban làm việc theo chương trình riêng</td>
        </tr>`;

    daysHtml.push(`
      <tbody>
        <tr class="day-gold"><td colspan="5">${esc(dayLabel)}</td></tr>
        ${rows}
      </tbody>
    `);
  }

  return daysHtml.join('');
}

/** Tạo các dòng cho mẫu hành chính chuẩn (6 cột) */
function renderAdminTable(events: EventRecord[], weekStart: string): string {
  const byDate = new Map<string, EventRecord[]>();
  for (const ev of events) {
    const list = byDate.get(ev.event_date) || [];
    list.push(ev);
    byDate.set(ev.event_date, list);
  }

  const daysHtml: string[] = [];
  for (let i = 0; i < 7; i += 1) {
    const date = addDays(weekStart, i);
    const dayOfWeek = fromIso(date).getDay();
    const dayLabel = `${WEEKDAY_FULL[dayOfWeek]} — ${formatDdMmYyyy(date)}`.toUpperCase();
    const dayEvents = (byDate.get(date) || [])
      .slice()
      .sort(compareDayEvents);

    if (dayEvents.length === 0) continue;

    const rows = dayEvents.map((ev) => `
      <tr class="${ev.is_supplemental ? 'supplemental-row' : ''}">
        <td class="c">${esc(ev.start_time)}${ev.end_time ? ` – ${esc(ev.end_time)}` : ''}</td>
        <td><strong>${esc(ev.title || 'Chưa có tiêu đề')}</strong>${ev.is_supplemental ? ' <span class="supp-badge">[Lịch bổ sung]</span>' : ''}${ev.content ? `<div class="sub">${esc(ev.content)}</div>` : ''}</td>
        <td>${esc(ev.participants || ev.participant_group || '—')}</td>
        <td>${esc(ev.location || '—')}</td>
        <td>${esc(ev.chair || '—')}</td>
        <td class="prep">${esc(ev.preparation || '—')}</td>
      </tr>
    `).join('');

    daysHtml.push(`
      <tbody>
        <tr class="day"><td colspan="6">${esc(dayLabel)}</td></tr>
        ${rows}
      </tbody>
    `);
  }

  if (daysHtml.length === 0) {
    return '<tbody><tr><td colspan="6" class="c">Tuần này chưa có sự kiện nào.</td></tr></tbody>';
  }

  return daysHtml.join('');
}

export function officialDocumentHtml({
  events,
  settings,
  weekStart,
  weekEnd,
  weekNumber,
  conflicts,
  publicMode = false,
  template = 'admin',
}: DocInput): string {
  const isBxdd = template === 'bxdd';
  const tableBody = isBxdd
    ? renderBxddTable(events, weekStart)
    : renderAdminTable(events, weekStart);

  const unresolved = conflicts.filter((c) =>
    events.some((e) => e.id === c.event_id_1 || e.id === c.event_id_2)
  );

  const today = new Date();
  const place = placeNameOf(settings.unit_name) || 'Thủ Dầu Một';
  const placeLine = `${esc(place)}, ngày ${today.getDate()} tháng ${today.getMonth() + 1} năm ${today.getFullYear()}`;

  const unitName = settings.unit_name || 'ĐẢNG ỦY PHƯỜNG THỦ DẦU MỘT';
  const advisorName = settings.advisor_unit || 'BAN XÂY DỰNG ĐẢNG';
  const isParty = isPartyDocument(settings);

  const toolbar = publicMode
    ? `<div class="toolbar">
  <span>Lịch công tác tuần ${weekNumber} — bản tra cứu công khai</span>
  <button onclick="window.print()">In / lưu PDF</button>
</div>`
    : `<div class="toolbar">
  <span>Lịch công tác tuần ${weekNumber} (${formatDdMmYyyy(weekStart)} – ${formatDdMmYyyy(weekEnd)}) · ${events.length} sự kiện</span>
  <div class="toolbar-group">
    <button class="${isBxdd ? 'active' : ''}" onclick="window.location.search = '?template=bxdd&week=${weekStart}'">Mẫu Ban Xây dựng Đảng (5 cột)</button>
    <button class="${!isBxdd ? 'active' : ''}" onclick="window.location.search = '?template=admin&week=${weekStart}'">Mẫu Hành chính (6 cột)</button>
    <button onclick="window.print()" class="btn-primary">In / lưu PDF</button>
    <button onclick="location.href='/api/export/docx?template=${isBxdd ? 'bxdd' : 'admin'}&week=${weekStart}'">Tải Word (.docx)</button>
    <button onclick="location.href='/api/export/xlsx?week=${weekStart}'">Tải Excel (.xlsx)</button>
    <button onclick="location.href='/api/export/ics?week=${weekStart}'">Tải .ics</button>
  </div>
</div>`;

  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8"/>
<title>Lịch công tác tuần ${weekNumber} - ${esc(isBxdd ? advisorName : unitName)}</title>
<style>
  @page { size: A4; margin: 15mm 12mm 15mm 15mm; }
  body { font-family: "Times New Roman", Times, Tinos, "Nimbus Roman", "Liberation Serif", serif;
    font-size: 13pt;
    color: #000;
    margin: 0;
    background: #f8fafc;
    line-height: 1.35;
  }
  .page {
    max-width: 210mm;
    margin: 15px auto;
    padding: 20mm 15mm;
    background: #fff;
    box-shadow: 0 4px 14px rgba(0,0,0,0.08);
    box-sizing: border-box;
  }
  .masthead {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 5mm;
  }
  .masthead .col-left { width: 48%; text-align: center; }
  .masthead .col-right { width: 50%; text-align: center; }
  .masthead .org-parent { font-weight: 700; text-transform: uppercase; font-size: 12.5pt; }
  .masthead .org-unit { font-weight: 700; text-transform: uppercase; font-size: 13pt; margin-top: 1mm; }
  .masthead .motto { font-size: 12pt; font-weight: 700; }
  .masthead .stars { font-size: 12pt; margin: 1mm 0; }
  .masthead .place { font-style: italic; font-size: 12pt; margin-top: 1mm; }
  .masthead .docno { font-size: 12pt; font-weight: 700; margin-top: 2mm; }
  
  .title-block { text-align: center; margin: 6mm 0 7mm; }
  .title-block h1 {
    font-size: 15pt;
    font-weight: 700;
    text-transform: uppercase;
    margin: 0 0 2mm;
    letter-spacing: 0.02em;
  }
  .title-block .subtitle {
    font-size: 13.5pt;
    font-weight: 700;
    margin: 0 0 1.5mm;
  }
  .title-block .daterange {
    font-size: 12.5pt;
    font-style: italic;
    color: #111;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11.5pt;
    margin-bottom: 6mm;
  }
  th, td {
    border: 0.6pt solid #000;
    padding: 2.2mm 2.5mm;
    vertical-align: top;
    text-align: left;
  }
  th {
    background: #f2f2f2;
    text-transform: uppercase;
    font-weight: 700;
    text-align: center;
    font-size: 11pt;
  }
  td.c { text-align: center; white-space: nowrap; }
  .time-cell { font-weight: 700; font-size: 11pt; }
  
  /* Banner Thứ trong tuần màu vàng kim theo mẫu BXDĐ */
  tr.day-gold td {
    background: #FEF08A !important;
    color: #000 !important;
    font-weight: 700;
    text-transform: uppercase;
    font-size: 11.5pt;
    padding: 2mm 3mm;
    border-top: 1pt solid #000;
    border-bottom: 0.8pt solid #000;
  }
  tr.day td {
    background: #e8eefc;
    font-weight: 700;
    text-transform: uppercase;
  }
  tr.supplemental-row td,
  tr.supplemental-row td .content-body,
  tr.supplemental-row td .prep-note,
  tr.supplemental-row td .sub {
    color: #1D4ED8 !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .supp-badge {
    display: inline-block;
    font-family: Arial, sans-serif;
    font-size: 9pt;
    font-weight: 700;
    color: #1D4ED8;
    background: #EFF6FF;
    border: 0.6pt solid #93C5FD;
    padding: 0 4px;
    border-radius: 3px;
    margin-left: 4px;
  }
  
  .empty-day-cell {
    text-align: center;
    font-style: italic;
    color: #222;
    padding: 3mm;
  }
  
  .content-cell {
    line-height: 1.4;
  }
  .content-body {
    margin-top: 1mm;
  }
  .prep-note {
    font-style: italic;
    color: #222;
    margin-top: 1mm;
  }
  .sub { color: #333; font-size: 10.5pt; margin-top: 1mm; }
  .prep { font-size: 10.5pt; }

  .footnote {
    font-size: 11pt;
    font-style: italic;
    line-height: 1.45;
    margin-top: 6mm;
    text-align: justify;
  }

  .notes { margin-top: 6mm; font-size: 11pt; }
  .notes h3 { font-size: 12pt; text-transform: uppercase; margin-bottom: 2mm; }
  .sign { display: flex; margin-top: 10mm; font-size: 12pt; }
  .sign .left { width: 45%; text-align: center; }
  .sign .right { width: 55%; text-align: center; }
  .sign .name { font-weight: 700; margin-top: 18mm; }
  
  .warn {
    background: #fff4e5;
    border-left: 3pt solid #e07b00;
    padding: 2mm 3mm;
    margin-top: 3mm;
    margin-bottom: 4mm;
    font-size: 11pt;
  }
  
  .toolbar {
    position: sticky;
    top: 0;
    z-index: 100;
    background: #0f172a;
    color: #fff;
    padding: 8px 16px;
    font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, Arial, sans-serif;
    font-size: 13px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
  }
  .toolbar-group {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  .toolbar button {
    background: rgba(255,255,255,0.15);
    color: #fff;
    border: 1px solid rgba(255,255,255,0.25);
    border-radius: 6px;
    padding: 6px 12px;
    font-size: 12.5px;
    font-family: inherit;
    cursor: pointer;
    font-weight: 600;
    transition: all 0.15s ease;
  }
  .toolbar button:hover {
    background: rgba(255,255,255,0.25);
  }
  .toolbar button.active {
    background: #F59E0B;
    color: #000;
    border-color: #F59E0B;
    font-weight: 700;
  }
  .toolbar button.btn-primary {
    background: #2563eb;
    border-color: #2563eb;
    color: #fff;
  }
  
  @media print {
    .toolbar { display: none !important; }
    body { background: #fff; }
    .page { max-width: 100%; margin: 0; padding: 0; box-shadow: none; }
    tr.day-gold td {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      background-color: #FEF08A !important;
    }
  }
</style>
</head>
<body>
${toolbar}
<div class="page">
  <div class="masthead">
    <div class="col-left">
      <div class="org-parent">${esc(parentOrgLine(settings))}</div>
      <div class="org-unit">${esc(unitName)}</div>
      ${isBxdd ? `<div class="org-unit" style="color:#000;">${esc(advisorName)}</div>` : ''}
      <div class="stars">*</div>
      ${!isBxdd && settings.document_number ? `<div class="docno">Số: ${esc(settings.document_number)}</div>` : ''}
    </div>
    <div class="col-right">
      ${isParty ? `
        <div class="org-parent">ĐẢNG CỘNG SẢN VIỆT NAM</div>
        <div class="stars">${isBxdd ? '' : '***'}</div>
      ` : `
        <div class="org-parent">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
        <div class="motto">Độc lập - Tự do - Hạnh phúc</div>
        <div class="stars">***</div>
      `}
      <div class="place">${placeLine}</div>
    </div>
  </div>

  <div class="title-block">
    ${isBxdd ? `
      <h1>LỊCH LÀM VIỆC</h1>
      <div class="subtitle">của Lãnh đạo ${esc(advisorName)}</div>
      <div class="daterange">(Từ ngày ${formatDdMmYyyy(weekStart)} đến ngày ${formatDdMmYyyy(weekEnd)})</div>
    ` : `
      <h1>LỊCH CÔNG TÁC TUẦN ${weekNumber}</h1>
      <div class="subtitle">(Từ ngày ${formatDdMmYyyy(weekStart)} đến ngày ${formatDdMmYyyy(weekEnd)})</div>
    `}
  </div>

  ${unresolved.length ? `<div class="warn"><strong>Lưu ý:</strong> còn ${unresolved.length} mốc trùng lịch cần xử lý trước khi ban hành.</div>` : ''}

  <table>
    <thead>
      ${isBxdd ? `
        <tr>
          <th style="width:11%">Thời gian</th>
          <th style="width:39%">Nội dung</th>
          <th style="width:18%">Người Thực hiện</th>
          <th style="width:16%">Cùng dự</th>
          <th style="width:16%">Địa điểm</th>
        </tr>
      ` : `
        <tr>
          <th style="width:11%">Thời gian</th>
          <th style="width:24%">Nội dung</th>
          <th style="width:19%">Thành phần</th>
          <th style="width:16%">Địa điểm</th>
          <th style="width:14%">Chủ trì</th>
          <th style="width:16%">Chuẩn bị</th>
        </tr>
      `}
    </thead>
    ${tableBody}
  </table>

  ${isBxdd ? `
    <div class="footnote">
      <strong>* Lưu ý:</strong> Lịch làm việc này thay cho Thư mời họp, tùy vào tình hình thực tế, khi cần thiết Lãnh đạo ban sẽ quyết định triệu tập các cuộc họp đột xuất (nếu có) để chỉ đạo giải quyết các vấn đề phát sinh.
    </div>
  ` : `
    <div class="notes">
      <h3>Nơi nhận</h3>
      <div>- Thường trực Đảng ủy, UBND (để b/c);</div>
      <div>- Các ban, ngành, đoàn thể;</div>
      <div>- Lưu: VP.</div>
    </div>
    <div class="sign">
      <div class="left"></div>
      <div class="right">
        <div>CHẤP HÀNH ĐẢNG BỘ / CHỦ TỊCH UBND</div>
        <div style="font-size:10pt">(Ký, đóng dấu)</div>
        <div class="name">${esc(settings.signer || '…')}</div>
      </div>
    </div>
  `}
</div>
</body>
</html>`;
}
