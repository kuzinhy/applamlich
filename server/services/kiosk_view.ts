/**
 * Lớp trình diễn màn hình TV (kiosk) cho lịch công tác.
 *
 * Toàn bộ hàm thuần, không đọc kho, không gọi AI: nhận sự kiện + thời điểm, trả khung hình.
 * Logic mô phỏng theo hệ thống chiếu TV dùng Apps Script mà cơ quan đang chạy, nhưng chỉ
 * lấy dữ liệu lịch ĐÃ DUYỆT/ĐÃ BAN HÀNH của ứng dụng — không tự sinh sự kiện, không tự đoán giờ.
 */

import { WEEKDAY_FULL, addDays, formatDdMmYyyy, fromIso } from '../utils/dates.ts';
import type { EventRecord } from '../types.ts';

/** Một khung lịch trên màn TV sau khi đã gom các dòng trùng. */
export interface KioskFrame {
  id: string;
  date: string;
  weekday: string;
  session: string;
  start_time: string;
  end_time: string;
  /** Phút từ 00:00, lấy theo mốc sớm nhất; null khi lịch không ghi giờ. */
  start_minutes: number | null;
  end_minutes: number | null;
  title: string;
  content: string;
  chair: string;
  participants: string;
  location: string;
  preparation: string;
  supplemental: boolean;
  supplemental_note: string;
  /** true khi khung này đang thật sự diễn ra tại thời điểm sinh payload. */
  is_current: boolean;
}

export interface KioskNotice {
  label: string;
  text: string;
}

export interface KioskPayload {
  generated_at: string;
  /** Phút kể từ 00:00 tại thời điểm sinh payload — máy TV dùng để tự tính trạng thái. */
  now_minutes: number;
  today: string;
  tomorrow: string;
  today_display: string;
  tomorrow_display: string;
  week: { start: string; end: string; number: number; display: string };
  org_name: string;
  screen_title: string;
  document_number: string;
  signer: string;
  config: {
    /** Số giây màn TV tự nạp lại; lấy từ query string, giới hạn 30–3600. */
    refresh_seconds: number;
    /** Số phút hiển thị một lịch không ghi giờ kết thúc. */
    current_fallback_minutes: number;
  };
  current_events: KioskFrame[];
  upcoming_today: KioskFrame[];
  tomorrow_events: KioskFrame[];
  notices: KioskNotice[];
}

export interface BuildKioskArgs {
  events: EventRecord[];
  now: Date;
  meta: {
    week_start: string;
    week_end: string;
    week_number: number;
    document_number?: string;
    signer?: string;
    unit_name?: string;
  };
  /** Override từ query string, đã được route kiểm tra kiểu. */
  refresh_seconds?: number;
  fallback_minutes?: number;
}

/** Mặc định của Apps Script gốc: thoi_luong_hien_tai_mac_dinh_phut = 120. */
export const DEFAULT_FALLBACK_MINUTES = 120;
/** Màn TV tự làm mới sau 5 phút (tu_dong_lam_moi_giay = 300 trong bản gốc). */
export const DEFAULT_REFRESH_SECONDS = 300;

/** "7:30" → "07:30"; "07:10 / 07:30" giữ nguyên vì đã là chuỗi hiển thị đã gom. */
export function normalizeClock(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const m = raw.match(/^(\d{1,2}):(\d{2})$/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : raw;
}

/**
 * Giờ hiển thị → phút. Chấp nhận cả chuỗi đã gom ("07:10 / 07:30", lấy mốc đầu)
 * và giờ lẻ kiểu "7h30" / "7 giờ 30" mà văn bản hay ghi.
 */
export function clockToMinutes(value: unknown): number | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const first = raw.split('/')[0].trim();
  const m = first.match(/^(\d{1,2})\s*(?:[:h]|giờ|gio)\s*(\d{2})/i);
  if (!m) return null;
  const h = Number(m[1]);
  const minute = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(minute) || h > 23 || minute > 59) return null;
  return h * 60 + minute;
}

