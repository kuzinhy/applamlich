import type { EventRecord } from '../types.ts';

/** Bỏ dấu + chữ thường để so sánh tiêu đề/ mô tả tiếng Việt. */
export function foldVietnamese(text: string): string {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd');
}

function tokenSet(text: string): Set<string> {
  return new Set(foldVietnamese(text).split(/[^a-z0-9]+/).filter((t) => t.length >= 3));
}

/** 0..1 — mức trùng nội dung giữa hai mô tả công việc. */
export function similarity(a: string, b: string): number {
  const ta = tokenSet(a);
  const tb = tokenSet(b);
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  return shared / Math.min(ta.size, tb.size);
}

export interface UpsertResult {
  inserted: EventRecord[];
  merged: { event_id: string; title: string; from: string }[];
}

/**
 * Việc đã có cùng ngày + cùng giờ + nội dung gần trùng.
 * Dùng chung cho lúc gộp và lúc xem trước để hai đường không lệch nhau.
 */
export function findTwinIn<T extends { event_date: string; start_time: string; title: string; content: string }>(
  events: T[],
  ev: EventRecord
): T | undefined {
  return events.find(
    (e) =>
      e.event_date === ev.event_date &&
      e.start_time === ev.start_time &&
      (foldVietnamese(e.title) === foldVietnamese(ev.title) ||
        similarity(`${e.title} ${e.content}`, `${ev.title} ${ev.content}`) >= 0.6)
  );
}

/** Nạp sự kiện mới vào kho, gộp vào việc đã có nếu cùng ngày + cùng giờ + nội dung gần trùng.
    Việc đã duyệt/sửa bởi cán bộ không bị ghi đè: chỉ bổ sung nguồn và thông tin còn trống. */
export function upsertEvents(state: { events: EventRecord[] }, incoming: EventRecord[]): UpsertResult {
  const inserted: EventRecord[] = [];
  const merged: UpsertResult['merged'] = [];

  for (const ev of incoming) {
    const twin = findTwinIn(state.events, ev);
    if (!twin) {
      state.events.push(ev);
      inserted.push(ev);
      continue;
    }
    const from = ev.source_document || 'Văn bản khác';
    if (twin.source_document !== from && !twin.also_from.includes(from)) {
      twin.also_from.push(from);
    }
    twin.confidence = Math.max(twin.confidence, ev.confidence);
    twin.priority_score = Math.max(twin.priority_score, ev.priority_score);
    for (const field of ['chair', 'participants', 'participant_group', 'location', 'organizer', 'preparation', 'documents_required', 'contact_person', 'end_time'] as const) {
      if ((!twin[field] || String(twin[field]).startsWith('Chưa xác định')) && ev[field] && !String(ev[field]).startsWith('Chưa xác định')) {
        (twin as any)[field] = ev[field];
      }
    }
    if (Array.isArray(ev.tasks) && ev.tasks.length) {
      const existingTaskTexts = new Set((twin.tasks || []).map((t) => foldVietnamese(t.text)));
      for (const task of ev.tasks) {
        if (!existingTaskTexts.has(foldVietnamese(task.text))) {
          twin.tasks = [...(twin.tasks || []), task];
          existingTaskTexts.add(foldVietnamese(task.text));
        }
      }
    }
    twin.missing_data_fields = (twin.missing_data_fields || []).filter((f) => {
      const val = (twin as any)[f];
      return !val || String(val).startsWith('Chưa xác định');
    });
    twin.leaders = [...new Set([...twin.leaders, ...ev.leaders])];
    if (ev.is_supplemental) {
      twin.is_supplemental = true;
      if (ev.supplemental_note) {
        twin.supplemental_note = ev.supplemental_note;
      }
    }
    twin.updated_at = new Date().toISOString();
    merged.push({ event_id: twin.id, title: twin.title, from });
  }

  return { inserted, merged };
}
