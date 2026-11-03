/**
 * Bộ tiện ích dùng chung làm sạch lỗi tách chữ/tách số tiếng Việt khi bóc tách OCR PDF/Word hành chính
 * (ví dụ: "D ự chào cờ" -> "Dự chào cờ", "1 4 g00 H ọp chi b ộ" -> "14:00" + "Họp chi bộ",
 * "4 giờ 00" buổi chiều -> "14:00"), nhận diện Thứ/Buổi và sắp xếp lịch theo thứ tự kéo-thả (sort_order).
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

const RE_SPLIT_DIGITS_BEFORE_UNIT = /(\d)\s+(?=\d\s*(?:g\b|g\d|h\b|h\d|giờ|[:/.]))/gi;
const RE_SPLIT_SLASH = /(\d)\s*([/])\s*(\d)/g;
const RE_SPACE_BEFORE_HG = /(\d{1,2})\s+([hg])\s*(\d{2})\b/gi;
const RE_LEADING_CTX_CLOCK = /^\s*(\d{1,2})\s*(?::|giờ|gio|g|h)\s*(\d{0,2})\b/i;
const RE_CLOCK_TOKEN = /(\d{1,2})\s*(?::|giờ|gio|g|h)\s*(\d{0,2})/i;
const RE_BARE_HOUR = /^(\d{1,2})$/;
const RE_PM_MARKER = /(buổi\s*chiều|buoi\s*chieu|\bchiều\b|\bchieu\b|buổi\s*tối|buoi\s*toi|\btối\b|\btoi\b|\bpm\b)/i;
const RE_AM_MARKER = /(buổi\s*sáng|buoi\s*sang|\bsáng\b|\bsang\b|\bam\b)/i;
const RE_LEADING_CLOCK_PREFIX = /^\s*\d{1,2}\s*(?::|giờ|gio|g|h)\s*\d{0,2}\s*[-–:]?\s*/i;
const ISO_WEEKDAY_VI = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

export function repairVietnameseSyllables(input) {
  if (!input) return '';
  let s = String(input)
    .replace(RE_SPLIT_DIGITS_BEFORE_UNIT, '$1')
    .replace(RE_SPLIT_SLASH, '$1$2$3')
    .replace(RE_SPACE_BEFORE_HG, '$1$2$3');

  for (const [pattern, replacement] of BROKEN_VIETNAMESE_PAIRS) {
    s = s.replace(pattern, replacement);
  }
  return s;
}

export const cleanOcrTextClient = repairVietnameseSyllables;

export function parseEventMinutes(evOrTime, fallbackText = '') {
  const isObj = typeof evOrTime === 'object' && evOrTime !== null;
  const rawTime = isObj
    ? String(evOrTime.start_time || evOrTime.time_slot || '')
    : String(evOrTime || '');
  const contextText = isObj
    ? `${evOrTime.title || ''} ${evOrTime.content || ''}`
    : String(fallbackText || '');

  const cleanedCtx = repairVietnameseSyllables(contextText).trim();
  const leadingCtx = RE_LEADING_CTX_CLOCK.exec(cleanedCtx);
  const cleanedRaw = repairVietnameseSyllables(rawTime).trim().replace(/(\d)\s+(?=\d)/g, '$1');
  const combined = `${cleanedRaw} ${cleanedCtx}`.toLowerCase();
  const isPM = RE_PM_MARKER.test(combined);
  const isAM = RE_AM_MARKER.test(combined);

  const m = RE_CLOCK_TOKEN.exec(cleanedRaw) || leadingCtx || RE_BARE_HOUR.exec(cleanedRaw);
  if (!m) return isPM && !isAM ? 14 * 60 : 8 * 60;

  let hour = parseInt(m[1], 10);
  const minute = m[2] ? parseInt(m[2], 10) : 0;
  if (leadingCtx && parseInt(leadingCtx[1], 10) >= 13 && hour === parseInt(leadingCtx[1], 10) % 10) {
    hour = parseInt(leadingCtx[1], 10);
  }
  if (Number.isNaN(hour) || hour > 23) return 8 * 60;
  if (isPM && hour < 12) hour += 12;
  else if (!isAM && hour >= 1 && hour <= 5) hour += 12;

  return hour * 60 + (Number.isNaN(minute) || minute > 59 ? 0 : minute);
}

