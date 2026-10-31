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

  // Kiểm tra giấy mời đơn lẻ
  const isInvitation = /(?:giấy\s*mời|thư\s*mời|v\/v\s*mời|kính\s*mời|triệu\s*tập)/i.test(text);
  const docDate = extractDate(text, defaultYear);

  if (isInvitation) {
    let title = '';
    const vvMatch = text.match(/(?:v\/v|về\s*việc|nội\s*dung:?)\s+([^\n\r\.\;]+)/i);
    if (vvMatch) {
      title = vvMatch[1].trim();
    } else {
      const gmMention = text.match(/(?:giấy\s*mời|thư\s*mời)\s*[:\-–]?\s*([^\n\r]+)/i);
      title = gmMention ? gmMention[1].trim() : 'Cuộc họp / Hội nghị theo giấy mời';
    }

    const timeMatch = text.match(/(?:thời\s*gian:?|vào\s*hồi:?)\s*([^\n\r\.\;]+)/i);
    const timeContext = timeMatch ? timeMatch[1] : text;
    const eventDate = extractDate(timeContext, defaultYear) || docDate || ctx.week_start;
    const startTime = normalizeTime(timeContext) || '08:00';
    const endMatch = timeContext.match(/(?:đến|tới|-|–)\s*(\d{1,2}(?:[.:h]\d{2}|[.:h]))/i);
    const endTime = endMatch ? normalizeTime(endMatch[1]) : null;

    let location = 'Chưa xác định (cần kiểm tra)';
    const locMatch = text.match(/(?:địa\s*điểm:?|tại:?)\s*([^\n\r\.\;]+)/i);
    if (locMatch) location = locMatch[1].trim();

    let chair = '';
    const chairMatch = text.match(/(?:chủ\s*trì:?|do\s+)(.+?)(?=\s+(?:thành phần|mời|địa điểm|thời gian|$|[\n\r;\.]))/i) ||
      text.match(/(?:do\s+)?((?:đ\/c|đồng chí|ông|bà|lãnh đạo|thường trực|bí thư|phó bí thư|chủ tịch|phó chủ tịch|giám đốc|trưởng ban(?:\s+xây\s+dựng\s+đảng|\s+bxdd|\s+bxdđ)?|phó\s+trưởng\s+ban(?:\s+xây\s+dựng\s+đảng|\s+bxdd|\s+bxdđ)?|tb\s+bxdd|ptb\s+bxdd|ban\s+thường\s+vụ|btv|thường\s+trực\s+đảng\s+ủy)[^\n\r,;\.]+?)\s+chủ\s*trì/i);
    if (chairMatch) chair = (chairMatch[1] || chairMatch[0]).replace(/chủ\s*trì/gi, '').trim();

    let participants = '';
    const partMatch = text.match(/(?:thành\s*phần:?|mời:?|thành\s*phần\s*mời:?)\s*([^\n\r\.\;]+)/i);
    if (partMatch) participants = partMatch[1].trim();

    const preparation = extractPreparation(text) || '';

    const coerced = coerceAiEvent({
      title,
      content: text.slice(0, 500),
      event_date: eventDate,
      start_time: startTime,
      end_time: endTime,
      chair,
      location,
      participants,
      preparation,
      confidence: 0.85,
    }, ctx);

    if (coerced) {
      events.push(coerced);
      return { events, rejected };
    }
  }

  // Phân tích văn bản có nhiều dòng/sự kiện
  const lines = text.split(/[\r\n]+/);
  let currentDate = docDate || ctx.week_start;
  let buffer: string[] = [];
  let currentEventRaw: { date: string; time: string; text: string } | null = null;
  const rawEvents: Array<{ date: string; time: string; text: string }> = [];

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    const lineDate = extractDate(trimmedLine, defaultYear);
    if (lineDate && /(?:thứ\s+|ngày\s+\d)/i.test(trimmedLine)) {
      currentDate = lineDate;
    }

    const timeInLine = normalizeTime(trimmedLine);
    if (timeInLine && /(?:^\s*[-•*]?\s*\d{1,2}[h:]|\b\d{1,2}h\d{2}\b|\b\d{1,2}:\d{2}\b)/.test(trimmedLine)) {
      if (currentEventRaw) {
        currentEventRaw.text = buffer.join(' ');
        rawEvents.push(currentEventRaw);
        buffer = [];
      }
      currentEventRaw = {
        date: currentDate,
        time: timeInLine,
        text: trimmedLine,
      };
      buffer.push(trimmedLine);
    } else if (currentEventRaw) {
      buffer.push(trimmedLine);
    }
  }

  if (currentEventRaw) {
    currentEventRaw.text = buffer.join(' ');
    rawEvents.push(currentEventRaw);
  }

  if (rawEvents.length > 0) {
    for (const raw of rawEvents) {
      const locMatch = raw.text.match(/(?:tại|ở|địa điểm:?)\s+([^,;\.\n]+)/i);
      const chairMatch = raw.text.match(/(?:chủ\s*trì:?|do\s+)(.+?)(?=\s+(?:thành phần|mời|địa điểm|$|[,;\.]))/i) ||
        raw.text.match(/(?:do\s+)?((?:đ\/c|đồng chí|ông|bà|lãnh đạo|thường trực|bí thư|phó bí thư|chủ tịch|phó chủ tịch|giám đốc|trưởng ban(?:\s+xây\s+dựng\s+đảng|\s+bxdd|\s+bxdđ)?|phó\s+trưởng\s+ban(?:\s+xây\s+dựng\s+đảng|\s+bxdd|\s+bxdđ)?|tb\s+bxdd|ptb\s+bxdd|ban\s+thường\s+vụ|btv|thường\s+trực\s+đảng\s+ủy)[^\n\r,;\.]+?)\s+chủ\s*trì/i);
      const partMatch = raw.text.match(/(?:thành\s*phần:?|mời:?)\s+([^,;\.\n]+)/i);

      const title = raw.text
        .replace(new RegExp(`^.*?${raw.time}\\s*[:\\-]?\\s*`, 'i'), '')
        .slice(0, 120)
        .trim();

      const coerced = coerceAiEvent({
        title: title || 'Cuộc họp công tác',
        content: raw.text,
        event_date: raw.date,
        start_time: raw.time,
        location: locMatch ? locMatch[1].trim() : 'Chưa xác định',
        chair: chairMatch ? chairMatch[1].replace(/chủ\s*trì/gi, '').trim() : '',
        participants: partMatch ? partMatch[1].trim() : '',
        confidence: 0.8,
      }, ctx);

      if (coerced) events.push(coerced);
    }
  }

  // Fallback an toàn nếu chưa tìm thấy mục cụ thể: đưa toàn bộ vào 1 sự kiện chờ duyệt
  if (events.length === 0) {
    const firstLine = lines.find((l) => l.trim().length > 10) || ctx.source_doc;
    const coerced = coerceAiEvent({
      title: firstLine.slice(0, 100),
      content: text.slice(0, 1000),
      event_date: docDate || ctx.week_start,
      start_time: normalizeTime(text) || '08:00',
      location: 'Chưa xác định',
      confidence: 0.7,
    }, ctx);
    if (coerced) events.push(coerced);
  }

  return { events, rejected };
}

