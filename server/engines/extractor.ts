import { newId, extractLeaders } from '../store.ts';
import { foldVietnamese } from '../services/merge.ts';
import {
  canonicalPersonName,
  detectPartySignals,
  mainDangUyForm,
  matchDangUyForms,
  matchPeople,
  type RosterPerson,
  type SignalLevel,
} from './party_signals.ts';
import { scorePriority } from './priority.ts';
import { extractPreparation } from './preparation.ts';
import { orgProfilePrompt } from './attendance.ts';
import { askJson, AIUnavailableError } from './gemini.ts';
import { searchEventsByQuery } from './retrieval.ts';
import { CalendarEventSchema } from '../schemas/calendar.ts';
import type { EventRecord, SettingsRecord } from '../types.ts';

// Cụm chỉ thứ trong tuần: tiếng Việt dùng "Tư", "Hai", "Ba", "Năm", "Sáu", "Bảy", "Chủ nhật", "CN", "2", "3", "4", "5", "6", "7".
const WEEKDAY_NAMES = '(?:thứ\\s+(?:hai|ba|t\\u01b0|tu|n\\u0103m|nam|s\\u00e1u|sau|b\\u1ea3y|bay|2|3|4|5|6|7)|ch\\u1ee7\\s+nh\\u1eadt|ch\\u1ee7\\s*nhat|chu\\s+nh\\u1eadt|cn)';
const WEEKDAY_FOLDED_FULL = '(?:chunhat|chu-nhat|hai|ba|tu|bon|nam|sau|bay|cn|2|3|4|5|6|7)';
// Một token giờ: 8:00 | 8h | 8g | 8h30 | 8g30 | 8 giờ 30 | 1 4 g00
const TIME_TOKEN = '\\d{1,2}(?:\\s*\\d)?(?:[.:]\\d{2}|\\s*[hg]\\s*\\d{2}|\\s*[hg](?![\\w])|\\s*giờ\\s*\\d{2}|\\s*giờ(?![\\w]))';

/**
 * Làm sạch lỗi tách chữ/tách số phổ biến khi đọc PDF hành chính tiếng Việt
 * (ví dụ: "1 4 g00" -> "14g00", "0 8 /1 1 /2026" -> "08/11/2026", "H ọp chi b ộ" -> "Họp chi bộ").
 */
