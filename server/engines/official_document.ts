import type { ConflictRecord, EventRecord, SettingsRecord } from '../types.ts';
import { formatDdMmYyyy, WEEKDAY_LABELS, fromIso } from '../utils/dates.ts';
import { isPartyDocument, parentOrgLine, placeNameOf } from '../utils/organization.ts';

const esc = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br/>');

const dash = 'Chưa có trong văn bản';

interface DocInput {
  events: EventRecord[];
  settings: SettingsRecord;
  weekStart: string;
  weekEnd: string;
  weekNumber: number;
  conflicts: ConflictRecord[];
  /** Trang chia sẻ công khai: ẩn bảng nút gọi API nội bộ, chỉ giữ nút in. */
  publicMode?: boolean;
}

/** Lịch trình một ngày: gộp các sự kiện cùng ngày theo thứ tự giờ. */
function dayRows(dayEvents: EventRecord[], date: string): string {
  const cells = dayEvents
    .slice()
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
    .map((ev) => `
      <tr>
        <td class="c">${esc(ev.start_time)}${ev.end_time ? ` – ${esc(ev.end_time)}` : ''}</td>
        <td><strong>${esc(ev.title || dash)}</strong>${ev.content ? `<div class="sub">${esc(ev.content)}</div>` : ''}</td>
        <td>${esc(ev.participants || ev.participant_group || dash)}</td>
        <td>${esc(ev.location || dash)}</td>
        <td>${esc(ev.chair || dash)}</td>
        <td class="prep">${esc(ev.preparation || dash)}</td>
      </tr>`)
    .join('');
  return `
    <tbody>
      <tr class="day"><td colspan="6">${WEEKDAY_LABELS[fromIso(date).getDay()]} — ${formatDdMmYyyy(date)}</td></tr>
      ${cells}
    </tbody>`;
}

export function officialDocumentHtml({ events, settings, weekStart, weekEnd, weekNumber, conflicts, publicMode = false }: DocInput): string {
  const byDate = new Map<string, EventRecord[]>();
  for (const ev of events) {
    const list = byDate.get(ev.event_date) || [];
    list.push(ev);
    byDate.set(ev.event_date, list);
  }
  const bodies = [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, dayEvents]) => dayRows(dayEvents, date))
    .join('');

  const unresolved = conflicts.filter((c) =>
    events.some((e) => e.id === c.event_id_1 || e.id === c.event_id_2)
  );
  const toolbar = publicMode
    ? `<div class="toolbar">
  <span>Lịch công tác tuần ${weekNumber} — bản tra cứu công khai</span>
  <button onclick="window.print()">In / lưu PDF</button>
</div>`
    : `<div class="toolbar">
  <span>Lịch công tác tuần ${weekNumber} — ${formatDdMmYyyy(weekStart)} đến ${formatDdMmYyyy(weekEnd)} · ${events.length} sự kiện${unresolved.length ? ` · ${unresolved.length} xung đột mở` : ''}</span>
  <button onclick="window.print()">In / lưu PDF</button>
  <button onclick="location.href='/api/export/ics?week=${weekStart}'">Tải .ics</button>
</div>`;

  const today = new Date();
  const placeLine = `${esc(placeNameOf(settings.unit_name))}, ngày ${today.getDate()} tháng ${today.getMonth() + 1} năm ${today.getFullYear()}`;
  const rightHead = isPartyDocument(settings)
    ? `<div class="org">ĐẢNG CỘNG SẢN VIỆT NAM</div>`
    : `<div class="org">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>\n      <div class="motto">Độc lập - Tự do - Hạnh phúc</div>`;

  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8"/>
