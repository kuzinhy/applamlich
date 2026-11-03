/**
 * Bộ tiện ích làm sạch lỗi tách chữ/tách số tiếng Việt khi bóc tách OCR PDF/Word hành chính
 * (ví dụ: "D ự chào cờ" -> "Dự chào cờ", "1 4 g00 H ọp chi b ộ" -> "14:00" + "Họp chi bộ",
 * "4 giờ 00" buổi chiều -> "14:00") và sắp xếp lịch theo thứ tự kéo-thả (sort_order).
 */

const BROKEN_VIETNAMESE_PAIRS = [
  [/\bD\s+ự\b/g, 'Dự'],
  [/\bd\s+ự\b/g, 'dự'],
  [/\bC\s+hủ\b/g, 'Chủ'],
  [/\bc\s+hủ\b/g, 'chủ'],
  [/\bH\s+ọp\b/g, 'Họp'],
  [/\bh\s+ọp\b/g, 'họp'],
  [/\bH\s+ội\b/g, 'Hội'],
  [/\bh\s+ội\b/g, 'hội'],
  [/\bNgh\s+ị\b/g, 'Nghị'],
  [/\bngh\s+ị\b/g, 'nghị'],
  [/\bChi\s+b\s+ộ\b/g, 'Chi bộ'],
  [/\bchi\s+b\s+ộ\b/gi, 'chi bộ'],
  [/\bb\s+ộ\b/g, 'bộ'],
  [/\bX\s+ây\s+d\s+ựng\s+Đ\s+ảng\b/g, 'Xây dựng Đảng'],
  [/\bX\s+ây\b/g, 'Xây'],
  [/\bx\s+ây\b/g, 'xây'],
  [/\bd\s+ựng\b/g, 'dựng'],
  [/\bĐ\s+ảng\b/g, 'Đảng'],
  [/\bđ\s+ảng\b/g, 'đảng'],
  [/\bPh\s+òng\b/g, 'Phòng'],
  [/\bph\s+òng\b/g, 'phòng'],
  [/\bTr\s+ưởng\b/g, 'Trưởng'],
  [/\btr\s+ưởng\b/g, 'trưởng'],
  [/\bPh\s+ó\b/g, 'Phó'],
  [/\bph\s+ó\b/g, 'phó'],
  [/\bTh\s+ường\b/g, 'Thường'],
  [/\bth\s+ường\b/g, 'thường'],
  [/\bTr\s+ực\b/g, 'Trực'],
  [/\btr\s+ực\b/g, 'trực'],
  [/\bv\s+ụ\b/g, 'vụ'],
  [/\bN\s+gh\s+ĩa\b/g, 'Nghĩa'],
  [/\bchu\s+ẩn\s+b\s+ị\b/gi, 'chuẩn bị'],
  [/\bn\s+ội\s+dung\b/gi, 'nội dung'],
  [/\bth\s+ành\s+ph\s+ần\b/gi, 'thành phần'],
  [/\bĐ\s+ịa\s+đ\s+iểm\b/g, 'Địa điểm'],
  [/\bđ\s+ịa\s+đ\s+iểm\b/gi, 'địa điểm'],
];

export function repairVietnameseSyllables(input) {
  if (!input) return '';
  let s = String(input)
    .replace(/(\d)\s+(?=\d\s*(?:g\b|g\d|h\b|h\d|giờ|[:/.]))/gi, '$1')
    .replace(/(\d)\s*([/])\s*(\d)/g, '$1$2$3')
    .replace(/(\d{1,2})\s+([hg])\s*(\d{2})\b/gi, '$1$2$3');

  for (const [pattern, replacement] of BROKEN_VIETNAMESE_PAIRS) {
    s = s.replace(pattern, replacement);
  }
  return s;
}