export function cleanPdfSpacing(input: string): string {
  if (!input) return '';
  let s = String(input)
    // Gộp chữ số bị PDF chèn khoảng trắng trước ký hiệu giờ/ngày: "1 4 g00" -> "14g00", "0 8 / 1 1" -> "08/11"
    .replace(/(\d)\s+(?=\d\s*(?:g\b|g\d|h\b|h\d|giờ|[:/.]))/gi, '$1')
    .replace(/(\d)\s*([/])\s*(\d)/g, '$1$2$3')
    .replace(/(\d)\s+(?=\d[/]\d)/g, '$1')
    .replace(/(\d{1,2})\s+([hg])\s*(\d{2})\b/gi, '$1$2$3');

  // Sửa các từ tiếng Việt bị tách âm tiết do kerning PDF
  const brokenWordPairs: Array<[RegExp, string]> = [
    [/\bD\s+ự\b/g, 'Dự'],
    [/\bd\s+ự\b/g, 'dự'],
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

/** "8h30", "8g30", "8 giờ 30", "13:00", "1 4 g00", "2h chiều" -> "HH:MM"; null nếu không đọc được. */
export function normalizeTime(raw: string | null | undefined, context = ''): string | null {
  if (!raw) return null;
  const rawStr = cleanPdfSpacing(String(raw).trim());
  if (!rawStr) return null;

  const ctx = `${rawStr} ${context}`.toLowerCase();
  const isPM = /(buổi\s*chiều|buoi\s*chieu|\bchiều\b|\bchieu\b|buổi\s*tối|buoi\s*toi|\btối\b|\btoi\b|\bpm\b)/.test(ctx);
  const isAM = /(buổi\s*sáng|buoi\s*sang|\bsáng\b|\bsang\b|\bam\b)/.test(ctx);

  const collapsed = rawStr.toLowerCase()
    .replace(/\u00a0/g, ' ')
    .replace(/(\d)\s+(?=\d)/g, '$1');

  const m = /(?:^|[^\d])(\d{1,2})\s*(?:giờ|gio|g|h|:)\s*(\d{0,2})(?!\d)/i.exec(collapsed)
    || /^(\d{1,2}):?(\d{0,2})$/.exec(collapsed.replace(/\s+/g, ''));
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  if (hour > 23 || minute > 59) return null;
  if (isPM && hour < 12) {
    hour += 12;
  } else if (!isAM && hour >= 1 && hour <= 5) {
    // Giờ hành chính Việt Nam: 1h–5h không ghi "sáng" là 13:00–17:00 (buổi chiều)
    hour += 12;
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** Đọc "24/10", "ngày 24/10/2026", "26 tháng 10 năm 2026", "2026-10-24" trong văn bản. */
export function extractDate(text: string, defaultYear: number): string | null {
  if (!text) return null;
  const cleaned = cleanPdfSpacing(text);
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(cleaned);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const thang = /(?:thứ\s+[^\s,]+[\s,]*)?(?:ngày\s+)?(\d{1,2})\s+tháng\s+(\d{1,2})(?:\s+(?:năm\s+)?(\d{4}))?/i.exec(cleaned);
  if (thang) {
    const day = Number(thang[1]);
    const month = Number(thang[2]);
    const year = thang[3] ? Number(thang[3]) : defaultYear;
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  const slash = new RegExp(`(?:${WEEKDAY_NAMES}[\\s,()\\-.]*)?(?:ngày\\s+)?(\\d{1,2})[/.\\-](\\d{1,2})(?:[/.\\-](\\d{4}))?`, 'i').exec(cleaned);
  if (slash) {
    const day = Number(slash[1]);
    const month = Number(slash[2]);
    const year = slash[3] ? Number(slash[3]) : defaultYear;
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  return null;
}

/** Nhãn ngắn của một mục do AI trả về, dùng khi báo lý do loại. */
function labelOfItem(item: Record<string, any>): string {
  const title = cleanPdfSpacing(String(item?.title || '').trim());
  if (title) return title.slice(0, 90);
  const content = cleanPdfSpacing(String(item?.content || '').trim());
  return content ? content.slice(0, 90) : '(không tiêu đề)';
}

/** Chẩn hoá một phần tử AI trả về thành đúng schema bảng events.
 * @param diagnostics nếu mục bị loại, `diagnostics.reason` nhận LÝ DO cụ thể để báo cho cán bộ.
 */
export function coerceAiEvent(
  item: Record<string, any>,
  ctx: { source_doc: string; source_id: string | null; source_priority: number; week_start: string },
  diagnostics?: { reason?: string }
): EventRecord | null {
  const reject = (reason: string) => {
    if (diagnostics) diagnostics.reason = reason;
    return null;
  };

  if (!item || typeof item !== 'object') return reject('Mục AI trả về không đúng dạng, không đọc được.');
  const title = cleanPdfSpacing(String(item.title || '').trim());
  const content = cleanPdfSpacing(String(item.content || '').trim());

  // Chỉ bỏ khi cả tiêu đề lẫn nội dung đều rỗng: tiêu đề ngắn ("Họp", "Trực") là lịch thật.
  if (!title && !content) return reject('Mục rỗng: AI không nêu tiêu đề lẫn nội dung công việc.');

  const missing: string[] = [];
  const rawDate = String(item.event_date || '').trim();

  let eventDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : '';
  if (!eventDate) {
    eventDate = extractDate(`${title} ${content}`, Number(ctx.week_start.slice(0, 4))) || '';
  }
  if (!eventDate) {
    // Văn bản có thật nhưng quên ghi ngày: giữ mục, tạm đặt vào đầu tuần và báo thiếu để cán bộ sửa.
    eventDate = ctx.week_start;
    missing.push('event_date');
  }

  const timeContext = `${title} ${content}`;
  let start = normalizeTime(item.start_time || '', timeContext);
  if (!start) start = normalizeTime((new RegExp(`(${TIME_TOKEN})`, 'i').exec(timeContext) || [])[1], timeContext);
  if (!start) missing.push('start_time');

  let end = normalizeTime(item.end_time || '', timeContext);
  if (!end) missing.push('end_time');

  const chair = cleanPdfSpacing(String(item.chair || '').trim());
  if (!chair) missing.push('chair');
  let location = cleanPdfSpacing(String(item.location || '').trim());
  if (!location) {
    location = 'Chưa xác định (cần kiểm tra)';
    missing.push('location');
  }

  const confidence = Number.isFinite(Number(item.confidence)) ? Number(item.confidence) : 0.9;
  const now = new Date().toISOString();

  return {
    id: newId('ev'),
    source_id: ctx.source_id ?? null,
    source_document: ctx.source_doc,
    source_page: item.source_page ? Number(item.source_page) : null,
    source_paragraph: item.source_paragraph ? Number(item.source_paragraph) : null,
    event_date: eventDate,
    start_time: start ?? '',
    end_time: end || null,
    title: title || content.slice(0, 80),
    content: content || title,
    chair,
    participants: cleanPdfSpacing(String(item.participants || '').trim()),
    participant_group: cleanPdfSpacing(String(item.participant_group || '').trim()),
    location,
    organizer: cleanPdfSpacing(String(item.organizer || '').trim()),
    preparation: cleanPdfSpacing(String(item.preparation || '').trim()) || extractPreparation(`${title} ${content}`) || '',
    documents_required: cleanPdfSpacing(String(item.documents_required || '').trim()),
    contact_person: cleanPdfSpacing(String(item.contact_person || '').trim()),
    priority_score: scorePriority({
      source_priority: ctx.source_priority,
      title,
      content,
      chair,
      participants: String(item.participants || ''),
    }),
    confidence: Math.max(0, Math.min(1, confidence)),
    status: 'PROPOSED',
    missing_data_fields: [...new Set(missing)],
    leaders: extractLeaders(chair, String(item.participants || '')),
    also_from: [],
    tasks: [],
    series_id: null,
    is_supplemental: Boolean(item.is_supplemental),
    supplemental_note: String(item.supplemental_note || ''),
    created_at: now,
    updated_at: now,
  };
}

const EXTRACT_SYSTEM = `
Bạn là chuyên gia bóc tách văn bản hành chính của Văn phòng Đảng ủy và UBND cấp phường.
Nhiệm vụ: đọc nội dung văn bản/thư mời, trích xuất TẤT CẢ lịch công tác có thật trong văn bản.

QUY TẮC BẮT BUỘC:
1. TRẢ VỀ JSON KHÔNG KÈM GIẢI THÍCH NÀO KHÁC.
2. Mọi sự kiện KHÔNG CÓ TRONG VĂN BẢN không được phép bịa đặt.
3. Nếu thiếu ngày hoặc giờ, hãy ghi chú rõ trong trường "reasoning" thay vì đoán mò.
4. "event_date" phải định dạng YYYY-MM-DD.
5. "start_time" phải định dạng HH:MM (24h). Lưu ý phân biệt rõ Buổi sáng (07:00-11:59) và Buổi chiều (13:00-17:59, ví dụ 14g00 hoặc 2h chiều là 14:00).

Định dạng JSON:
{
  "events": [
    {
      "title": "...",
      "content": "...",
      "event_date": "YYYY-MM-DD",
      "start_time": "HH:MM",
      "end_time": "HH:MM",
      "chair": "...",
      "participants": "...",
      "location": "...",
      "confidence": 0.0-1.0,
      "reasoning": "Tại sao trích xuất thế này hoặc lý do thiếu thông tin"
    }
  ]
}
`.trim();

export interface ExtractResult {
  events: EventRecord[];
  rejected: { title: string; reason: string }[];
}

/** Nhãn mục trong lịch tuần; dùng để cắt phần còn lại khi OCR dồn hết một dòng. */
const SECTION_LABELS = '(?:địa\\s*điểm|thành\\s*phần|nội\\s*dung|chủ\\s*trì|thời\\s*gian|cùng\\s*dự|kính\\s*mời|điểm\\s*cầu)';

/**
 * Giờ trong một dòng tiêu đề: hỗ trợ "07g30", "08 giờ 00", "14h00", "1 4 g00", "(08h00)", "7:30".
 * Đọc theo cả từ ngữ buổi (sáng/chiều/tối) để chuyển 24h.
 */
export function extractHeadingTime(line: string, period = ''): string | null {
  if (!line) return null;
  const cleanedLine = cleanPdfSpacing(line);
  const ctxFolded = foldVietnamese(`${cleanedLine} ${period}`);
  const isPM = /(\bchieu\b|\btoi\b|\bpm\b|buoi\s*chieu|buoi\s*toi)/i.test(ctxFolded);
  const isAM = /(\bsang\b|\bam\b|buoi\s*sang)/i.test(ctxFolded);

  const spans = [
    ...Array.from(cleanedLine.matchAll(/\(([^()\n]{1,32})\)/g)).map((m) => m[1]),
    cleanedLine.slice(0, 65),
  ];

  for (const span of spans) {
    // Gộp chữ số bị tách rời ("1 4 g00" -> "14 g00") nhưng giữ khoảng trắng với chữ phía sau
    const normSpan = foldVietnamese(span).replace(/(\d)\s+(?=\d)/g, '$1');
    const m = /(?:^|[^\d/.-])(\d{1,2})\s*(?:gio|g|h|:)\s*(\d{0,2})(?!\d)/i.exec(normSpan);
    if (m) {
      let hour = Number(m[1]);
      const minute = m[2] ? Number(m[2]) : 0;
      if (hour <= 23 && minute <= 59) {
        if (isPM && hour < 12) hour += 12;
        else if (!isAM && hour >= 1 && hour <= 5) hour += 12;
        return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      }
    }
  }

  return null;
}

/** Dòng đầu mục lịch tuần: số thứ tự, dấu đầu dòng, mốc "Sáng:/Chiều:/Tối:" hoặc tên thứ. */
function isHeadingLine(line: string): boolean {
  const folded = foldVietnamese(line).replace(/^[\s*•\-–+]+/, '');
  if (/^\d+\s*\.\s*\d+\s*\./.test(folded)) return false;
  return /^\d/.test(folded)
    || /^(sang|chieu|toi|buoi)\b/i.test(folded)
    || new RegExp(`^thu\\s*${WEEKDAY_FOLDED_FULL}\\b`, 'i').test(folded)
    || /^(?:t2|t3|t4|t5|t6|t7|cn)\b/i.test(folded)
    || /^[a-z]\s*[\).]/i.test(folded)
    || /^(?:i|ii|iii|iv|v|vi|vii|viii|ix|x)\b/i.test(folded);
}

/** Mốc buổi trong lịch tuần; nguồn thường chỉ ghi "8 giờ" nên cần Sáng/Chiều/Tối để suy 24h. */
export function headingPeriod(line: string): string {
  const folded = foldVietnamese(line).replace(/^[\s*•\-–+]+/, '');
  if (/^(chieu|buoi\s*chieu)\b/i.test(folded)) return 'chiều';
  if (/^(sang|buoi\s*sang)\b/i.test(folded)) return 'sáng';
  if (/^(toi|buoi\s*toi)\b/i.test(folded)) return 'tối';
  return '';
}

/**
 * Ngày của một khối trong lịch tuần: "Thứ Hai 26/10", "THỨ BA, NGÀY 03/11/2026", "Thứ 2 (26/10)".
 * Không nhận nhầm ngày trích dẫn văn bản ("...ngày 22 tháng 8 năm 2026 của Bộ Chính trị...", "...kỳ họp lần thứ bảy...").
 */
export function extractHeadingDate(line: string, defaultYear: number): string | null {
  if (!line) return null;
  const cleaned = cleanPdfSpacing(line).trim();
  const folded = foldVietnamese(cleaned)
    .replace(/(\d)\s+(?=\d)/g, '$1')
    .replace(/\s*([/])\s*/g, '$1')
    .replace(/^[\s*•\-–+.]+/, '');

  // Loại trừ các câu văn trích dẫn nghị quyết/tờ trình ("...của Bộ Chính trị", "...kỳ họp lần thứ...", "...ban hành ngày...")
  if (/(?:cua\s+bo\s+chinh\s+tri|ky\s+hop\s+lan\s+thu|to\s+trinh\s+so|nghi\s+quyet\s+so|ke\s+hoach\s+so|cong\s+van\s+so|quyet\s+dinh\s+so)/i.test(folded)) {
    return null;
  }

  // 1. Dòng BẮT ĐẦU bằng tên Thứ (Thứ hai, thứ 2, thứ 3, Chủ nhật, CN, T2..T7) kèm ngày
  const startsWithWeekday = /^(?:thu\s*(?:hai|ba|tu|bon|nam|sau|bay|2|3|4|5|6|7)|chu\s*nhat|cn|t[2-7])\b/i.test(folded);
  if (startsWithWeekday) {
    const mThang = /(\d{1,2})\s*thang\s*(\d{1,2})(?:\s*nam\s*(\d{4}))?/i.exec(folded);
    if (mThang) {
      const day = Number(mThang[1]);
      const month = Number(mThang[2]);
      const year = mThang[3] ? Number(mThang[3]) : defaultYear;
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
    const mSlash = /(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{4}))?/i.exec(folded);
    if (mSlash) {
      const day = Number(mSlash[1]);
      const month = Number(mSlash[2]);
      const year = mSlash[3] ? Number(mSlash[3]) : defaultYear;
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
  }

  // 2. Dòng tiêu đề ngắn bắt đầu bằng "Ngày DD/MM/YYYY" (không phải dòng văn bản gãy câu)
  if (/^(?:Ngày|NGÀY)\s+\d{1,2}(?:[/.\-]\d{1,2}|\s+tháng\s+\d{1,2})/u.test(cleaned) && cleaned.length <= 48) {
    return extractDate(cleaned, defaultYear);
  }

  // 3. Dòng chỉ gồm ngày độc lập
  if (/^[\s*•\-–+.]*(?:ngày\s*)?(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{4}))?[\s:]*$/i.test(cleaned)) {
    return extractDate(cleaned, defaultYear);
  }

  return null;
}

/** Bỏ số thứ tự, mốc buổi và cụm giờ trong ngoặc, giữ lại tên hoạt động. */
const HEADING_PREFIXES: RegExp[] = [
  /^[\s*•\-–.]*(?:\d{1,2}\s*[.)\-–]\s*)+/,
  // "Chiều" có ê + thanh hỏi (U+1EC1); nguồn OCR mất dấu có thể ra "chieu".
  /^(?:buổi\s*)?(?:s[áa]ng|chi[ềeê]u|chieu|t[ốo]i)\s*[:.\-–]?\s*/i,
];

export function stripHeadingTimePrefix(line: string): string {
  const paren = /^\(\s*[^()\n]{1,32}\)\s*[:.\-–]?\s*/;
  const bareTime = /^(?:từ\s*)?\d{1,2}(?:\s*\d)?\s*(?:gi\s*[òoờ]\s*\d{0,2}|[hg:]\s*[:.]?\s*\d{0,2})\s*[:.\-–]?\s*/i;
  let out = cleanPdfSpacing(line).trim();
  for (let step = 0; step < 5; step += 1) {
    const before = out;
    out = out.replace(HEADING_PREFIXES[0], '').replace(HEADING_PREFIXES[1], '').trim();
    const inParen = paren.exec(out);
    if (inParen && extractHeadingTime(inParen[0])) out = out.slice(inParen[0].length).trim();
    const bare = bareTime.exec(out);
    if (bare && extractHeadingTime(bare[0])) out = out.slice(bare[0].length).trim();
    if (out === before) break;
  }
  return out;
}

/**
 * Nội dung một mục "- Thành phần: ...", "- Địa điểm: ...", tính cả các dòng OCR nối tiếp.
 * Dừng khi gặp gạch đầu dòng khác hoặc nhãn mục kế tiếp (nguồn một dòng).
 */
export function pickSection(lines: string[], keyword: RegExp): string {
  const joined = lines.join('\n');
  const re = new RegExp(
    `(?:^|\\n)[\\s*•\\-–+]*(?:${keyword.source})[^:\\n]{0,40}:?\\s*([\\s\\S]+?)(?=\\n[\\s*•]*[-+•]|\\n\\d|[\\s-](?:${SECTION_LABELS})\\s*[:.]|$)`,
    keyword.flags.includes('i') ? 'i' : '',
  );
  const m = re.exec(joined);
  if (!m) return '';
  return m[1].replace(/\s+/g, ' ').replace(/[;.\s]+$/, '').trim();
}

/**
 * Tên hoạt động: OCR thường cắt một câu thành nhiều dòng ("…Hội nghị trực tuyến quán" /
 * "triệt và triển khai…"). Nối các dòng gãy cho tới khi hết câu, gặp nhãn mục
 * (Thành phần/Địa điểm…) hoặc mục đánh số kế tiếp.
 */
export function composeHeadingTitle(lines: string[]): string {
  if (!lines.length) return '';
  let title = stripHeadingTimePrefix(lines[0]).replace(/[:.\-–\s]+$/, '');
  for (let i = 1; i < lines.length && i <= 4 && title.length < 180; i += 1) {
    const prevTrimmed = lines[i - 1].trim();
    if (!prevTrimmed || /[.;:!?]$/.test(prevTrimmed)) break;
    const next = cleanPdfSpacing(lines[i]).trim();
    if (!next || /^\d{1,3}$/.test(next)) break;
    if (/^[\s*•\-–]*\d{1,2}\s*[.)\-–]/.test(next)) break;
    if (/^[-+•]/.test(next)) break;
    // Dừng khi gặp dòng cột "Thực hiện" hoặc "Địa điểm" trong bảng PDF BXDĐ
    if (/^(?:Phòng\s+họp|Hội\s+trường|Trụ\s+sở|Trung\s+tâm|Nhà\s+văn\s+hóa|Điểm\s+cầu|Trưởng\s+Ban|Phó\s+Trưởng\s+ban|Các\s+đ\/c|Toàn\s+thể|Lãnh\s+đạo\s+Ban|Chuyên\s+viên)/i.test(next)) break;
    if (extractHeadingDate(next, 2000)) break;
    if (new RegExp(`^\\s*[-+•]?\\s*[^:\\n]{0,40}(?:${SECTION_LABELS})[^:\\n]{0,40}[:.]`, 'i').test(next)) break;
    title = `${title} ${stripHeadingTimePrefix(next)}`.replace(/\s+/g, ' ').trim();
  }
  return title.slice(0, 180);
}

/**
 * Nhận diện địa điểm và người thực hiện/chủ trì từ các dòng cuối của một khối sự kiện dạng bảng
 * (khi PDF không có tiền tố "Địa điểm:" hay "Chủ trì:").
 */
function extractTableColumnsFromLines(lines: string[]): { location: string; chair: string; participants: string } {
  let location = '';
  let chair = '';
  const participantParts: string[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const l = cleanPdfSpacing(lines[i]).trim();
    if (!l || l.length > 140) continue;
    if (/^(?:Phòng\s+họp|Hội\s+trường|Trụ\s+sở|Trung\s+tâm|Nhà\s+văn\s+hóa|Điểm\s+cầu|Khu\s+phố|UBND\s+phường|Đảng\s+ủy\s+phường)/i.test(l)) {
      location = location ? `${location} ${l}` : l;
    } else if (/^(?:Trưởng\s+Ban|Phó\s+Trưởng\s+ban|Đ\/c\s+[A-ZÀ-Ỹ]|Đồng\s+chí\s+[A-ZÀ-Ỹ]|Các\s+đ\/c\s+Phó\s+Trưởng\s+ban|Lãnh\s+đạo\s+Ban|Tập\s+thể\s+Ban)/i.test(l)) {
      if (!chair) chair = l.replace(/^[-+•\s]+/, '');
      else participantParts.push(l.replace(/^[-+•\s]+/, ''));
    } else if (/^-\s*(?:Đ\/c|Đồng\s+chí|Trưởng\s+ban|Phó\s+Trưởng\s+ban|Chuyên\s+viên|Cán\s+bộ|Toàn\s+thể)/i.test(l)) {
      participantParts.push(l.replace(/^[-+•\s]+/, ''));
    }
  }
  return {
    location: location.trim(),
    chair: chair.trim(),
    participants: participantParts.join('; ').trim(),
  };
}

/**
 * Bộ bóc tách thông minh nội hàm (Heuristic Extractor) dùng khi AI Cloud/Ollama chưa cấu hình hoặc mất kết nối.
 * Phân tích cấu trúc câu chữ, giấy mời, lịch tuần theo chuẩn văn bản hành chính Việt Nam.
 */
export function heuristicExtractEvents(
  text: string,
  ctx: { source_doc: string; source_id: string | null; source_priority: number; week_start: string }
): ExtractResult {
  const events: EventRecord[] = [];
  const rejected: { title: string; reason: string }[] = [];
  const defaultYear = Number(ctx.week_start.slice(0, 4)) || new Date().getFullYear();

  const cleanedText = cleanPdfSpacing(text);
  const lines = cleanedText.split(/[\r\n]+/);
  // Lịch tuần nhiều khối ngày: nhận diện bằng số dòng tiêu đề có tên thứ.
  // Văn bản dạng này KHÔNG được xử lý như một giấy mời đơn lẻ (mọi ngày/giờ đều nằm trong dòng).
  const isWeeklySchedule = lines.filter((l) => extractHeadingDate(l.trim(), defaultYear)).length >= 2;

  // Kiểm tra giấy mời đơn lẻ
  const isInvitation = !isWeeklySchedule && /(?:giấy\s*mời|thư\s*mời|v\/v\s*mời|kính\s*mời|triệu\s*tập)/i.test(cleanedText);
  const docDate = isWeeklySchedule ? null : extractDate(cleanedText, defaultYear);

  if (isInvitation) {
    let title = '';
    const vvMatch = cleanedText.match(/(?:v\/v|về\s*việc|nội\s*dung:?)\s+([^\n\r\.\;]+)/i);
    if (vvMatch) {
      title = vvMatch[1].trim();
    } else {
      // Chỉ lấy trong cùng một dòng: để \s nhảy dòng thì tiêu đề thành "Kính mời: đồng chí ..." thay vì tên cuộc họp.
      const gmMention = cleanedText.match(/(?:giấy\s*mời|thư\s*mời)[ \t]*[:\-–]?[ \t]*([^\n\r]+)/i);
      const subject = cleanedText.match(/^[ \t]*(?:Dự|Tham\s*dự)\s+([^\n\r]{6,120})/im);
      const mention = gmMention?.[1]?.trim() || '';
      title = mention && !/^(?:đ\/c|đồng\s+chí|kính|Ông|Bà)\b/i.test(mention)
        ? mention
        : (subject?.[1]?.trim() || 'Cuộc họp / Hội nghị theo giấy mời');
    }
    if (title) {
      // Dòng lịch viết hoa đầu câu theo thể thức hành chính ("dự hội nghị…" -> "Dự hội nghị…").
      title = title.charAt(0).toUpperCase() + title.slice(1);
    }

    const timeMatch = cleanedText.match(/(?:thời\s*gian:?|vào\s*hồi:?)\s*([^\n\r\.\;]+)/i);
    const timeContext = timeMatch ? timeMatch[1] : cleanedText;
    const eventDate = extractDate(timeContext, defaultYear) || docDate || ctx.week_start;
    // Không gán khống 08:00 khi giấy mời quên ghi giờ; thiếu giờ sẽ được báo trong missing_data_fields.
    const startTime = normalizeTime(timeContext) || '';
    const endMatch = timeContext.match(/(?:đến|tới|-|–)\s*(\d{1,2}(?:[.:h]\d{2}|[.:h]))/i);
    const endTime = endMatch ? normalizeTime(endMatch[1]) : null;

    let location = 'Chưa xác định (cần kiểm tra)';
    const locMatch = cleanedText.match(/(?:địa\s*điểm:?|tại:?)\s*([^\n\r\.\;]+)/i);
    if (locMatch) location = locMatch[1].trim();

    let chair = '';
    // Văn bản hành chính viết cả hai trật tự: "Chủ trì: đ/c A" và "đ/c A chủ trì".
    const chairMatch = cleanedText.match(/chủ\s*trì\s*[:\-–]\s*([^\n\r.;,]+)/i) ||
      cleanedText.match(/(?:chủ\s*trì:?|do\s+)(.+?)(?=\s+(?:thành phần|mời|địa điểm|thời gian|$|[\n\r;\.]))/i) ||
      cleanedText.match(/(?:do\s+)?((?:đ\/c|đồng chí|ông|bà|lãnh đạo|thường trực|bí thư|phó bí thư|chủ tịch|phó chủ tịch|giám đốc|trưởng ban(?:\s+xây\s+dựng\s+đảng|\s+bxdd|\s+bxdđ)?|phó\s+trưởng\s+ban(?:\s+xây\s+dựng\s+đảng|\s+bxdd|\s+bxdđ)?|tb\s+bxdd|ptb\s+bxdd|ban\s+thường\s+vụ|btv|thường\s+trực\s+đảng\s+ủy)[^\n\r,;\.]+?)\s+chủ\s*trì/i);
    if (chairMatch) chair = (chairMatch[1] || chairMatch[0]).replace(/chủ\s*trì/gi, '').trim();

    let participants = '';
    const partMatch = cleanedText.match(/(?:thành\s*phần:?|mời:?|thành\s*phần\s*mời:?)\s*([^\n\r\.\;]+)/i);
    if (partMatch) participants = partMatch[1].trim();

    const preparation = extractPreparation(cleanedText) || '';

    const diag: { reason?: string } = {};
    const coerced = coerceAiEvent({
      title,
      content: cleanedText.slice(0, 500),
      event_date: eventDate,
      start_time: startTime,
      end_time: endTime,
      chair,
      location,
      participants,
      preparation,
      confidence: 0.85,
    }, ctx, diag);

    if (coerced) {
      events.push(coerced);
      return { events, rejected };
    }
    rejected.push({ title: labelOfItem({ title, content: cleanedText }), reason: diag.reason || 'Giấy mời không đọc được nội dung lịch.' });
  }

  // Phân tích văn bản có nhiều dòng/sự kiện
  let currentDate = docDate || ctx.week_start;
  let period = '';
  let currentEventRaw: { date: string; time: string; lines: string[] } | null = null;
  const rawEvents: Array<{ date: string; time: string; lines: string[] }> = [];
  let sawDayHeader = false;

  const flush = () => {
    if (currentEventRaw) rawEvents.push(currentEventRaw);
    currentEventRaw = null;
  };

  for (const line of lines) {
    const trimmedLine = line.trim();
    // Bỏ dòng chỉ có số trang do PDF tách trang ("2", "3").
    if (!trimmedLine || /^\d{1,3}$/.test(trimmedLine)) continue;
    // Bỏ qua dòng tiêu đề cột bảng lặp lại ("Thời gian Nội dung Thực hiện Địa điểm")
    if (/^thời\s*gian\s+nội\s*dung/i.test(trimmedLine)) continue;

    const lineDate = extractHeadingDate(trimmedLine, defaultYear);
    if (lineDate) {
      // Sang ngày mới: đóng hoạt động cũ để tên người/địa điểm của ngày sau không dán vào ngày trước.
      flush();
      currentDate = lineDate;
      sawDayHeader = true;
      period = '';
    }
    const linePeriod = headingPeriod(trimmedLine);
    if (linePeriod) period = linePeriod;

    const timeInLine = extractHeadingTime(trimmedLine, period);
    const headingTitle = stripHeadingTimePrefix(trimmedLine);
    const datedOnly = !!lineDate && !timeInLine && /[:\-–]/.test(trimmedLine) && headingTitle.length > 10 && !startsWithWeekdayOnly(trimmedLine);

    // Nếu đã vào trong khối Ngày (sawDayHeader) và đang có một sự kiện có giờ (currentEventRaw.time),
    // thì các mục con đánh số ("1. Thông qua...", "2. Báo cáo...") không có giờ mới là nội dung con của cuộc họp đó, KHÔNG tách thành sự kiện rời.
    const isNewHeading = Boolean(timeInLine)
      || datedOnly
      || (!sawDayHeader && isHeadingLine(trimmedLine) && headingTitle.length >= 2);

    if (isNewHeading && headingTitle.length >= 2) {
      flush();
      currentEventRaw = { date: currentDate, time: timeInLine || '', lines: [trimmedLine] };
    } else if (currentEventRaw) {
      currentEventRaw.lines.push(trimmedLine);
    }
  }

  flush();

  if (rawEvents.length > 0) {
    for (const raw of rawEvents) {
      const body = raw.lines.join('\n');
      const flat = body.replace(/\s*\n\s*/g, ' ');
      const tableCols = extractTableColumnsFromLines(raw.lines);
      const location = pickSection(raw.lines, /địa\s*điểm|địa\s*chỉ|nơi\s*làm\s*việc/i) || tableCols.location;
      const participants = pickSection(raw.lines, /thành\s*phần|mời\b|cùng\s*dự/i) || tableCols.participants;
      const contentList = pickSection(raw.lines, /nội\s*dung|chương\s*trình/i);
      const chairMatch = flat.match(/((?:đ\/c|đồng chí|ông|bà|lãnh đạo|thường trực|bí thư|phó bí thư|chủ tịch|phó chủ tịch|giám đốc|trưởng ban(?:\s+xây\s+dựng\s+đảng|\s+bxdd|\s+bxdđ)?|phó\s+trưởng\s+ban(?:\s+xây\s+dựng\s+đảng|\s+bxdd|\s+bxdđ)?|tb\s+bxdd|ptb\s+bxdd|ban\s+thường\s+vụ(?:\s+đảng\s+ủy)?|btv|thường\s+trực\s+đảng\s+ủy)[^\n\r,;\.]*?)\s+chủ\s*trì/i) ||
        flat.match(/chủ\s*trì\s*[:\-]?\s+((?:đ\/c|đồng chí|ông|bà|lãnh đạo|thường trực|đảng\s+ủy|ban\s+thường\s+vụ)[^\n\r,;\.]+)/i) ||
        flat.match(/(?:do\s+)((?:đ\/c|đồng chí|lãnh đạo|thường trực)[^\n\r,;\.]+?)\s+(?:chủ\s*trì|điều\s*hành)/i);

      const title = composeHeadingTitle(raw.lines);

      const diag: { reason?: string } = {};
      const coerced = coerceAiEvent({
        title: title || 'Cuộc họp công tác',
        content: flat.slice(0, 1500),
        event_date: raw.date,
        start_time: raw.time,
        location: location,
        chair: chairMatch ? chairMatch[1].replace(/chủ\s*trì/gi, '').trim() : tableCols.chair,
        participants: participants || '',
        preparation: contentList ? `Nội dung: ${contentList}`.slice(0, 500) : '',
        confidence: 0.85,
      }, ctx, diag);

      if (coerced) events.push(coerced);
      else rejected.push({ title: title || '(dòng không tiêu đề)', reason: diag.reason || 'Dòng này không đủ dữ kiện để thành một mục lịch.' });
    }
  }

  // Fallback an toàn nếu chưa tìm thấy mục cụ thể: đưa toàn bộ vào 1 sự kiện chờ duyệt.
  if (events.length === 0 && !sawDayHeader) {
    const firstLine = lines.find((l) => l.trim().length > 10) || ctx.source_doc;
    const diag: { reason?: string } = {};
    const coerced = coerceAiEvent({
      title: firstLine.slice(0, 100),
      content: cleanedText.slice(0, 1000),
      event_date: docDate || ctx.week_start,
      start_time: normalizeTime(cleanedText) || '',
      location: 'Chưa xác định',
      confidence: 0.7,
    }, ctx, diag);
    if (coerced) events.push(coerced);
    else rejected.push({ title: firstLine.slice(0, 90), reason: diag.reason || 'Văn bản không đủ dữ kiện để tạo mục lịch.' });
  }

  return { events, rejected };
}

function startsWithWeekdayOnly(line: string): boolean {
  const f = foldVietnamese(line).replace(/\s+/g, ' ').trim();
  return /^(?:thu\s*(?:hai|ba|tu|bon|nam|sau|bay|2|3|4|5|6|7)|chu\s*nhat|cn)\s*,?\s*(?:ngay\s*)?\d{1,2}[/.\-]\d{1,2}(?:[/.\-]\d{4})?\s*$/i.test(f);
}

/**
 * Nhận diện lịch tuần của ĐẢNG ỦY và áp xuống lịch nội bộ Ban Xây dựng Đảng.
 *
 * Quy trình xác định (không gọi AI): bóc tách dòng tiêu đề -> chạy bộ dấu hiệu
 * `party_signals` (mức A–E kèm chứng cứ) -> đối chiếu khuôn dạng hoạt động của Đảng ủy
 * (`DANG_UY_ACTIVITY_FORMS`) để quyết định mục nào là việc của Ban và in căn cứ ra ô lý do.
 * Mức E = nguồn không có bất kỳ dấu hiệu nào về Ban -> chuyển sang `skipped` kèm lý do,
 * không xóa âm thầm; tên người chỉ được ghi khi văn bản nêu đích danh.
 */
export interface RecognitionOptions {
  disabledGroups?: string[];
  extraKeywords?: Record<string, string[]>;
  unitAliases?: string[];
}

export interface RecognizedAgencyItem {
  event_date: string;
  time_slot: string;
  content: string;
  executor: string;
  attendees: string;
  location: string;
  relevance_category: 'MANDATORY' | 'PROPOSED' | 'INTERNAL';
  relevance_reason: string;
  activity_form: string;
  detection_level: SignalLevel;
  source_excerpt: string;
}

export interface DangUyRecognition {
  items: RecognizedAgencyItem[];
  skipped: Array<{ event_date: string; time_slot: string; content: string; reason: string }>;
  by_level: Record<SignalLevel, number>;
}

type LocalRoster = Array<{ id?: string; name: string; title?: string; role_description?: string }>;

/**
 * Nhóm dấu hiệu tự nó đủ để nói "this là việc của Ban". Các nhóm chung (ủy nhiệm,
 * Ban Chỉ đạo, kiểm tra, hoạt động tập thể, Đảng ủy) chỉ có giá trị khi đi kèm
 * khuôn dạng hoặc tên người — không đủ để kéo nguyên lịch của đơn vị khác vào Ban.
 */
const BAN_SPECIFIC_GROUPS = new Set([
  'lanh_dao_ban', 'nhac_den_ban', 'chuan_bi_noi_dung', 'toan_the_co_quan', 'can_bo', 'btv_dang_uy',
]);

/** Ba khuôn dạng gọi đích danh Ban — được phép đọc ra từ thân mục, không chỉ dòng đầu. */
const NAMED_BAN_FORMS = new Set(['ban_uv_la_truong_ban', 'ban_chuan_bi_noi_dung', 'uy_nhiem_lanh_dao_ban']);

/**
 * Nguồn lịch tuần thường ghi nhiệm vụ chuẩn bị trong ngoặc sau tên nội dung:
 * "1.3. Công tác đảng viên. (Ban Xây dựng Đảng chuẩn bị)". Đây là đầu việc của cơ quan Ban
 * dù hoạt động do Đảng ủy/Ban Thường vụ chủ trì, nên phải lấy ra khỏi thân mục.
 */
export function banPreparationDuties(body: string): string[] {
  const duties: string[] = [];
  for (const m of body.matchAll(/([^.\n]{6,160})[.]?\s*\(\s*(?:ban xây dựng đảng|bxdd|bxdđ)\s*chuẩn bị[^)]{0,24}\)/gi)) {
    const task = m[1].replace(/\s+/g, ' ').replace(/^[\s\-–—(0-9.]+/, '').trim();
    if (task.length > 5) duties.push(task.slice(0, 160));
  }
  return [...new Set(duties)];
}

function toRoster(roster: LocalRoster): RosterPerson[] {
  return roster
    .filter((p) => String(p.name || '').trim().length > 2)
    .map((p) => ({
      id: String(p.id || p.name).trim(),
      name: String(p.name).trim(),
      title: String(p.title || ''),
      role_description: String(p.role_description || ''),
    }));
}

export function recognizeDangUyActivities(
  text: string,
  ctx: { source_doc: string; source_id: string | null; source_priority: number; week_start: string },
  roster: LocalRoster = [],
  options: RecognitionOptions = {}
): DangUyRecognition {
  const people = toRoster(roster);
  const rosterFolded = people.map((p) => canonicalPersonName(p.name));
  const { events } = heuristicExtractEvents(text, ctx);
  const detections = detectPartySignals(events.map((e) => ({
    id: e.id,
    date: e.event_date,
    start_time: e.start_time ?? '',
    end_time: e.end_time ?? '',
    title: e.title,
    location: e.location ?? '',
    attendees: [e.chair, e.participants, e.participant_group, e.organizer].filter(Boolean).join('. '),
    content: e.content ?? '',
    preparation: [e.preparation, e.documents_required].filter(Boolean).join('. '),
    source_page: e.source_page ?? null,
    excerpt: [ctx.source_doc, e.title].filter(Boolean).join(' — ').slice(0, 300),
  })), {
    roster: people,
    disabledGroups: options.disabledGroups,
    extraKeywords: options.extraKeywords,
    unitAliases: options.unitAliases,
  });

  const items: RecognizedAgencyItem[] = [];
  const skipped: DangUyRecognition['skipped'] = [];
  const by_level: Record<SignalLevel, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 };

  for (const detection of detections) {
    by_level[detection.detection_level] += 1;
    const source = events.find((e) => e.id === detection.source_event_id);
    if (!source) continue;
    const headingHay = String(source.title || '');
    const bodyHay = [source.chair, source.participants, source.participant_group, source.content, source.preparation]
      .filter(Boolean).join('\n');
    const hay = `${headingHay}\n${bodyHay}`;
    /**
     * Khuôn dạng lấy theo dòng đầu của hoạt động. Thân mục liệt kê cả "Ban Thường vụ",
     * "Ủy ban Kiểm tra", "cán bộ các phòng" ở dòng thành phần, nên đọc cả khối sẽ gán
     * nhầm tên hội nghị (giao ban Thường trực thành giao ban Ban Thường vụ). Chỉ ba khuôn
     * gọi đích danh Ban/Ủy viên Ban Thường vụ mới được chấp nhận khi nằm ở thân mục.
     */
    const bodyForm = mainDangUyForm(bodyHay, rosterFolded);
    const form = mainDangUyForm(headingHay, rosterFolded)
      || (bodyForm && NAMED_BAN_FORMS.has(bodyForm.id) ? bodyForm : null);
    const foreignUnit = matchDangUyForms(headingHay).some((f) => f.action === 'KHONG_PHAI_BAN');
    const named = matchPeople(hay, people);
    const duties = banPreparationDuties(bodyHay);
    const noTime = source.missing_data_fields.includes('start_time');
    const timeSlot = noTime || !source.start_time
      ? ''
      : `${Number(source.start_time.slice(0, 2))} giờ ${source.start_time.slice(3, 5)}`;

    /**
     * Ba cửa giữ lại một hoạt động, chứng cứ mạnh nhất xét trước:
     * 1) văn bản nêu đích danh cán bộ Ban; 2) khuôn dạng Đảng ủy gọi tên Ban
     * (BTV chủ trì, ủy nhiệm lãnh đạo Ban, giao Ban chuẩn bị…); 3) dấu hiệu nghiệp vụ
     * về Ban ở mức A/B. Còn lại để trống — kể cả hoạt động ủy nhiệm cho đơn vị khác.
     */
    const banSpecific = detection.matched_signals.some((signal) =>
      signal.group_id !== 'toan_the_co_quan' && BAN_SPECIFIC_GROUPS.has(signal.group_id))
      || detection.accompanying_person_ids.length > 0;
    const strongForm = !!form && ['BAT_BUOC_DU', 'CHUAN_BI_NOI_DUNG', 'CHO_PHAN_CONG'].includes(form.action);
    const directBan = named.length > 0 || strongForm || banSpecific || duties.length > 0;
    /**
     * Văn bản ủy nhiệm cho phòng/trung tâm/đội khác chỉ còn là lịch của Ban khi chính
     * hoạt động đó gọi tên Ban hoặc nêu đích danh cán bộ Ban.
     */
    const keep = foreignUnit
      ? directBan
      : directBan || (!!form && form.action === 'KIEM_TRA_THANH_PHAN' && ['A', 'B', 'C'].includes(detection.detection_level));
    if (!keep) {
      skipped.push({
        event_date: detection.date,
        time_slot: timeSlot,
        content: detection.title,
        reason: foreignUnit
          ? 'Văn bản ủy nhiệm cho lãnh đạo phòng/trung tâm/đội khác dự — không thuộc lịch Ban Xây dựng Đảng.'
          : form
            ? `${form.label} — ${form.note}`
            : detection.matched_signals.length
              ? `Chỉ có dấu hiệu chung (${detection.matched_signals.map((s) => s.label).join(', ')}); nguồn không gọi tên Ban Xây dựng Đảng.`
              : 'Văn bản không có dấu hiệu nào về Ban Xây dựng Đảng.',
      });
      continue;
    }

    const category: RecognizedAgencyItem['relevance_category'] = form?.action === 'CHUAN_BI_NOI_DUNG'
      ? 'INTERNAL'
      : named.length || form?.action === 'BAT_BUOC_DU' || (detection.detection_level === 'A' && banSpecific)
        ? 'MANDATORY'
        : 'PROPOSED';

    const reason = [
      form ? `Khuôn dạng Đảng ủy: ${form.label}. ${form.note}` : '',
      duties.length ? `Nội dung Ban phải chuẩn bị: ${duties.join('; ')}.` : '',
      named.length ? '' : 'Văn bản không nêu đích danh cán bộ Ban nên ô phân công để trống.',
      detection.reason,
      detection.evidence_refs.length ? `Căn cứ: ${detection.evidence_refs.join('; ')}` : '',
      detection.conflicts.length ? `Cảnh báo trùng lịch: ${detection.conflicts.join(' | ')}` : '',
    ].filter(Boolean).join(' ').slice(0, 600);

    items.push({
      event_date: detection.date,
      time_slot: timeSlot,
      content: detection.title || source.content.slice(0, 200),
      executor: [...new Set(named.map((m) => m.person.name))].join(', '),
      attendees: [source.chair, source.participants, source.participant_group].filter(Boolean).join('. '),
      location: detection.location || '',
      relevance_category: category,
      relevance_reason: reason,
      activity_form: form ? form.label : '',
      detection_level: detection.detection_level,
      source_excerpt: detection.source_excerpt || '',
    });
  }

  items.sort((a, b) => `${a.event_date} ${a.time_slot}`.localeCompare(`${b.event_date} ${b.time_slot}`));
  return { items, skipped, by_level };
}

/** Bản đồ kết quả bóc tách cục bộ sang phác thảo đầu việc lịch nội bộ Ban (chỉ phần liên quan đến Ban). */
export function heuristicAgencyItems(
  text: string,
  ctx: { source_doc: string; source_id: string | null; source_priority: number; week_start: string },
  roster: LocalRoster = [],
  options: RecognitionOptions = {}
): Record<string, any>[] {
  return recognizeDangUyActivities(text, ctx, roster, options).items;
}

/**
 * Bóc tách một văn bản nguồn thành danh sách sự kiện PROPOSED.
 * `settings` đưa hồ sơ cơ quan vào prompt để AI ghi ĐÚNG tên cán bộ của đơn vị mình
 * khi văn bản chỉ chép chức danh ("đ/c Bí thư"), và không tự thêm người ngoài danh sách.
 */
export async function extractEventsFromText(
  text: string,
  ctx: { source_doc: string; source_id: string | null; source_priority: number; week_start: string },
  settings?: SettingsRecord,
  existingEvents: EventRecord[] = []
): Promise<ExtractResult> {
  const trimmed = (text || '').trim();
  if (trimmed.length < 20) {
    throw new AIUnavailableError(`Nội dung văn bản "${ctx.source_doc}" quá ngắn để bóc tách.`);
  }
  const orgBlock = settings ? `\n\n${orgProfilePrompt(settings)}\n\nKhi văn bản chỉ nêu chức danh, hãy chép theo đúng tên người giữ chức danh đó ở đây; chức danh chưa có người giữ thì để nguyên chữ, KHÔNG tự đặt tên.` : '';

  // 1. Thử gọi AI (Gemini / Ollama / OpenAI) nếu có cấu hình
  try {
    // 1. Retrieve RAG context
    const context = (await import('../services/rag_ingestion.ts')).retrieve(trimmed, 2);
    const ragContext = context.length > 0 ? `\n\nContext tham chiếu từ lịch trước đây: \n${context.join('\n')}` : '';

    const data = await askJson<{ events?: Record<string, any>[] }>({
      systemInstruction: EXTRACT_SYSTEM + orgBlock,
      prompt: `Tuần tham chiếu bắt đầu ${ctx.week_start}. Văn bản: ${ctx.source_doc}${ragContext}\n\n${trimmed.slice(0, 12000)}`,
      label: 'extract',
    });
    const raw = Array.isArray(data.events) ? data.events : [];
    if (raw.length > 0) {

      const events: EventRecord[] = [];
      const rejected: { title: string; reason: string }[] = [];

      for (const item of raw) {
        const diagnostics: { reason?: string } = {};
        const coerced = coerceAiEvent(item, ctx, diagnostics);
        if (coerced) {
          // Validate with Zod
          const validation = CalendarEventSchema.safeParse({
            title: coerced.title,
            content: coerced.content,
            event_date: coerced.event_date,
            start_time: coerced.start_time,
            end_time: coerced.end_time,
            chair: coerced.chair,
            participants: coerced.participants,
            location: coerced.location,
            confidence: coerced.confidence
          });

          if (!validation.success) {
            rejected.push({ title: coerced.title, reason: `Dữ liệu không chuẩn: ${validation.error.message}` });
            continue;
          }

          // RAG Deduplication: Check if a similar event exists
          const similar = searchEventsByQuery(existingEvents, coerced.title, ['title', 'content'], {
            from: coerced.event_date,
            to: coerced.event_date,
            limit: 1
          });
          if (similar.length > 0) {
            // Mục trùng cũng phải hiện ra kèm lý do, nếu không cán bộ tưởng AI bỏ sót.
            rejected.push({
              title: coerced.title,
              reason: `Trùng với mục đã có trong lịch (${similar[0].title || similar[0].content || similar[0].id})`,
            });
            continue;
          }
          events.push(coerced);
        } else {
          rejected.push({ title: labelOfItem(item), reason: diagnostics.reason || 'Mục AI trả về không hợp lệ.' });
        }
      }
      return { events, rejected };
    }
  } catch (err: any) {
    // Khi AI chưa có key hoặc lỗi, tự động chuyển sang bộ bóc tách thông minh Heuristic
    console.warn(`[Extractor] AI chưa sẵn sàng (${err?.message}), chuyển sang bộ bóc tách thông minh nội hàm.`);
  }

  // 2. Fallback sang bộ bóc tách thông minh Heuristic
  return heuristicExtractEvents(trimmed, ctx);
}
