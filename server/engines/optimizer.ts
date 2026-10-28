import { findFreeSlots, peopleOf, type FreeSlot } from './free_slots.ts';
import { durationOf } from './conflict.ts';
import { addDays } from '../utils/dates.ts';
import type { ConflictRecord, EventRecord, TravelBuffers, WorkingHours } from '../types.ts';

export interface ConflictPlan {
  conflict_id: string;
  severity: string;
  description: string;
  move_event: { id: string; title: string; event_date: string; start_time: string; priority_score: number };
  keep_event: { id: string; title: string; event_date: string; start_time: string; priority_score: number };
  options: FreeSlot[];
  recommendation: string;
}

/**
 * Với mỗi xung đột đang mở, đề xuất dời sự kiện ít quan trọng hơn sang khung trống
 * gần nhất (cùng ngày trước, rồi các ngày làm việc kế tiếp trong tuần).
 * Thuật toán tham lam: giữ việc điểm ưu tiên cao, chỉ tính khung không trùng người
 * và đủ thời gian di chuyển — không tự ý đổi dữ liệu, cán bộ vẫn là người quyết định.
 */
export function planConflictResolutions(
  events: EventRecord[],
  conflicts: ConflictRecord[],
  workingHours: WorkingHours,
  buffers: TravelBuffers,
  options: { maxDaysAhead?: number; optionsPerConflict?: number } = {}
): ConflictPlan[] {
  const maxDays = Math.max(0, options.maxDaysAhead ?? 4);
  const perConflict = Math.max(1, options.optionsPerConflict ?? 3);
  const plans: ConflictPlan[] = [];

  for (const conflict of conflicts) {
    if (conflict.status !== 'OPEN') continue;
    const a = events.find((e) => e.id === conflict.event_id_1);
    const b = events.find((e) => e.id === conflict.event_id_2);
    if (!a || !b) continue;
    const aLower = a.priority_score < b.priority_score
      || (a.priority_score === b.priority_score && a.start_time > b.start_time);
    const move = aLower ? a : b;
    const keep = aLower ? b : a;
    const movablePeople = peopleOf(move);
    const slots: FreeSlot[] = [];

    for (let offset = 0; offset <= maxDays; offset += 1) {
      const date = addDays(move.event_date, offset);
      const found = findFreeSlots({
        date,
        durationMinutes: durationOf(move),
        workingHours,
        events,
        buffers,
        people: movablePeople,
        location: move.location,
        ignoreEventIds: [move.id],
        preferStart: offset === 0 ? move.start_time : undefined,
        limit: perConflict - slots.length,
      });
      slots.push(...found);
      if (slots.length >= perConflict) break;
    }

    if (!slots.length) {
      plans.push({
        conflict_id: conflict.id,
        severity: conflict.severity,
        description: conflict.description,
        move_event: pick(move),
        keep_event: pick(keep),
        options: [],
        recommendation: `Không tìm được khung trống cho "${move.title}" trong ${maxDays + 1} ngày tới. Nên cử người dự thay hoặc điều chỉnh thành phần tham dự.`,
      });
      continue;
    }

    const best = slots[0];
    plans.push({
      conflict_id: conflict.id,
      severity: conflict.severity,
      description: conflict.description,
      move_event: pick(move),
      keep_event: pick(keep),
      options: slots,
      recommendation: `Dời "${move.title}" sang ${best.start_time} ngày ${best.date} (giữ "${keep.title}" vì điểm ưu tiên ${keep.priority_score}).`,
    });
  }

  return plans;
}

function pick(ev: EventRecord) {
  return {
    id: ev.id,
    title: ev.title,
    event_date: ev.event_date,
    start_time: ev.start_time,
    priority_score: ev.priority_score,
  };
}