export function normalizeTime24h(rawTime, contextText = '') {
  if (!rawTime && !contextText) return null;
  const cleanedRaw = repairVietnameseSyllables(String(rawTime || '')).trim().replace(/(\d)\s+(?=\d)/g, '$1');
  const cleanedCtx = repairVietnameseSyllables(String(contextText || '')).trim();
  const leadingCtx = /^\s*(\d{1,2})\s*(?::|giờ|gio|g|h)\s*(\d{0,2})\b/i.exec(cleanedCtx);

  const combined = `${cleanedRaw} ${cleanedCtx}`.toLowerCase();
  const isPM = /(buổi\s*chiều|buoi\s*chieu|\bchiều\b|\bchieu\b|buổi\s*tối|buoi\s*toi|\btối\b|\btoi\b|\bpm\b)/i.test(combined);
  const isAM = /(buổi\s*sáng|buoi\s*sang|\bsáng\b|\bsang\b|\bam\b)/i.test(combined);

  const m = /(\d{1,2})\s*(?::|giờ|gio|g|h)\s*(\d{0,2})/i.exec(cleanedRaw)
    || leadingCtx
    || /^(\d{1,2})$/.exec(cleanedRaw);
  if (!m) return null;

  let hour = parseInt(m[1], 10);
  const minute = m[2] ? parseInt(m[2], 10) : 0;
  if (leadingCtx && parseInt(leadingCtx[1], 10) >= 13 && hour === parseInt(leadingCtx[1], 10) % 10) {
    hour = parseInt(leadingCtx[1], 10);
  }
  if (Number.isNaN(hour) || hour > 23 || minute > 59) return null;

  if (isPM && hour < 12) {
    hour += 12;
  } else if (!isAM && hour >= 1 && hour <= 5) {
    // Giờ hành chính: 1h..5h không ghi "sáng" là buổi chiều (13:00..17:00)
    hour += 12;
  }

  return `${String(hour).padStart(2, '0')}:${String(Number.isNaN(minute) ? 0 : minute).padStart(2, '0')}`;
}

export function normalizeAdminTimeDisplay(rawTime, contextText = '') {
  const norm = normalizeTime24h(rawTime, contextText);
  if (!norm) return repairVietnameseSyllables(String(rawTime || '')).trim();
  return `${norm.slice(0, 2)} giờ ${norm.slice(3, 5)}`;
}

export function stripLeadingClockPrefix(text) {
  if (!text) return '';
  return repairVietnameseSyllables(text)
    .replace(/^\s*\d{1,2}\s*(?::|giờ|gio|g|h)\s*\d{0,2}\s*[-–:]?\s*/i, '')
    .trim();
}

export function cleanScheduleItemFields(item) {
  if (!item || typeof item !== 'object') return item;
  const rawTitle = repairVietnameseSyllables(item.title || '');
  const rawContent = repairVietnameseSyllables(item.content || '');
  const context = `${rawTitle} ${rawContent}`;
  const startTime = normalizeTime24h(item.start_time, context) || item.start_time;
  const endTime = item.end_time ? (normalizeTime24h(item.end_time, context) || item.end_time) : item.end_time;

  return {
    ...item,
    title: stripLeadingClockPrefix(rawTitle) || rawTitle,
    content: stripLeadingClockPrefix(rawContent) || rawContent,
    start_time: startTime,
    end_time: endTime,
    chair: repairVietnameseSyllables(item.chair || ''),
    executor: repairVietnameseSyllables(item.executor || ''),
    participants: repairVietnameseSyllables(item.participants || ''),
    participant_group: repairVietnameseSyllables(item.participant_group || ''),
    attendees: repairVietnameseSyllables(item.attendees || ''),
    location: repairVietnameseSyllables(item.location || ''),
    preparation: repairVietnameseSyllables(item.preparation || ''),
  };
}

export function sortEventsByTimeAndOrder(events = []) {
  return [...events].sort((a, b) => {
    const dateCmp = String(a?.event_date || '').localeCompare(String(b?.event_date || ''));
    if (dateCmp !== 0) return dateCmp;
    if (typeof a?.sort_order === 'number' && typeof b?.sort_order === 'number' && a.sort_order !== b.sort_order) {
      return a.sort_order - b.sort_order;
    }
    return String(a?.start_time || '').localeCompare(String(b?.start_time || ''));
  });
}
