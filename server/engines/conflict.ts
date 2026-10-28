import { newId } from '../store.ts';
import type { ConflictRecord, EventRecord, TravelBuffers } from '../types.ts';

const DEFAULT_BUFFER = 15;

/** "8h30", "08:30", "8:30" -> số phút sau nửa đêm; null nếu không parse được. */
export function parseClock(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /(\d{1,2})[:h](\d{2})/i.exec(String(value).toLowerCase());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function formatClock(minutes: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, minutes));
  const h = String(Math.floor(clamped / 60)).padStart(2, '0');
  const m = String(clamped % 60).padStart(2, '0');
  return `${h}:${m}`;
}

/** Thời lượng sự kiện, mặc định 90 phút khi thiếu giờ kết thúc. */
export function durationOf(event: EventRecord): number {
  const start = parseClock(event.start_time);
  const end = parseClock(event.end_time);
  if (start === null) return 90;
  if (end === null || end <= start) return 90;
  return end - start;
}

/** Nhu cầu thời gian di chuyển giữa hai địa điểm, theo bậc khoảng cách. */
const OUTSIDE_WARD = /(^|\s)(tỉnh|hà nội|hải phòng|quận khác|thành phố khác)/;

export function locationBuffer(loc1: string, loc2: string, buffers: TravelBuffers): number {
  if (!loc1 || !loc2) return DEFAULT_BUFFER;
  const l1 = loc1.toLowerCase().normalize('NFC');
  const l2 = loc2.toLowerCase().normalize('NFC');
  if (l1 === l2) return 0;
  const sameRoomArea =
    l1.includes('phòng họp') && l2.includes('phòng họp') &&
    (l1.includes('trụ sở') || l1.includes('đảng ủy') || l1.includes('ubnd'));
  if (sameRoomArea) return buffers.sameBuilding;
  if (l1.includes('phường') && l2.includes('phường')) return buffers.sameWard;
  if (OUTSIDE_WARD.test(l1) || OUTSIDE_WARD.test(l2)) return buffers.outsideArea;
  return buffers.sameCity;
}

function sameChair(e1: EventRecord, e2: EventRecord): boolean {
  const c1 = (e1.chair || '').trim().toLowerCase();
  const c2 = (e2.chair || '').trim().toLowerCase();
  return Boolean(c1) && Boolean(c2) && (c1.includes(c2) || c2.includes(c1));
}

/** So khớp tên lãnh đạo giữa hai sự kiện để phát hiện trùng người. */
export function shareLeader(e1: EventRecord, e2: EventRecord): boolean {
  return e1.leaders.some((l) => e2.leaders.includes(l));
}

export function analyzeConflicts(events: EventRecord[], buffers: TravelBuffers): ConflictRecord[] {
  const conflicts: ConflictRecord[] = [];
  const byDate = new Map<string, EventRecord[]>();
  for (const ev of events) {
    if (!ev.event_date || ev.status === 'REJECTED') continue;
    const list = byDate.get(ev.event_date) || [];
    list.push(ev);
    byDate.set(ev.event_date, list);
  }

  for (const dayEvents of byDate.values()) {
    for (let i = 0; i < dayEvents.length; i += 1) {
      for (let j = i + 1; j < dayEvents.length; j += 1) {
        const a = dayEvents[i];
        const b = dayEvents[j];
        const aStart = parseClock(a.start_time);
        const bStart = parseClock(b.start_time);
        if (aStart === null || bStart === null) continue;
        const aEnd = aStart + durationOf(a);
        const bEnd = bStart + durationOf(b);
        const overlaps = aStart < bEnd && bStart < aEnd;
        const higher = a.priority_score >= b.priority_score ? a : b;
        const lower = higher === a ? b : a;

        if (overlaps && (sameChair(a, b) || shareLeader(a, b))) {
          conflicts.push({
            id: newId('cf'),
            event_id_1: a.id,
            event_id_2: b.id,
            conflict_type: a.location !== b.location ? 'SAME_PERSON_DIFFERENT_LOC' : 'OVERLAP_TIME',
            severity: 'CONFLICT HIGH',
            description: `Đồng chí "${a.chair || a.leaders[0] || 'cùng thành phần'}" trùng lịch: "${a.title}" (${a.start_time}) và "${b.title}" (${b.start_time}) ngày ${a.event_date}.`,
            resolution_suggestion: `Giữ sự kiện ưu tiên cao hơn "${higher.title}" (điểm ${higher.priority_score}); phân công cấp phó dự thay hoặc dời "${lower.title}".`,
            status: 'OPEN',
            created_at: new Date().toISOString(),
          });
          continue;
        }

        if (overlaps) {
          conflicts.push({
            id: newId('cf'),
            event_id_1: a.id,
            event_id_2: b.id,
            conflict_type: 'OVERLAP_TIME',
            severity: 'CONFLICT MEDIUM',
            description: `Hai sự kiện cùng khung giờ: "${a.title}" (${a.start_time}) và "${b.title}" (${b.start_time}) ngày ${a.event_date}.`,
            resolution_suggestion: 'Kiểm tra thành phần tham dự để điều chỉnh khung giờ hoặc bố trí phòng họp khác.',
            status: 'OPEN',
            created_at: new Date().toISOString(),
          });
          continue;
        }

        for (const [first, second] of [[a, b], [b, a]] as [EventRecord, EventRecord][]) {
          const gap = parseClock(second.start_time)! - (parseClock(first.start_time)! + durationOf(first));
          if (gap < 0 || first.location === second.location) continue;
          const required = locationBuffer(first.location, second.location, buffers);
          if (gap < required) {
            conflicts.push({
              id: newId('cf'),
              event_id_1: first.id,
              event_id_2: second.id,
              conflict_type: 'TRAVEL_BUFFER_VIOLATION',
              severity: 'WARNING',
              description: `Quãng nghỉ giữa "${first.title}" (${first.location}) và "${second.title}" (${second.location}) chỉ ${gap} phút, cần tối thiểu ${required} phút.`,
              resolution_suggestion: `Lùi "${second.title}" thêm tối thiểu ${required - gap} phút để kịp di chuyển.`,
              status: 'OPEN',
              created_at: new Date().toISOString(),
            });
          }
        }
      }
    }
  }
  return conflicts;
}