/** Bóc tách một văn bản nguồn thành danh sách sự kiện PROPOSED. */
export async function extractEventsFromText(
  text: string,
  ctx: { source_doc: string; source_id: string | null; source_priority: number; week_start: string }
): Promise<ExtractResult> {
  const trimmed = (text || '').trim();
  if (trimmed.length < 20) {
    throw new AIUnavailableError(`Nội dung văn bản "${ctx.source_doc}" quá ngắn để bóc tách.`);
  }

  // 1. Thử gọi AI (Gemini / Ollama / OpenAI) nếu có cấu hình
  try {
    const data = await askJson<{ events?: Record<string, any>[] }>({
      systemInstruction: EXTRACT_SYSTEM,
      prompt: `Tuần tham chiếu bắt đầu ${ctx.week_start}. Văn bản: ${ctx.source_doc}\n\n${trimmed.slice(0, 12000)}`,
      label: 'extract',
    });
    const raw = Array.isArray(data.events) ? data.events : [];
    if (raw.length > 0) {
      const events: EventRecord[] = [];
      const rejected: { title: string; reason: string }[] = [];
      for (const item of raw) {
        const coerced = coerceAiEvent(item, ctx);
        if (coerced) events.push(coerced);
        else rejected.push({ title: String(item?.title || '(không tiêu đề)'), reason: 'Thiếu cả tiêu đề và nội dung' });
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
