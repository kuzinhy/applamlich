import { newId, extractLeaders } from '../store.ts';
import { scorePriority } from './priority.ts';
import { extractPreparation } from './preparation.ts';
import { askJson, AIUnavailableError } from './gemini.ts';
import type { EventRecord } from '../types.ts';

// Cụm chỉ thứ trong tuần: tiếng Việt dùng "Tư" (không phải "Bốn"), "Bảy", "Chủ nhật".
const WEEKDAY_NAMES = '(?:thứ\\s+(?:hai|ba|t\\u01b0|tu|n\\u0103m|nam|s\\u00e1u|sau|b\\u1ea3y|bay)|ch\\u1ee7\\s+nh\\u1eadt|ch\\u1ee7\\s*nhat|chu\\s+nh\\u1eadt)';
// Một token giờ: 8:00 | 8h | 8h30 | 8 giờ 30
const TIME_TOKEN = '\\d{1,2}(?:[.:]\\d{2}|\\s*h\\s*\\d{2}|\\s*h(?![\\w])|\\s*giờ\\s*\\d{2}|\\s*giờ(?![\\w]))';

/** "8h30", "8 giờ 30", "13:00" -> "HH:MM"; null nếu không đọc được.
    context dùng để đoán "7h chiều" = 17:00. */
export function normalizeTime(raw: string | null | undefined, context = ''): string | null {
  if (!raw) return null;
  const cleaned = String(raw).toLowerCase()
    .replace(/giờ/g, ':')
    .replace(/h/g, ':')
    .replace(/\u00a0/g, ' ')
    .replace(/\s/g, '');
  const m = /^(\d{1,2}):?(\d{0,2})/.exec(cleaned);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  if (minute > 59) return null;
  const ctx = context.toLowerCase();
  if (hour < 12 && /(chiều|buổi\s*chiều|pm)/.test(ctx)) hour += 12;
  if (hour > 23) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** Đọc "24/10", "ngày 24/10/2026", "2026-10-24" đầu tiên trong văn bản. */
export function extractDate(text: string, defaultYear: number): string | null {
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const slash = new RegExp(`(?:${WEEKDAY_NAMES}[\\s,]+)?(?:ngày\\s+)?(\\d{1,2})[/\\-](\\d{1,2})(?:[/\\-](\\d{4}))?`).exec(text);
  if (!slash) return null;
  const day = Number(slash[1]);
  const month = Number(slash[2]);
  const year = slash[3] ? Number(slash[3]) : defaultYear;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Chẩn hoá một phần tử AI trả về thành đúng schema bảng events. */
export function coerceAiEvent(
  item: Record<string, any>,
  ctx: { source_doc: string; source_id: string | null; source_priority: number; week_start: string }
): EventRecord | null {
  if (!item || typeof item !== 'object') return null;
  const title = String(item.title || '').trim();
  const content = String(item.content || '').trim();
  if (!title && !content) return null;

  const missing: string[] = [];
  const rawDate = String(item.event_date || '').trim();
  let eventDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : '';
  if (!eventDate) {
    eventDate = extractDate(`${title} ${content}`, Number(ctx.week_start.slice(0, 4))) || '';
  }
  if (!eventDate) {
    eventDate = ctx.week_start;
    missing.push('event_date');
  }

  const timeContext = `${title} ${content}`;
  let start = normalizeTime(item.start_time || '', timeContext);
  if (!start) start = normalizeTime((new RegExp(`(${TIME_TOKEN})`).exec(timeContext) || [])[1], timeContext);
  let end = normalizeTime(item.end_time || '', timeContext);
  if (!start) missing.push('start_time');
  if (!end) missing.push('end_time');

  const chair = String(item.chair || '').trim();
  if (!chair) missing.push('chair');
  let location = String(item.location || '').trim();
  if (!location) {
    missing.push('location');
    location = 'Chưa xác định (cần kiểm tra)';
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
    start_time: start || '07:00',
    end_time: end,
    title: title || content.slice(0, 80),
    content: content || title,
    chair,
    participants: String(item.participants || '').trim(),
    participant_group: String(item.participant_group || '').trim(),
    location,
    organizer: String(item.organizer || '').trim(),
    preparation: String(item.preparation || '').trim() || extractPreparation(`${title} ${content}`) || '',
    documents_required: String(item.documents_required || '').trim(),
    contact_person: String(item.contact_person || '').trim(),
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
    created_at: now,
    updated_at: now,
  };
}

const EXTRACT_SYSTEM = `
Bạn là chuyên gia bóc tách văn bản hành chính của Văn phòng Đảng ủy và UBND cấp phường.
Nhiệm vụ: đọc nội dung văn bản/thư mời, trích xuất TẤT CẢ lịch công tác có thật trong văn bản.
Quy tắc:
- Không bịa sự kiện không có trong văn bản. Thiếu thông tin thì để trống trường đó.
- Ngày trả về định dạng YYYY-MM-DD; giờ trả về HH:MM (24h), bám sát chữ "chiều/sáng".
- "chair" là người chủ trì; "participant_group" là nhóm tham dự (VD: Thường trực Đảng ủy).
- "preparation" là đầu việc cần chuẩn bị kèm đơn vị/cá nhân thực hiện.
Trả về JSON hợp lệ theo mẫu:
{"events":[{"title":"","content":"","event_date":"","start_time":"","end_time":"","chair":"","participants":"","participant_group":"","location":"","organizer":"","preparation":"","documents_required":"","contact_person":"","confidence":0.9,"source_page":null,"source_paragraph":null}]}
`.trim();

export interface ExtractResult {
  events: EventRecord[];
  rejected: { title: string; reason: string }[];
}

/** Bóc tách một văn bản nguồn thành danh sách sự kiện PROPOSED. */
export async function extractEventsFromText(
  text: string,
  ctx: { source_doc: string; source_id: string | null; source_priority: number; week_start: string }
): Promise<ExtractResult> {
  const trimmed = (text || '').trim();
  if (trimmed.length < 40) {
    throw new AIUnavailableError(`Nội dung văn bản "${ctx.source_doc}" quá ngắn để bóc tách.`);
  }
  const data = await askJson<{ events?: Record<string, any>[] }>({
    systemInstruction: EXTRACT_SYSTEM,
    prompt: `Tuần tham chiếu bắt đầu ${ctx.week_start}. Văn bản: ${ctx.source_doc}\n\n${trimmed.slice(0, 12000)}`,
    label: 'extract',
  });
  const raw = Array.isArray(data.events) ? data.events : [];
  const events: EventRecord[] = [];
  const rejected: { title: string; reason: string }[] = [];
  for (const item of raw) {
    const coerced = coerceAiEvent(item, ctx);
    if (coerced) events.push(coerced);
    else rejected.push({ title: String(item?.title || '(không tiêu đề)'), reason: 'Thiếu cả tiêu đề và nội dung' });
  }
  return { events, rejected };
}
