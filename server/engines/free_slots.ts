import { durationOf, formatClock, locationBuffer, parseClock } from './conflict.ts';
import type { EventRecord, TravelBuffers, WorkingHours } from '../types.ts';

export interface FreeSlotOptions {
  date: string;
  durationMinutes: number;
  workingHours: WorkingHours;
  events: EventRecord[];
  buffers: TravelBuffers;
  /** Người bắt buộc phải rảnh (chủ trì, lãnh đạo dự họp). Rỗng = chỉ cần phòng/khung giờ trống. */
  people?: string[];
  /** Địa điểm dự kiến, để tính thời gian di chuyển với việc liền trước/liền sau. */
  location?: string;
  /** Bỏ qua chính sự kiện đang được dời. */
  ignoreEventIds?: string[];
  /** Giờ bắt đầu cũ, dùng để ưu tiên khung gần nhất (ít xáo trộn nhất). */
  preferStart?: string;
  stepMinutes?: number;
  limit?: number;
}

export interface FreeSlot {
  date: string;
  start_time: string;
  end_time: string;
  minutes: number;
  score: number;
  reasons: string[];
}

const DEFAULT_WORKING_HOURS: WorkingHours = {
  morning_start: '07:30', morning_end: '11:30',
  afternoon_start: '13:30', afternoon_end: '17:00',
  workdays: [1, 2, 3, 4, 5, 6],
};

export function normalizeWorkingHours(input?: Partial<WorkingHours> | null): WorkingHours {
  return { ...DEFAULT_WORKING_HOURS, ...(input || {}) };
}

function foldName(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/^(dc|d\/c|dong chi|ong|ba)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Danh sách người liên quan tới một sự kiện: chủ trì + lãnh đạo được trích xuất. */
export function peopleOf(event: Pick<EventRecord, 'chair' | 'leaders' | 'participants'>): string[] {
  const names = [event.chair, ...(event.leaders || [])]
    .flatMap((value) => String(value || '').split(/[,;/]| và /))
    .map(foldName)
    .filter(Boolean);
  return [...new Set(names)];
}

function sharesPeople(a: string[], b: string[]): boolean {
  if (!a.length || !b.length) return false;
  return a.some((x) => b.some((y) => x.includes(y) || y.includes(x)));
}

function overlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && startB < endA;
}

/** Các khung làm việc trong ngày, đã trừ giờ nghỉ trưa. */
function workWindows(hours: WorkingHours): Array<[number, number]> {
  const windows: Array<[number, number]> = [];
  const morningStart = parseClock(hours.morning_start);
  const morningEnd = parseClock(hours.morning_end);
  const afternoonStart = parseClock(hours.afternoon_start);
  const afternoonEnd = parseClock(hours.afternoon_end);
  if (morningStart !== null && morningEnd !== null && morningEnd > morningStart) windows.push([morningStart, morningEnd]);
  if (afternoonStart !== null && afternoonEnd !== null && afternoonEnd > afternoonStart) windows.push([afternoonStart, afternoonEnd]);
  return windows;
}

function weekdayOf(date: string): number {
  const day = new Date(`${date}T00:00:00`).getDay();
  return day;
}

/**
 * Tìm khung giờ trống ít xung đột nhất trong một ngày, có xét người tham dự và
 * thời gian di chuyển giữa hai địa điểm. Trả về tối đa `limit` phương án đã xếp hạng.
 */
