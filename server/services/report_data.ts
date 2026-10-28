/**
 * Gom số liệu báo cáo tuần/tháng dùng chung cho bản DOCX, XLSX, PDF và API JSON.
 * Chỉ đọc dữ liệu đã có; không tự thêm hay suy diễn sự kiện.
 */
import type { EventRecord, SettingsRecord } from '../types.ts';
import { durationOf } from '../engines/conflict.ts';
import { WEEKDAY_FULL, addDays, formatDdMmYyyy, fromIso, isoWeekNumber, startOfWeek } from '../utils/dates.ts';

export interface DayGroup {
  date: string;
  weekday: string;
  display: string;
  events: EventRecord[];
  minutes: number;
}

export interface PersonLoad {
  person: string;
  events: number;
  minutes: number;
  high_priority: number;
}

export interface WeekReport {
  meta: {
    unit_name: string;
    document_number: string;
    signer: string;
    week_start: string;
    week_end: string;
    week_number: number;
    year: number;
    generated_at: string;
  };
  totals: {
    events: number;
    minutes: number;
    pending_preparation: number;
    high_priority: number;
    by_status: Record<string, number>;
    by_priority: { high: number; medium: number; low: number };
  };
  days: DayGroup[];
  by_person: PersonLoad[];
  by_location: Array<{ location: string; events: number }>;
}

export interface MonthReport {
  meta: WeekReport['meta'] & { month_start: string; month_end: string; month: number };
  totals: WeekReport['totals'];
  weeks: Array<{ week_start: string; week_end: string; week_number: number; events: number; minutes: number; high_priority: number }>;
  days: Array<{ date: string; weekday: string; count: number; minutes: number }>;
  by_person: PersonLoad[];
  by_location: Array<{ location: string; events: number }>;
}

const NO_LOCATION = '(chưa ghi địa điểm)';
const NO_CHAIR = '(chưa phân công)';

function groupByDate(events: EventRecord[]): DayGroup[] {
  const map = new Map<string, EventRecord[]>();
  for (const ev of events) {
    const list = map.get(ev.event_date) || [];
    list.push(ev);
    map.set(ev.event_date, list);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, list]) => {
      const sorted = list.slice().sort((a, b) => a.start_time.localeCompare(b.start_time));
      return {
        date,
        weekday: WEEKDAY_FULL[fromIso(date).getDay()],
        display: formatDdMmYyyy(date),
        events: sorted,
        minutes: sorted.reduce((sum, ev) => sum + durationOf(ev), 0),
      };
    });
}

function peopleOfEvent(ev: EventRecord): string[] {
  const raw = [ev.chair, ev.contact_person, ...String(ev.participants || '').split(/[,;\n]/)]
    .map((x) => String(x || '').trim())
    .filter(Boolean);
  return [...new Set(raw)];
}

function aggregate(events: EventRecord[], days: DayGroup[]) {
  const byStatus: Record<string, number> = {};
  const byPriority = { high: 0, medium: 0, low: 0 };
  let pendingPrep = 0;
  for (const ev of events) {
    byStatus[ev.status] = (byStatus[ev.status] || 0) + 1;
    if (ev.priority_score >= 80) byPriority.high += 1;
    else if (ev.priority_score >= 60) byPriority.medium += 1;
    else byPriority.low += 1;
    if (!String(ev.preparation || '').trim()) pendingPrep += 1;
  }
  const personMap = new Map<string, PersonLoad>();
  for (const ev of events) {
    for (const person of peopleOfEvent(ev)) {
      const entry = personMap.get(person) || { person, events: 0, minutes: 0, high_priority: 0 };
      entry.events += 1;
      entry.minutes += durationOf(ev);
      if (ev.priority_score >= 80) entry.high_priority += 1;
      personMap.set(person, entry);
    }
  }
  const locationMap = new Map<string, number>();
  for (const ev of events) {
    const key = String(ev.location || '').trim() || NO_LOCATION;
    locationMap.set(key, (locationMap.get(key) || 0) + 1);
  }
  return {
    totals: {
      events: events.length,
      minutes: days.reduce((sum, d) => sum + d.minutes, 0),
      pending_preparation: pendingPrep,
      high_priority: byPriority.high,
      by_status: byStatus,
      by_priority: byPriority,
    },
    by_person: [...personMap.values()].sort((a, b) => b.minutes - a.minutes || b.events - a.events),
    by_location: [...locationMap.entries()]
      .map(([location, count]) => ({ location, events: count }))
      .sort((a, b) => b.events - a.events),
  };
}