<title>Lịch công tác tuần ${weekNumber}</title>
<style>
  @page { size: A4; margin: 20mm 15mm; }
  body { font-family: "Times New Roman", Times, Tinos, "Nimbus Roman", "Liberation Serif", serif; font-size: 13pt; color: #000; margin: 0; background: #fff; }
  .page { max-width: 180mm; margin: 0 auto; padding: 12mm; }
  .masthead { display: flex; justify-content: space-between; margin-bottom: 3mm; }
  .masthead .col { width: 48%; text-align: center; }
  .masthead .org { font-weight: 700; text-transform: uppercase; font-size: 12pt; }
  .masthead .motto { font-size: 12pt; font-weight: 700; }
  .masthead .stars { font-size: 11pt; }
  .masthead .docno { font-style: italic; margin-top: 2mm; }
  .masthead .place { font-style: italic; margin-top: 2mm; }
  .title { text-align: center; margin: 6mm 0; }
  .title h1 { font-size: 15pt; font-weight: 700; text-transform: uppercase; margin: 0 0 1mm; }
  table { width: 100%; border-collapse: collapse; font-size: 11pt; }
  th, td { border: 0.6pt solid #333; padding: 2mm; vertical-align: top; text-align: left; }
  th { background: #f2f2f2; text-transform: uppercase; font-weight: 700; text-align: center; }
  td.c { text-align: center; white-space: nowrap; }
  tr.day td { background: #e8eefc; font-weight: 700; text-transform: uppercase; }
  .sub { color: #333; font-size: 10pt; margin-top: 1mm; }
  .prep { font-size: 10pt; }
  .notes { margin-top: 6mm; font-size: 11pt; }
  .notes h3 { font-size: 12pt; text-transform: uppercase; margin-bottom: 2mm; }
  .sign { display: flex; margin-top: 10mm; font-size: 12pt; }
  .sign .left { width: 45%; text-align: center; }
  .sign .right { width: 55%; text-align: center; }
  .sign .name { font-weight: 700; margin-top: 18mm; }
  .warn { background: #fff4e5; border-left: 3pt solid #e07b00; padding: 2mm 3mm; margin-top: 3mm; font-size: 11pt; }
  .toolbar { position: sticky; top: 0; background: #0f172a; color: #fff; padding: 8px 14px; font-family: "Segoe UI", "Segoe UI Variable Text", system-ui, -apple-system, Roboto, Arial, sans-serif; font-size: 13px; display: flex; gap: 12px; align-items: center; }
  .toolbar button { background: #2563eb; color: #fff; border: 0; border-radius: 6px; padding: 7px 14px; font-size: 13px; font-family: inherit; cursor: pointer; }
  @media print { .toolbar { display: none; } .page { padding: 0; } }
</style>
</head>
<body>
${toolbar}
<div class="page">
  <div class="masthead">
    <div class="col">
      <div class="org">${esc(parentOrgLine(settings))}</div>
      <div class="org">${esc(settings.unit_name)}</div>
      <div class="stars">***</div>
      <div class="docno">Số: ${esc(settings.document_number || '…')}</div>
    </div>
    <div class="col">
      ${rightHead}
      <div class="stars">***</div>
      <div class="place">${placeLine}</div>
    </div>
  </div>
  <div class="title">
    <h1>Lịch công tác tuần ${weekNumber}</h1>
    <div>(Từ ngày ${formatDdMmYyyy(weekStart)} đến ngày ${formatDdMmYyyy(weekEnd)})</div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:11%">Thời gian</th>
        <th style="width:24%">Nội dung</th>
        <th style="width:19%">Thành phần</th>
        <th style="width:16%">Địa điểm</th>
        <th style="width:14%">Chủ trì</th>
        <th style="width:16%">Chuẩn bị</th>
      </tr>
    </thead>
    ${bodies || '<tbody><tr><td colspan="6" class="c">Tuần này chưa có sự kiện nào.</td></tr></tbody>'}
  </table>
  ${unresolved.length ? `<div class="warn"><strong>Lưu ý:</strong> còn ${unresolved.length} mốc trùng lịch cần xử lý trước khi ban hành.</div>` : ''}
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
</div>
</body>
</html>`;
}
