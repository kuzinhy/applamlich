import { foldVietnamese } from '../services/merge.ts';
import { isPartyDocument, parentOrgLine } from '../utils/organization.ts';
import type { ConflictRecord, EventRecord, SettingsRecord } from '../types.ts';

export type CheckStatus = 'PASS' | 'WARN' | 'FAIL';

export interface FormatCheckItem {
  key: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

const DOC_NUMBER = /^\d{1,3}-(?:LCT|CV|TB|QB|BC|QH)\//i;

const ORG_ABBREVIATIONS = /^(ubnd|tnmt|mttq|hđnd|hdnd|vp|dc|tc|đc|ban|phong|don ?vi|thuong ?truc|uỷ ?ban|ubnd)$/;

/** Bỏ chức danh và dấu câu, chỉ giữ phần trông như họ tên. */
function nameTokensOf(signer: string): string[] {
  return foldVietnamese(signer)
    .replace(/(de ?chu ?tich|chu ?tich|bi ?thu|chu ?nhiem|pho|d ?c|[—\-/,;:()])/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !ORG_ABBREVIATIONS.test(w));
}

/** Kiểm tra thể thức văn bản lịch công tác theo Nghị định 30/2020/NĐ-CP (phụ lục I). */
export function checkDocumentFormat(input: {
  events: EventRecord[];
  settings: SettingsRecord;
  weekNumber: number;
  conflicts: ConflictRecord[];
}): { score: number; items: FormatCheckItem[] } {
  const { events, settings, weekNumber, conflicts } = input;
  const items: FormatCheckItem[] = [];
  const push = (key: string, label: string, status: CheckStatus, detail: string) =>
    items.push({ key, label, status, detail });

  const unit = (settings.unit_name || '').trim().normalize('NFC');
  const place = (unit.match(/(?:phường|xã|thị trấn)\s+(.+)$/i) || [])[1]?.trim() || '';
  const signer = (settings.signer || '').trim().normalize('NFC');
  const partyBlock = /(bí thư|phó bí thư|chủ nhiệm|đảng ủy)/i.test(signer);
  const stateBlock = /(chủ tịch|phó chủ tịch|chánh văn phòng|ubnd)/i.test(signer);

  if (!unit) {
    push('org', 'Quốc hiệu / tiêu ngữ và tên cơ quan', 'FAIL',
      'Chưa nhập tên đơn vị ở phần Cài đặt nên không đóng được cụm đầu văn bản.');
  } else {
    push('org', 'Quốc hiệu / tiêu ngữ và tên cơ quan', place ? 'PASS' : 'WARN',
      place
        ? `${parentOrgLine(settings)} → ${unit} — bản in ghi địa danh "${place}, ngày ... tháng ... năm ..."`
        : `"${unit}" không nhận dạng được cấp hành chính (phường/xã/thị trấn) nên địa danh nơi ban hành dễ sai.`);
  }

  const docNo = (settings.document_number || '').trim();
  if (!docNo) {
    push('doc_number', 'Số, ký hiệu văn bản', 'FAIL',
      `Chưa đặt số hiệu. Gợi ý cho tuần ${weekNumber}: ${weekNumber}-LCT/VP.`);
  } else if (DOC_NUMBER.test(docNo)) {
    push('doc_number', 'Số, ký hiệu văn bản', 'PASS', `${docNo} đúng mẫu số - ký hiệu loại văn bản/đơn vị.`);
  } else {
    push('doc_number', 'Số, ký hiệu văn bản', 'WARN',
      `"${docNo}" lệch mẫu (VD: ${weekNumber}-LCT/VP).`);
  }

  if (!signer) {
    push('signer', 'Người ký và thẩm quyền', 'FAIL', 'Chưa nhập người ký phát hành.');
  } else if (partyBlock && stateBlock) {
    push('signer', 'Người ký và thẩm quyền', 'WARN',
      `"${signer}" lẫn cả chức danh Đảng và chính quyền — chọn một khối ký để cụm đầu văn bản đúng thể thức.`);
  } else if (isPartyDocument(settings) && stateBlock) {
    push('signer', 'Người ký và thẩm quyền', 'WARN',
      `Đơn vị ban hành là tổ chức Đảng nhưng người ký mang chức danh chính quyền — bản in sẽ ghi "ĐẢNG CỘNG SẢN VIỆT NAM" mà thiếu quốc hiệu.`);
  } else if (!isPartyDocument(settings) && partyBlock) {
    push('signer', 'Người ký và thẩm quyền', 'WARN',
      `Người ký là chức danh Đảng nhưng đơn vị ban hành là cơ quan chính quyền — bản in đang ghi quốc hiệu, tiêu ngữ.`);
  } else if (partyBlock) {
    push('signer', 'Người ký và thẩm quyền', 'PASS', `${signer} — thể thức văn bản của ĐẢNG (đầu trái ghi ĐẢNG BỘ..., không có quốc hiệu).`);
  } else if (stateBlock) {
    push('signer', 'Người ký và thẩm quyền', 'PASS', `${signer} — thể thức văn bản của CHÍNH QUYỀN (đầu phải ghi CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM).`);
  } else if (nameTokensOf(signer).length >= 2) {
    push('signer', 'Người ký và thẩm quyền', 'WARN',
      `"${signer}" có họ tên nhưng thiếu chức danh có thẩm quyền ký (Bí thư, Phó Bí thư, Chủ tịch, Phó Chủ tịch, Chủ nhiệm).`);
  } else {
    push('signer', 'Người ký và thẩm quyền', 'WARN',
      `"${signer}" chưa rõ cả họ tên lẫn chức danh người ký.`);
  }

  push('title', 'Tên loại + trích yếu', events.length ? 'PASS' : 'WARN',
    `Lịch công tác tuần ${weekNumber}${events.length ? ` · ${events.length} mục` : ' · tuần này chưa có mục nào'} (thiếu "(V/v ...)" nếu là văn bản gửi đi).`);

  const incomplete = events.filter((e) => !e.start_time || !e.location || (!e.chair && !e.participants));
  if (!events.length) {
    push('content', 'Nội dung bảng lịch', 'WARN', 'Chưa có sự kiện nào trong tuần để ban hành.');
  } else if (incomplete.length === 0) {
    push('content', 'Nội dung bảng lịch', 'PASS', `${events.length} mục đều đủ giờ, địa điểm và thành phần.`);
  } else {
    push('content', 'Nội dung bảng lịch', 'WARN',
      `${incomplete.length}/${events.length} mục còn ô trống (bản in sẽ hiện "Chưa có trong văn bản"): ${incomplete
        .slice(0, 3)
        .map((e) => `${e.start_time || '?'} ${e.title}`)
        .join('; ')}.`);
  }

  const badTime = events.filter((e) => !/^\d{2}:\d{2}$/.test(e.start_time || ''));
  push('time_format', 'Thể thức thời gian', badTime.length ? 'WARN' : 'PASS',
    badTime.length
      ? `${badTime.length} mục ghi giờ chưa chuẩn HH:MM (VD: ${badTime[0].start_time}).`
      : 'Toàn bộ giờ ghi theo định dạng 24h HH:MM.');

  const open = conflicts.filter((c) => c.status === 'OPEN');
  push('conflicts', 'Xung đột chồng lịch', open.length ? 'FAIL' : 'PASS',
    open.length ? `Còn ${open.length} xung đột mở — cần xử lý trước khi ký ban hành.` : 'Không có xung đột mở.');

  push('distribution', 'Nơi nhận và lưu', 'PASS', 'Bản in có khối "Nơi nhận" gồm cấp báo cáo, các ban ngành và Lưu VP.');

  const weight = { PASS: 1, WARN: 0.5, FAIL: 0 } as const;
  const score = Math.round((items.reduce((sum, i) => sum + weight[i.status], 0) / items.length) * 100);
  return { score, items };
}