export function buildWeekReport(events: EventRecord[], settings: SettingsRecord, weekStart: string): WeekReport {
  const inWeek = events.filter((ev) => ev.event_date >= weekStart && ev.event_date < addDays(weekStart, 7));
  const days = groupByDate(inWeek);
  const { totals, by_person, by_location } = aggregate(inWeek, days);
  return {
    meta: {
      unit_name: settings.unit_name,
      document_number: settings.document_number,
      signer: settings.signer,
      week_start: weekStart,
      week_end: addDays(weekStart, 6),
      week_number: isoWeekNumber(weekStart),
      year: fromIso(weekStart).getFullYear(),
      generated_at: new Date().toISOString(),
    },
    totals,
    days,
    by_person,
    by_location,
  };
}

/** Báo cáo tháng: giữ nguyên số liệu từng tuần ISO để đối chiếu với lịch tuần đã ban hành. */
export function buildMonthReport(events: EventRecord[], settings: SettingsRecord, monthStart: string): MonthReport {
  const first = fromIso(monthStart);
  const month = first.getMonth();
  const year = first.getFullYear();
  const monthEnd = formatIsoEndOfMonth(year, month);
  const inMonth = events.filter((ev) => ev.event_date >= `${year}-${String(month + 1).padStart(2, '0')}-01` && ev.event_date <= monthEnd);
  const days = groupByDate(inMonth);
  const { totals, by_person, by_location } = aggregate(inMonth, days);

  const weeks: MonthReport['weeks'] = [];
  let cursor = startOfWeek(days[0]?.date || `${year}-${String(month + 1).padStart(2, '0')}-01`);
  const last = days.length ? days[days.length - 1].date : monthEnd;
  while (cursor <= last) {
    const weekEnd = addDays(cursor, 6);
    const weekEvents = inMonth.filter((ev) => ev.event_date >= cursor && ev.event_date <= weekEnd);
    weeks.push({
      week_start: cursor,
      week_end: weekEnd,
      week_number: isoWeekNumber(cursor),
      events: weekEvents.length,
      minutes: weekEvents.reduce((sum, ev) => sum + durationOf(ev), 0),
      high_priority: weekEvents.filter((ev) => ev.priority_score >= 80).length,
    });
    cursor = addDays(cursor, 7);
  }

  return {
    meta: {
      unit_name: settings.unit_name,
      document_number: settings.document_number,
      signer: settings.signer,
      week_start: weeks[0]?.week_start || monthStart,
      week_end: weeks[weeks.length - 1]?.week_end || monthEnd,
      week_number: isoWeekNumber(monthStart),
      year,
      // getMonth() đếm từ 0; API trả tháng 1-12 để giao diện không phải tự cộng.
      month: month + 1,
      month_start: `${year}-${String(month + 1).padStart(2, '0')}-01`,
      month_end: monthEnd,
      generated_at: new Date().toISOString(),
    },
    totals,
    weeks,
    days: days.map((d) => ({ date: d.date, weekday: d.weekday, count: d.events.length, minutes: d.minutes })),
    by_person,
    by_location,
  };
}

function formatIsoEndOfMonth(year: number, month: number): string {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

export { NO_LOCATION, NO_CHAIR };