export function findFreeSlots(options: FreeSlotOptions): FreeSlot[] {
  const hours = normalizeWorkingHours(options.workingHours);
  if (!hours.workdays.includes(weekdayOf(options.date))) return [];
  const duration = Math.max(15, Math.round(options.durationMinutes || 60));
  const step = Math.max(5, Math.round(options.stepMinutes || 15));
  const ignore = new Set(options.ignoreEventIds || []);
  const people = (options.people || []).map(foldName).filter(Boolean);
  const dayEvents = options.events.filter((ev) => ev.event_date === options.date && ev.status !== 'REJECTED' && !ignore.has(ev.id));
  const preferred = parseClock(options.preferStart || null);
  const results: FreeSlot[] = [];

  for (const [winStart, winEnd] of workWindows(hours)) {
    for (let start = winStart; start + duration <= winEnd; start += step) {
      const end = start + duration;
      const blockers = dayEvents.filter((ev) => {
        const evStart = parseClock(ev.start_time);
        if (evStart === null) return false;
        const evEnd = evStart + durationOf(ev);
        if (!overlap(start, end, evStart, evEnd)) return false;
        if (!people.length) return true;
        return sharesPeople(people, peopleOf(ev));
      });
      if (blockers.length) continue;

      const reasons: string[] = [];
      let travelPenalty = 0;
      if (options.location && dayEvents.length) {
        for (const ev of dayEvents) {
          if (people.length && !sharesPeople(people, peopleOf(ev))) continue;
          const evStart = parseClock(ev.start_time);
          if (evStart === null) continue;
          const evEnd = evStart + durationOf(ev);
          const required = locationBuffer(options.location, ev.location, options.buffers);
          const gapAfter = start - evEnd;
          const gapBefore = evStart - end;
          if (gapAfter >= 0 && gapAfter < required) {
            travelPenalty = Math.max(travelPenalty, required - gapAfter);
            reasons.push(`chỉ ${gapAfter} phút sau "${ev.title}" (${ev.location}), cần ${required} phút di chuyển`);
          }
          if (gapBefore >= 0 && gapBefore < required) {
            travelPenalty = Math.max(travelPenalty, required - gapBefore);
            reasons.push(`chỉ ${gapBefore} phút trước "${ev.title}" (${ev.location}), cần ${required} phút di chuyển`);
          }
        }
      }
      if (travelPenalty > 0) continue;

      let score = 100;
      if (preferred !== null) {
        const distance = Math.abs(start - preferred);
        score -= Math.min(40, Math.round(distance / 10));
      }
      // Ưu tiên nhẹ buổi sáng và khung bắt đầu đúng giờ tròn.
      if (start < 12 * 60) score += 4;
      if (start % 60 === 0) score += 3;
      results.push({
        date: options.date,
        start_time: formatClock(start),
        end_time: formatClock(end),
        minutes: duration,
        score,
        reasons: reasons.length ? reasons : ['không trùng người, đủ thời gian di chuyển'],
      });
    }
  }

  return results
    .sort((a, b) => (b.score - a.score) || a.start_time.localeCompare(b.start_time))
    .slice(0, Math.max(1, options.limit || 5));
}

export interface PersonWorkload {
  person: string;
  events: number;
  minutes: number;
  high_priority: number;
  days: number;
  busiest_day: string;
}

/** Thống kê tải công việc theo từng cán bộ trong khoảng ngày. */
export function workloadByPerson(events: EventRecord[]): PersonWorkload[] {
  const map = new Map<string, { events: number; minutes: number; high: number; days: Set<string>; perDay: Map<string, number> }>();
  for (const ev of events) {
    if (ev.status === 'REJECTED') continue;
    const minutes = durationOf(ev);
    for (const person of peopleOf(ev)) {
      const entry = map.get(person) || { events: 0, minutes: 0, high: 0, days: new Set<string>(), perDay: new Map<string, number>() };
      entry.events += 1;
      entry.minutes += minutes;
      if (ev.priority_score >= 80) entry.high += 1;
      entry.days.add(ev.event_date);
      entry.perDay.set(ev.event_date, (entry.perDay.get(ev.event_date) || 0) + minutes);
      map.set(person, entry);
    }
  }
  return [...map.entries()]
    .map(([person, entry]) => {
      let busiest = '';
      let max = -1;
      for (const [day, minutes] of entry.perDay) {
        if (minutes > max) { max = minutes; busiest = day; }
      }
      return {
        person,
        events: entry.events,
        minutes: entry.minutes,
        high_priority: entry.high,
        days: entry.days.size,
        busiest_day: busiest,
      };
    })
    .sort((a, b) => b.minutes - a.minutes);
}
