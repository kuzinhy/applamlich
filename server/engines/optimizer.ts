import { findFreeSlots, peopleOf, type FreeSlot } from './free_slots.ts';
import { locationBuffer } from './conflict.ts';
import { attendanceWeight } from './attendance.ts';
import { durationOf, parseClock, timesOverlap } from '../utils/clock.ts';
import { addDays } from '../utils/dates.ts';
import type { ConflictRecord, EventRecord, OrgProfile, TravelBuffers, WorkingHours } from '../types.ts';

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
  options: { maxDaysAhead?: number; optionsPerConflict?: number; profile?: OrgProfile | null } = {}
): ConflictPlan[] {
  const maxDays = Math.max(0, options.maxDaysAhead ?? 4);
  const perConflict = Math.max(1, options.optionsPerConflict ?? 3);
  const profile = options.profile ?? null;
  const scoreOf = (ev: EventRecord) => (profile ? attendanceWeight(profile, ev).score : ev.priority_score);
  const plans: ConflictPlan[] = [];
  // Kế hoạch theo loạt phải tự nhất quán: mỗi nước dời được tính trên bản sao đã áp các nước trước,
  // nếu không thì áp dụng cả loạt lại sinh thêm xung đột mới.
  const working = events.map((e) => ({ ...e }));

  for (const conflict of conflicts) {
    if (conflict.status !== 'OPEN') continue;
    const a = working.find((e) => e.id === conflict.event_id_1);
    const b = working.find((e) => e.id === conflict.event_id_2);
    if (!a || !b) continue;
    const scoreA = scoreOf(a);
    const scoreB = scoreOf(b);
    const aLower = scoreA < scoreB || (scoreA === scoreB && a.start_time > b.start_time);
    const move = aLower ? a : b;
    const keep = aLower ? b : a;
    const movablePeople = peopleOf(move);
    const slots: FreeSlot[] = [];

    for (let offset = 0; offset <= maxDays; offset += 1) {
      const date = addDays(move.event_date, offset);
      const need = perConflict - slots.length;
      // findFreeSlots cắt danh sách theo `limit` TRƯỚC khi lọc, nên hỏi nhiều khung rồi mới lọc
      // và cắt lại — nếu không các khung bị loại vì trùng mục khác ăn hết suất và kế hoạch hụt khung thật.
      const found = findFreeSlots({
        date,
        durationMinutes: durationOf(move),
        workingHours,
        events: working,
        buffers,
        people: movablePeople,
        location: move.location,
        ignoreEventIds: [move.id],
        preferStart: offset === 0 ? move.start_time : undefined,
        limit: Math.min(60, need * 8),
      })
        .filter((slot) => !overlapsAnyOther(working, move.id, slot)
          && !breaksTravelBuffer(working, move.id, slot, move.location, buffers))
        .slice(0, need);
      slots.push(...found);
      if (slots.length >= perConflict) break;
    }

    if (!slots.length) {
      const sub = conflict.suggested_substitute;
      plans.push({
        conflict_id: conflict.id,
        severity: conflict.severity,
        description: conflict.description,
        move_event: pick(move),
        keep_event: pick(keep),
        options: [],
        recommendation: sub
          ? `Không tìm được khung trống cho "${move.title}". Theo quy chế phân công, cử ${sub.substitute_holder} (${sub.substitute_title}) dự thay "${move.title}".`
          : `Không tìm được khung trống cho "${move.title}" trong ${maxDays + 1} ngày tới. Nên cử người dự thay hoặc điều chỉnh thành phần tham dự.`,
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
    move.event_date = best.date;
    move.start_time = best.start_time;
    move.end_time = best.end_time;
  }

  return plans;
}

/**
 * Một khung chỉ thật sự trống khi không chồng lên mục lịch nào khác trong ngày:
 * engine xung đột báo OVERLAP_TIME cho MỌI cặp trùng giờ, kể khác người, khác phòng.
 */
function overlapsAnyOther(events: EventRecord[], movingId: string, slot: FreeSlot): boolean {
  return events.some((other) => other.id !== movingId
    && other.event_date === slot.date
    && other.status !== 'REJECTED'
    && timesOverlap(other.start_time, other.end_time, slot.start_time, slot.end_time));
}

/**
 * Engine xung đột phát cảnh báo TRAVEL_BUFFER_VIOLATION với mọi cặp liền nhau khác địa điểm,
 * không hỏi ai tham dự. Khung mà kế hoạch chọn phải tuân cùng quy tắc đó, nếu không
 * áp cả loạt xong lại sinh cảnh báo mới.
 */
function breaksTravelBuffer(
  events: EventRecord[], movingId: string, slot: FreeSlot, slotLocation: string, buffers: TravelBuffers
): boolean {
  const slotStart = parseClock(slot.start_time);
  const slotEnd = parseClock(slot.end_time);
  if (slotStart === null || slotEnd === null) return false;
  return events.some((other) => {
    if (other.id === movingId || other.event_date !== slot.date || other.status === 'REJECTED') return false;
    if (!other.location || other.location === slotLocation) return false;
    const otherStart = parseClock(other.start_time);
    if (otherStart === null) return false;
    const otherEnd = otherStart + durationOf(other);
    const gapAfter = slotStart - otherEnd;
    if (gapAfter >= 0 && gapAfter < locationBuffer(other.location, slotLocation, buffers)) return true;
    const gapBefore = otherStart - slotEnd;
    return gapBefore >= 0 && gapBefore < locationBuffer(slotLocation, other.location, buffers);
  });
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
