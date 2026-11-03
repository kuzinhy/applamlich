import type { EventRecord } from '../types.ts';

/**
 * Làm sạch lỗi tách chữ/tách số phổ biến khi đọc PDF hành chính tiếng Việt
 * (ví dụ: "1 4 g00" -> "14g00", "0 8 /1 1 /2026" -> "08/11/2026", "H ọp chi b ộ" -> "Họp chi bộ", "C hủ trì" -> "Chủ trì").
 */
export function cleanVietnameseOcrText(input: string): string {
  if (!input) return '';
  let s = String(input)
    .replace(/(\d)\s+(?=\d\s*(?:g\b|g\d|h\b|h\d|giờ|[:/.]))/gi, '$1')
    .replace(/(\d)\s*([/])\s*(\d)/g, '$1$2$3')
    .replace(/(\d)\s+(?=\d[/]\d)/g, '$1')
    .replace(/(\d{1,2})\s+([hg])\s*(\d{2})\b/gi, '$1$2$3');

  const brokenWordPairs: Array<[RegExp, string]> = [
    [/\bD\s+ự\b/g, 'Dự'],
    [/\bd\s+ự\b/g, 'dự'],
    [/\bC\s+hủ\b/g, 'Chủ'],
    [/\bc\s+hủ\b/g, 'chủ'],
    [/\bH\s+ọp\b/g, 'Họp'],
    [/\bh\s+ọp\b/g, 'họp'],
    [/\bh\s+ội\b/g, 'hội'],
    [/\bH\s+ội\b/g, 'Hội'],
    [/\bngh\s+ị\b/g, 'nghị'],
    [/\bNgh\s+ị\b/g, 'Nghị'],
    [/\bchi\s+b\s+ộ\b/gi, 'chi bộ'],
    [/\bChi\s+b\s+ộ\b/g, 'Chi bộ'],
    [/\bb\s+ộ\b/g, 'bộ'],
    [/\bX\s+ây\s+d\s+ựng\s+Đ\s+ảng\b/g, 'Xây dựng Đảng'],
    [/\bX\s+ây\b/g, 'Xây'],
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
    [/\btr\s+ực\b/g, 'trực'],
    [/\bTr\s+ực\b/g, 'Trực'],
    [/\bv\s+ụ\b/g, 'vụ'],
    [/\bN\s+gh\s+ĩa\b/g, 'Nghĩa'],
    [/\bchu\s+ẩn\s+b\s+ị\b/gi, 'chuẩn bị'],
    [/\bn\s+ội\s+dung\b/gi, 'nội dung'],
    [/\bth\s+ành\s+ph\s+ần\b/gi, 'thành phần'],
    [/\bđ\s+ịa\s+đ\s+iểm\b/gi, 'địa điểm'],
    [/\bĐ\s+ịa\s+đ\s+iểm\b/g, 'Địa điểm'],
    [/\bT\s+ủ\b/g, 'Tủ'],
  ];
  for (const [pattern, replacement] of brokenWordPairs) {
    s = s.replace(pattern, replacement);
  }
  return s;
}

/**
 * Chuẩn hóa chuỗi giờ tiếng Việt ("8h30", "08:30", "7g15", "1 4 g00", "14 giờ 00", "2h chiều")
 * -> số phút sau nửa đêm (0..1439); null nếu không parse được.
 */
export function parseClock(value: string | null | undefined, context = ''): number | null {
  if (!value && !context) return null;
  const cleanedContext = cleanVietnameseOcrText(context || '');
  // Nếu đầu câu context có cụm giờ đầy đủ (vd "14g00 Họp chi bộ") trong khi value bị cụt ("4 giờ 00"), ưu tiên lấy giờ từ context
  const leadingCtxTime = /^\s*(\d{1,2})\s*(?:[:hg]|giờ)\s*(\d{0,2})\b/i.exec(cleanedContext);
  const raw = String(value || '')
    .replace(/(\d)\s+(?=\d)/g, '$1')
    .trim();
  const combined = `${raw} ${cleanedContext}`.toLowerCase();
  const isExplicitPM = /(buổi\s*chiều|\bchiều\b|buổi\s*tối|\btối\b|\bpm\b)/i.test(combined);
  const isExplicitAM = /(buổi\s*sáng|\bsáng\b|\bam\b)/i.test(combined);

  const m = /(\d{1,2})\s*(?:[:hg]|giờ)\s*(\d{0,2})/i.exec(raw) || leadingCtxTime;
  // Không có chữ số giờ nào thì trả null: "sáng"/"chiều" chỉ xác định phiên làm việc, không xác định giờ cụ thể.
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (leadingCtxTime && Number(leadingCtxTime[1]) >= 13 && h === Number(leadingCtxTime[1]) % 10) {
    h = Number(leadingCtxTime[1]);
  }
  if (h > 23 || min > 59) return null;

  // Giờ hành chính Việt Nam: 1g..5g (01:00..05:59) không ghi "sáng" luôn là 13:00..17:59 (buổi chiều)
  if (isExplicitPM && h < 12) {
    h += 12;
  } else if (!isExplicitAM && h >= 1 && h <= 5) {
    h += 12;
  }
  return h * 60 + min;
}

export function sessionOfClock(value: string | null | undefined, context = ''): 'MORNING' | 'AFTERNOON' {
  const mins = parseClock(value, context);
  if (mins !== null) return mins < 12 * 60 ? 'MORNING' : 'AFTERNOON';
  const combined = `${value || ''} ${context}`.toLowerCase();
  if (/(buổi\s*chiều|\bchiều\b|buổi\s*tối|\btối\b|\bpm\b)/i.test(combined)) return 'AFTERNOON';
  return 'MORNING';
}

/**
 * Giờ dùng riêng cho việc SẮP XẾP: đọc giờ thật, nếu văn bản chỉ ghi phiên ("sáng", "chiều")
 * thì đặt vào đầu phiên đó. Không dùng hàm này để ghi dữ liệu vì giá trị chỉ là xấp xỉ.
 */
export function approximateClock(value: string | null | undefined, context = ''): number {
  const mins = parseClock(value, context);
  if (mins !== null) return mins;
  return sessionOfClock(value, context) === 'MORNING' ? 7 * 60 : 14 * 60;
}

export function formatClock(minutes: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, minutes));
  const h = String(Math.floor(clamped / 60)).padStart(2, '0');
  const m = String(clamped % 60).padStart(2, '0');
  return `${h}:${m}`;
}

/** Thời lượng sự kiện, mặc định 90 phút khi thiếu giờ kết thúc. */
export function durationOf(event: EventRecord): number {
  const start = parseClock(event.start_time, `${event.title || ''} ${event.content || ''}`);
  const end = parseClock(event.end_time);
  if (start === null) return 90;
  if (end === null || end <= start) return 90;
  return end - start;
}

/** Hai khối thời gian có chồng nhau không; giờ không đọc được thì coi như không chồng. */
export function timesOverlap(
  aStart: string | null | undefined,
  aEnd: string | null | undefined,
  bStart: string | null | undefined,
  bEnd: string | null | undefined,
): boolean {
  const block = (start: string | null | undefined, end: string | null | undefined) => {
    const from = parseClock(start);
    if (from === null) return null;
    const to = parseClock(end);
    return { from, to: to !== null && to > from ? to : from + 90 };
  };
  const one = block(aStart, aEnd);
  const two = block(bStart, bEnd);
  if (!one || !two) return false;
  return one.from < two.to && two.from < one.to;
}

