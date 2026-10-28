import { getState, recordAudit } from '../store.ts';
import { foldVietnamese, upsertEvents } from './merge.ts';
import { askJson, AIUnavailableError } from '../engines/gemini.ts';
import { coerceAiEvent } from '../engines/extractor.ts';
import { analyzeConflicts } from '../engines/conflict.ts';
import { weekDays, formatDdMmYyyy } from '../utils/dates.ts';
import { scorePriority } from '../engines/priority.ts';
import type { EventRecord, StoreState } from '../types.ts';

const MAX_SOURCE_CHARS = 12000;

// Bỏ dấu trước khi so khớp để "Hội nghị" và "Hoi nghi" không bị coi là hai việc khác nhau.
const slug = (s: string) => foldVietnamese(s).replace(/[^a-z0-9]+/g, '').slice(0, 40);
const dedupeKey = (e: { event_date: string; start_time: string; title: string }) =>
  `${e.event_date}|${e.start_time}|${slug(e.title)}`;

function systemPrompt(weekStart: string, weekEnd: string): string {
  return `
Bạn là Trợ lý lập lịch Văn phòng Đảng ủy và UBND phường, đang soạn LỊCH CÔNG TÁC TUẦN
cho giai đoạn ${formatDdMmYyyy(weekStart)} đến ${formatDdMmYyyy(weekEnd)}.

Nguyên tắc bắt buộc:
1. Chỉ lấy công việc CÓ TRONG VĂN BẢN nguồn được cung cấp. Không suy diễn, không bịa.
2. Ưu tiên văn bản cấp trên và văn bản Đảng ủy hơn thông báo nội bộ.
3. Mỗi sự kiện phải rõ: ai chủ trì, thành phần tham dự, địa điểm, giờ bắt đầu/kết thúc.
4. Nếu văn bản ghi "sáng/chiều" mà không có giờ cụ thể, ước lượng 08:00-11:00 hoặc 14:00-16:30
   và giảm confidence xuống 0.5-0.6.
5. "preparation" nêu rõ đầu việc + đơn vị/cá nhân chuẩn bị + hạn nộp nếu văn bản có ghi.
6. Bỏ qua sự kiện đã tồn tại trong danh sách "đã có" ở cuối prompt.
Trả về JSON: {"events":[...], "rejected":[{"title":"...","reason":"..."}]}
`.trim();
}

export interface WeekDraftResult {
  week_start: string;
  week_end: string;
  events: EventRecord[];
  rejected: { title: string; reason: string }[];
  sources_used: { id: string; file_name: string; chars: number }[];
  saved: number;
  conflicts: number;
}