export const parseSlotMinutes = parseEventMinutes;

export function isMorningEvent(evOrTime, fallbackText = '') {
  return parseEventMinutes(evOrTime, fallbackText) < 12 * 60;
}

export function isMorningSlot(item) {
  return parseEventMinutes(item?.time_slot, item?.content) < 12 * 60;
}

export function sortDayEvents(events = []) {
  return [...(events || [])].sort((a, b) => {
    const hasSortA = typeof a?.sort_order === 'number' && !Number.isNaN(a.sort_order);
    const hasSortB = typeof b?.sort_order === 'number' && !Number.isNaN(b.sort_order);
    if (hasSortA && hasSortB && a.sort_order !== b.sort_order) {
      return a.sort_order - b.sort_order;
    }
    return parseEventMinutes(a) - parseEventMinutes(b);
  });
}

export function resolveDayOfWeek(item) {
  const dateStr = String(item?.event_date || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    if (!Number.isNaN(dt.getTime())) {
      return ISO_WEEKDAY_VI[dt.getDay()];
    }
  }
  const rawDay = String(item?.day_of_week || '').trim().toLowerCase();
  if (rawDay.includes('chủ nhật') || rawDay.includes('chu nhat') || rawDay === 'cn') return 'Chủ Nhật';
  if (rawDay.includes('hai') || rawDay.includes('2')) return 'Thứ Hai';
  if (rawDay.includes('ba') || rawDay.includes('3')) return 'Thứ Ba';
  if (rawDay.includes('tư') || rawDay.includes('tu') || rawDay.includes('bốn') || rawDay.includes('4')) return 'Thứ Tư';
  if (rawDay.includes('năm') || rawDay.includes('nam') || rawDay.includes('5')) return 'Thứ Năm';
  if (rawDay.includes('sáu') || rawDay.includes('sau') || rawDay.includes('6')) return 'Thứ Sáu';
  if (rawDay.includes('bảy') || rawDay.includes('bay') || rawDay.includes('7')) return 'Thứ Bảy';
  return 'Thứ Hai';
}

export function sanitizeAgencyItemClient(item) {
  if (!item) return item;
  let content = repairVietnameseSyllables(item.content || '').trim();
  let timeSlot = repairVietnameseSyllables(item.time_slot || '').trim();
  const mins = parseEventMinutes(timeSlot, content);
  if (/^[1-5]\s*(?::|giờ|g|h)/i.test(timeSlot) && mins >= 13 * 60) {
    const h = String(Math.floor(mins / 60)).padStart(2, '0');
    const m = String(mins % 60).padStart(2, '0');
    timeSlot = `${h} giờ ${m}`;
  }
  content = content.replace(RE_LEADING_CLOCK_PREFIX, '').trim();
  return {
    ...item,
    time_slot: timeSlot,
    content,
    executor: repairVietnameseSyllables(item.executor || ''),
    attendees: repairVietnameseSyllables(item.attendees || ''),
    location: repairVietnameseSyllables(item.location || ''),
  };
}

export function normalizeTime24h(rawTime, contextText = '') {
  if (!rawTime && !contextText) return null;
  const cleanedRaw = repairVietnameseSyllables(String(rawTime || '')).trim().replace(/(\d)\s+(?=\d)/g, '$1');
  const cleanedCtx = repairVietnameseSyllables(String(contextText || '')).trim();
  const leadingCtx = RE_LEADING_CTX_CLOCK.exec(cleanedCtx);

  const m = RE_CLOCK_TOKEN.exec(cleanedRaw) || leadingCtx || RE_BARE_HOUR.exec(cleanedRaw);
  if (!m) return null;

  const mins = parseEventMinutes(rawTime, contextText);
  const hour = Math.floor(mins / 60);
  const minute = mins % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function normalizeAdminTimeDisplay(rawTime, contextText = '') {
  const norm = normalizeTime24h(rawTime, contextText);
  if (!norm) return repairVietnameseSyllables(String(rawTime || '')).trim();
  return `${norm.slice(0, 2)} giờ ${norm.slice(3, 5)}`;
}

export function stripLeadingClockPrefix(text) {
  if (!text) return '';
  return repairVietnameseSyllables(text)
    .replace(RE_LEADING_CLOCK_PREFIX, '')
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
    return parseEventMinutes(a) - parseEventMinutes(b);
  });
}
