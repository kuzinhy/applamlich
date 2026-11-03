import { holidaysInRange } from './vn_holidays.ts';

export const WEEKDAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

const pad = (n: number) => String(n).padStart(2, '0');

export function toIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(iso: string, days: number): string {
  const d = fromIso(iso);
  d.setDate(d.getDate() + days);
  return toIso(d);
}

export function todayIso(): string {
  return toIso(new Date());
}

/** Thứ Hai đầu tuần của một ngày bất kỳ. */
export function startOfWeek(iso: string): string {
  const d = fromIso(iso);
  const shift = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - shift);
  return toIso(d);
}

export function isoWeekNumber(iso: string): number {
  const d = fromIso(iso);
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayNr = (target.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const diff = target.getTime() - firstThursday.getTime();
  return 1 + Math.round(diff / (7 * 24 * 3600 * 1000));
}

export interface WeekDay {
  date: string;
  display_date: string;
  weekday: string;
  weekday_full: string;
  is_today: boolean;
  is_weekend: boolean;
  /** Tên ngày lễ nếu trùng (Tết Dương lịch, 30/4, 1/5, 2/9...), null nếu ngày thường. */
  holiday: string | null;
}

export const WEEKDAY_FULL = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

/**
 * Chuẩn hóa tên Thứ tiếng Việt ("Thứ hai", "Thứ 2", "T2", "Chủ nhật", "CN"...)
 * Ưu tiên suy trực tiếp từ `eventDate` (YYYY-MM-DD) để đảm bảo Thứ và Ngày luôn khớp 100%.
 */
export function canonicalWeekdayVi(dayInput?: string | null, eventDate?: string | null): string {
  if (eventDate && /^\d{4}-\d{2}-\d{2}$/.test(eventDate.trim())) {
    const dt = fromIso(eventDate.trim());
    if (!Number.isNaN(dt.getTime())) {
      return WEEKDAY_FULL[dt.getDay()];
    }
  }
  const raw = String(dayInput || '').trim().toLowerCase();
  if (!raw) return 'Thứ Hai';
  if (/(chủ\s*nhật|chu\s*nhat|\bcn\b)/.test(raw)) return 'Chủ Nhật';
  if (/(thứ\s*bảy|thu\s*bay|thứ\s*7|thu\s*7|\bt7\b)/.test(raw)) return 'Thứ Bảy';
  if (/(thứ\s*sáu|thu\s*sau|thứ\s*6|thu\s*6|\bt6\b)/.test(raw)) return 'Thứ Sáu';
  if (/(thứ\s*năm|thu\s*nam|thứ\s*5|thu\s*5|\bt5\b)/.test(raw)) return 'Thứ Năm';
  if (/(thứ\s*tư|thu\s*tu|thứ\s*bốn|thứ\s*4|thu\s*4|\bt4\b)/.test(raw)) return 'Thứ Tư';
  if (/(thứ\s*ba|thu\s*ba|thứ\s*3|thu\s*3|\bt3\b)/.test(raw)) return 'Thứ Ba';
  if (/(thứ\s*hai|thu\s*hai|thứ\s*2|thu\s*2|\bt2\b)/.test(raw)) return 'Thứ Hai';
  return 'Thứ Hai';
}

export function weekDays(startIso: string): WeekDay[] {
  const today = todayIso();
  const end = addDays(startIso, 6);
  const holidayByName = new Map(holidaysInRange(startIso, end).map((h) => [h.date, h.name]));
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(startIso, i);
    const dow = fromIso(date).getDay();
    return {
      date,
      display_date: `${date.slice(8, 10)}/${date.slice(5, 7)}`,
      weekday: WEEKDAY_LABELS[dow],
      weekday_full: WEEKDAY_FULL[dow],
      is_today: date === today,
      is_weekend: dow === 0 || dow === 6,
      holiday: holidayByName.get(date) ?? null,
    };
  });
}

export function formatDdMmYyyy(iso: string): string {
  if (!iso || iso.length < 10) return iso || '';
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/** Thứ Hai của tuần ISO `week` trong năm `year`. */
export function mondayOfIsoWeek(week: number, year: number): string {
  const jan4 = new Date(year, 0, 4);
  return addDays(startOfWeek(toIso(jan4)), (week - 1) * 7);
}