/** Bỏ dấu tiếng Việt + gộp khoảng trắng, dùng để nhận hai dòng cùng một hoạt động. */
export function stripVietnameseDiacritics(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Buổi theo giờ: trước 12:00 là Sáng, sau đó là Chiều; không có giờ thì để trống. */
export function sessionOf(minutes: number | null): string {
  if (minutes === null) return '';
  return minutes < 12 * 60 ? 'Sáng' : 'Chiều';
}

function uniqueTexts(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const text = String(v || '').trim();
    if (!text) continue;
    const key = stripVietnameseDiacritics(text);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

/** Sự kiện kho → khung lịch thô, chưa gom. */
export function toFrame(event: EventRecord): KioskFrame {
  const startTime = normalizeClock(event.start_time);
  const endTime = normalizeClock(event.end_time);
  const startMinutes = clockToMinutes(startTime);
  return {
    id: String(event.id || ''),
    date: String(event.event_date || ''),
    weekday: event.event_date ? WEEKDAY_FULL[fromIso(event.event_date).getDay()] : '',
    session: sessionOf(startMinutes),
    start_time: startTime,
    end_time: endTime,
    start_minutes: startMinutes,
    end_minutes: clockToMinutes(endTime),
    title: String(event.title || '').trim(),
    content: String(event.content || '').trim(),
    chair: String(event.chair || '').trim(),
    participants: String(event.participants || '').trim(),
    location: String(event.location || '').trim(),
    preparation: String(event.preparation || '').trim(),
    supplemental: Boolean(event.is_supplemental),
    supplemental_note: String(event.supplemental_note || '').trim(),
    is_current: false,
  };
}

function textCompare(a: KioskFrame, b: KioskFrame): number {
  const dateCompare = String(a.date || '').localeCompare(String(b.date || ''));
  if (dateCompare !== 0) return dateCompare;
  const timeA = a.start_minutes === null ? Number.MAX_SAFE_INTEGER : a.start_minutes;
  const timeB = b.start_minutes === null ? Number.MAX_SAFE_INTEGER : b.start_minutes;
  if (timeA !== timeB) return timeA - timeB;
  return String(a.title || '').localeCompare(String(b.title || ''), 'vi');
}

/**
 * Gộp các dòng cùng ngày + cùng buổi + cùng tiêu đề (so sánh sau khi bỏ dấu) thành MỘT khung.
 * Ví dụ hai lãnh đạo dự cùng Lễ Tổng kết lúc 07:10 và 07:30 → một khung "07:10 / 07:30",
 * mỗi dòng thành phần/địa điểm được gắn thêm mốc giờ của dòng đó để không mất thông tin.
 */
export function mergeFrameGroup(group: KioskFrame[]): KioskFrame | null {
  if (!group || group.length === 0) return null;
  const sorted = group.slice().sort(textCompare);
  const first = sorted[0];
  if (sorted.length === 1) return first;

  const times = uniqueTexts(sorted.map((e) => e.start_time));
  const endTimes = uniqueTexts(sorted.map((e) => e.end_time));
  const hasMultipleTimes = times.length > 1;

  const startList = sorted.map((e) => e.start_minutes).filter((v): v is number => v !== null);
  const endList = sorted.map((e) => e.end_minutes).filter((v): v is number => v !== null);

  const mergeField = (pick: (e: KioskFrame) => string): string => {
    const seen = new Set<string>();
    const parts: string[] = [];
    for (const e of sorted) {
      const text = pick(e);
      if (!text) continue;
      const display = hasMultipleTimes && e.start_time ? `${e.start_time}: ${text}` : text;
      const key = stripVietnameseDiacritics(display);
      if (seen.has(key)) continue;
      seen.add(key);
      parts.push(display);
    }
    return parts.join('; ');
  };

  return {
    ...first,
    id: sorted.map((e) => e.id).join('__'),
    start_time: times.length ? times.join(' / ') : first.start_time,
    end_time: endTimes.length ? endTimes.join(' / ') : first.end_time,
    start_minutes: startList.length ? Math.min(...startList) : first.start_minutes,
    end_minutes: endList.length ? Math.max(...endList) : first.end_minutes,
    title: first.title,
    content: mergeField((e) => e.content),
    chair: mergeField((e) => e.chair),
    participants: mergeField((e) => e.participants),
    location: mergeField((e) => e.location),
    preparation: mergeField((e) => e.preparation),
    supplemental: sorted.some((e) => e.supplemental),
    supplemental_note: mergeField((e) => e.supplemental_note),
    is_current: false,
  };
}

/** Gom khung rồi sắp xếp theo ngày → giờ → tiêu đề. */
export function groupFrames(frames: KioskFrame[]): KioskFrame[] {
  const groups = new Map<string, KioskFrame[]>();
  for (const frame of frames) {
    const titleKey = stripVietnameseDiacritics(frame.title);
    const key = titleKey
      ? `${frame.date}|${frame.session}|${titleKey}`
      : `single|${frame.id}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(frame);
    else groups.set(key, [frame]);
  }
  const merged: KioskFrame[] = [];
  for (const bucket of groups.values()) {
    const frame = mergeFrameGroup(bucket);
    if (frame) merged.push(frame);
  }
  return merged.sort(textCompare);
}

/**
 * Khung đang diễn ra tại `currentMinutes`.
 * 1. Có giờ kết thúc: start <= now <= end. Không có giờ kết thúc: thêm `fallbackMinutes` phút.
 * 2. Chưa tới lịch đầu tiên trong ngày → hiển thị lịch đầu tiên (gán is_current = false,
 *    màn TV gắn nhãn "Sắp diễn ra" để không nói dối rằng việc đang xảy ra).
 * 3. Qua hết mốc fallback → trả rỗng.
 */
export function findCurrentEvents(
  todayEvents: KioskFrame[],
  currentMinutes: number,
  fallbackMinutes: number,
): KioskFrame[] {
  if (todayEvents.length === 0) return [];
  const timed = todayEvents.filter((e) => e.start_minutes !== null);
  if (timed.length === 0) return [];

  const active = timed
    .filter((e) => {
      const start = e.start_minutes as number;
      const end = e.end_minutes !== null ? e.end_minutes : start + fallbackMinutes;
      return start <= currentMinutes && currentMinutes <= end;
    })
    .map((e) => ({ ...e, is_current: true }));
  if (active.length) return active.sort(textCompare);

  const upcoming = timed
    .filter((e) => (e.start_minutes as number) > currentMinutes)
    .sort(textCompare);
  if (upcoming.length) {
    const firstMinute = upcoming[0].start_minutes as number;
    return timed.filter((e) => e.start_minutes === firstMinute).map((e) => ({ ...e, is_current: false }));
  }
  return [];
}

/** Mốc giờ "HH:mm" của một Date theo giờ máy chủ. */
function minutesOfDay(now: Date): number {
  return now.getHours() * 60 + now.getMinutes();
}

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Dòng chạy dưới chân màn TV. Chỉ lấy các mục được cán bộ đánh dấu "lịch bổ sung"
 * kèm ghi chú thật của họ; không tự suy ra điều chỉnh từ thay đổi giờ.
 */
export function buildNotices(frames: KioskFrame[]): KioskNotice[] {
  const notices: KioskNotice[] = [];
  const seen = new Set<string>();
  for (const frame of frames.filter((e) => e.supplemental)) {
    const when = `${frame.start_time ? `${frame.start_time} ` : ''}ngày ${formatDdMmYyyy(frame.date)}`;
    const detail = frame.supplemental_note
      ? `${frame.title} — ${frame.supplemental_note}`
      : `${frame.title} (${when})`;
    const text = `Lịch bổ sung: ${detail}`;
    const key = stripVietnameseDiacritics(text);
    if (seen.has(key)) continue;
    seen.add(key);
    notices.push({ label: 'Lịch bổ sung', text });
  }
  return notices;
}

/**
 * Sinh toàn bộ dữ liệu cho một màn TV.
 * Sự kiện đầu vào phải là lịch đã duyệt/đã ban hành; hàm này không lọc trạng thái
 * (route chịu trách nhiệm đó) và không bịa thêm bất kỳ khung nào.
 */
export function buildKioskPayload(args: BuildKioskArgs): KioskPayload {
  const { events, now, meta } = args;
  const fallbackMinutes = clampPositive(args.fallback_minutes, DEFAULT_FALLBACK_MINUTES, 15, 600);
  const refreshSeconds = clampPositive(args.refresh_seconds, DEFAULT_REFRESH_SECONDS, 30, 3600);

  const currentMinutes = minutesOfDay(now);
  const today = isoOf(now);
  const tomorrow = addDays(today, 1);

  const grouped = groupFrames(events.map(toFrame));
  const todayEvents = grouped.filter((e) => e.date === today);
  const tomorrowEvents = grouped.filter((e) => e.date === tomorrow);

  const currentEvents = findCurrentEvents(todayEvents, currentMinutes, fallbackMinutes);
  const currentIds = new Set(currentEvents.map((e) => e.id));
  const upcomingToday = todayEvents.filter((e) => {
    if (currentIds.has(e.id)) return false;
    if (e.start_minutes === null) return true;
    return e.start_minutes > currentMinutes;
  });

  return {
    generated_at: now.toISOString(),
    now_minutes: currentMinutes,
    today,
    tomorrow,
    today_display: formatDdMmYyyy(today),
    tomorrow_display: formatDdMmYyyy(tomorrow),
    week: {
      start: meta.week_start,
      end: meta.week_end,
      number: meta.week_number,
      display: `${formatDdMmYyyy(meta.week_start)} – ${formatDdMmYyyy(meta.week_end)}`,
    },
    org_name: String(meta.unit_name || '').trim(),
    screen_title: 'Lịch làm việc cơ quan',
    document_number: String(meta.document_number || '').trim(),
    signer: String(meta.signer || '').trim(),
    config: { refresh_seconds: refreshSeconds, current_fallback_minutes: fallbackMinutes },
    current_events: currentEvents,
    upcoming_today: upcomingToday,
    tomorrow_events: tomorrowEvents,
    notices: buildNotices(grouped),
  };
}

function clampPositive(value: number | undefined, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Chuỗi giờ hiển thị dạng "14:05" cho đồng hồ trên màn TV. */
export function clockLabel(now: Date): string {
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}