/** Tạo dự thảo lịch tuần từ toàn bộ văn bản nguồn chưa bóc tách. */
export async function generateWeekDraft(weekStart: string, options: { save?: boolean } = {}): Promise<WeekDraftResult> {
  const state = getState();
  const days = weekDays(weekStart);
  const weekEnd = days[6].date;

  const usable = state.sources.filter((s) => (s.raw_text || '').trim().length >= 40);
  if (!usable.length) {
    throw new AIUnavailableError(
      `Chưa có văn bản nguồn nào có nội dung (${state.sources.length} nguồn đang thiếu raw_text). ` +
      'Hãy tải lên hoặc dán nội dung văn bản trước khi yêu cầu AI lập lịch.'
    );
  }

  const existing = state.events.filter((e) => e.event_date >= weekStart && e.event_date <= weekEnd);
  const collected = usable.map((s) => ({
    id: s.id,
    file_name: s.file_name,
    priority_level: s.priority_level,
    text: (s.raw_text || '').trim().slice(0, MAX_SOURCE_CHARS),
  }));
  const totalChars = collected.reduce((n, c) => n + c.text.length, 0);
  if (totalChars > MAX_SOURCE_CHARS * 2) {
    throw new AIUnavailableError(`Khối lượng văn bản nguồn quá lớn (${totalChars} ký tự). Hãy bóc tách từng văn bản.`);
  }

  const lessons = state.memory.slice(-8).map((m) => ({
    van_ban: (m.source_text || '').slice(0, 160),
    giao: m.assigned_executor,
    du: m.assigned_attendees,
  }));
  const roster = state.personnel.filter((p) => p.is_active !== 0).map((p) => `${p.name} — ${p.title}`);

  const prompt = [
    collected.map((c, i) => `--- NGUỒN ${i + 1}: ${c.file_name} (điểm ưu tiên ${c.priority_level}) ---\n${c.text}`).join('\n\n'),
    roster.length
      ? `\n--- CÁN BỘ CỦA ĐƠN VỊ (ghi đúng tên, chức danh này khi văn bản chỉ nói tắt) ---\n${roster.join(' | ')}`
      : '',
    lessons.length
      ? `\n--- PHÂN CÔNG ĐÃ HỌC Ở CÁC TUẦN TRƯỚC (chỉ để thống nhất cách ghi tên người, KHÔNG tự thêm việc mới) ---\n${JSON.stringify(lessons)}`
      : '',
    existing.length
      ? `\n--- ĐÃ CÓ TRONG TUẦN (không lặp lại) ---\n${existing.map((e) => `${e.event_date} ${e.start_time} ${e.title} (${e.chair})`).join('\n')}`
      : '\n--- Tuần này chưa có sự kiện nào ---',
  ].filter(Boolean).join('\n');

  const data = await askJson<{ events?: Record<string, any>[]; rejected?: { title: string; reason: string }[] }>({
    systemInstruction: systemPrompt(weekStart, weekEnd),
    prompt,
    temperature: 0.1,
    label: 'week-draft',
  });

  const seen = new Set(existing.map(dedupeKey));
  const events: EventRecord[] = [];
  const rejected: { title: string; reason: string }[] = [];
  // AI có thể ghi tên văn bản nguồn; nếu không khớp thì lấy nguồn có thứ tự ưu tiên cao nhất.
  const sourceByFile = new Map(collected.map((c) => [c.file_name.trim().toLowerCase(), c]));
  const fallbackSource = collected.reduce((best, c) => (c.priority_level > best.priority_level ? c : best), collected[0]);

  for (const item of Array.isArray(data.events) ? data.events : []) {
    const claimed = typeof item.source_document === 'string' ? item.source_document.trim().toLowerCase() : '';
    const source = (claimed && sourceByFile.get(claimed)) || fallbackSource;
    const ctx = {
      source_doc: source.file_name,
      source_id: source.id,
      source_priority: source.priority_level,
      week_start: weekStart,
    };
    const coerced = coerceAiEvent(item, ctx);
    if (!coerced) {
      rejected.push({ title: String(item?.title || '(trống)'), reason: 'Thiếu cả tiêu đề và nội dung' });
      continue;
    }
    if (coerced.event_date < weekStart || coerced.event_date > weekEnd) {
      rejected.push({ title: coerced.title, reason: `Ngoài tuần (${coerced.event_date})` });
      continue;
    }
    const key = dedupeKey(coerced);
    if (seen.has(key)) {
      rejected.push({ title: coerced.title, reason: 'Trùng sự kiện đã có' });
      continue;
    }
    seen.add(key);
    events.push(coerced);
  }
  for (const r of Array.isArray(data.rejected) ? data.rejected : []) {
    rejected.push({ title: String(r.title || '(trống)'), reason: String(r.reason || 'AI loại') });
  }

  const result: WeekDraftResult = {
    week_start: weekStart,
    week_end: weekEnd,
    events,
    rejected,
    sources_used: collected.map((c) => ({ id: c.id, file_name: c.file_name, chars: c.text.length })),
    saved: 0,
    conflicts: 0,
  };

  if (options.save && events.length) {
    result.saved = saveDraft(result, state);
    result.conflicts = analyzeConflicts(
      state.events.filter((e) => e.event_date >= weekStart && e.event_date <= weekEnd),
      state.settings.travel_buffers
    ).length;
  }
  return result;
}

function saveDraft(result: WeekDraftResult, state: StoreState): number {
  const bySource = new Map(state.sources.map((s) => [s.file_name, s]));
  for (const ev of result.events) {
    const src = bySource.get(ev.source_document);
    if (src) {
      ev.source_id = src.id;
      ev.priority_score = scorePriority({
        source_priority: src.priority_level,
        title: ev.title,
        content: ev.content,
        chair: ev.chair,
        participants: ev.participants,
      });
    }
  }
  const { inserted, merged } = upsertEvents(state, result.events);
  state.conflicts = [
    ...state.conflicts.filter((c) => c.status === 'RESOLVED'),
    ...analyzeConflicts(
      state.events.filter((e) => e.event_date >= result.week_start && e.event_date <= result.week_end),
      state.settings.travel_buffers
    ),
  ];
  recordAudit(
    'ai_week_draft',
    'events',
    result.week_start,
    `Thêm ${inserted.length} dự thảo, gộp ${merged.length} việc trùng từ văn bản khác (tuần ${result.week_start})`
  );
  for (const s of state.sources) {
    if (result.sources_used.some((u) => u.id === s.id)) s.parse_status = 'DONE';
  }
  return inserted.length;
}
