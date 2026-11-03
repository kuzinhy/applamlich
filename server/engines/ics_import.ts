/**
 * Đọc lịch .ics do Google Calendar / Outlook xuất ra.
 * Chỉ trích thông tin có thật trong tệp: không suy đoán giờ, không bịa tiêu đề.
 */

export interface IcsOccurrence {
  uid: string;
  title: string;
  event_date: string;
  start_time: string;
  end_time: string | null;
  all_day: boolean;
  location: string;
  content: string;
  organizer: string;
  participants: string;
  cancelled: boolean;
}

export interface IcsParseResult {
  occurrences: IcsOccurrence[];
  skipped: string[];
}

/** Múi giờ Việt Nam cố định UTC+7, không có mùa lệch giờ. */
const VN_OFFSET_MINUTES = 7 * 60;
/** Chặn tệp độc hại khai báo RRULE COUNT khổng lồ. */
const MAX_OCCURRENCES_PER_EVENT = 60;
const MAX_PROCESSED_EVENTS = 500;

function unfold(text: string): string[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const out: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length) {
      out[out.length - 1] += line.slice(1);
      continue;
    }
    out.push(line);
  }
  return out;
}

function unescapeText(value: string): string {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\r/gi, '')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

interface Property {
  name: string;
  params: string;
  value: string;
}

function splitProperty(line: string): Property | null {
  const colon = line.indexOf(':');
  if (colon <= 0) return null;
  const head = line.slice(0, colon);
  const semi = head.indexOf(';');
  return semi === -1
    ? { name: head.toUpperCase(), params: '', value: line.slice(colon + 1) }
    : { name: head.slice(0, semi).toUpperCase(), params: head.slice(semi + 1), value: line.slice(colon + 1) };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "20261028T073000Z" | "20261028T073000" | "20261028" -> {date, time|null} hoặc null khi sai dạng. */
function readTimeStamp(raw: string): { date: string; time: string | null } | null {
  const value = raw.trim();
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (dateOnly) {
    return { date: `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`, time: null };
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(value);
  if (!m) return null;
  const [, y, mo, d, h, mi, , zulu] = m;
  if (zulu) {
    // UTC -> giờ Việt Nam (UTC+7, không có mùa lệch giờ); ngày có thể nhảy sang hôm sau.
    const vn = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi)) + VN_OFFSET_MINUTES * 60000);
    return {
      date: `${vn.getUTCFullYear()}-${pad(vn.getUTCMonth() + 1)}-${pad(vn.getUTCDate())}`,
      time: `${pad(vn.getUTCHours())}:${pad(vn.getUTCMinutes())}`,
    };
  }
  // Giờ local ghi thẳng trong lịch (không có Z): giữa nguyên vì lịch cơ quan đã là giờ Việt Nam.
  return { date: `${y}-${mo}-${d}`, time: `${pad(Number(h))}:${pad(Number(mi))}` };
}

/** "PT1H30M", "PT45M", "P1D", "PT2H" -> số phút; null khi không hiểu. */
function readDuration(raw: string): number | null {
  const m = /^P(?:([0-9]+)D)?T?(?:(\d+)H)?(?:(\d+)M)?$/i.exec(raw.trim().toUpperCase());
  if (!m) return null;
  const minutes = Number(m[1] || 0) * 1440 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
  return minutes > 0 && minutes <= 7 * 1440 ? minutes : null;
}

function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** RRULE:FREQ=WEEKLY/DAILY chỉ sinh ngày lặp trong phạm vi an toàn, mặc định 8 lần. */
function weeklyDates(start: string, rrule: string): string[] {
  if (!rrule) return [];
  const parts = new Map(rrule.split(';').filter(Boolean).map((p) => {
    const [k, v = ''] = p.split('=');
    return [k.toUpperCase(), v] as [string, string];
  }));
  const freq = parts.get('FREQ');
  if (freq !== 'WEEKLY' && freq !== 'DAILY') return [];
  const interval = Math.min(Math.max(Number(parts.get('INTERVAL') || 1) || 1, 1), 31);
  const count = Math.min(Math.max(Number(parts.get('COUNT') || 8) || 8, 2), MAX_OCCURRENCES_PER_EVENT);
  const until = parts.get('UNTIL') ? readTimeStamp(parts.get('UNTIL') as string) : null;
  const untilDate = until?.date || null;
  const byDay = (parts.get('BYDAY') || '').split(',').map((s) => s.trim().slice(-2).toUpperCase()).filter(Boolean);
  const dates: string[] = [];

  if (freq === 'DAILY') {
    for (let i = 1; i < count; i += 1) {
      const date = addDaysIso(start, i * interval);
      if (untilDate && date > untilDate) break;
      dates.push(date);
    }
    return dates;
  }

  const dayOffset = (code: string) => {
    const index = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'].indexOf(code);
    return index === -1 ? null : index;
  };
  const weekdayOfStart = (new Date(`${start}T00:00:00`).getDay() + 6) % 7;
  const startMonday = addDaysIso(start, -weekdayOfStart);
  const limit = count - 1; // COUNT tính cả mốc đầu tiên nên chỉ sinh thêm phần còn lại

  // Quét từ tuần chứa mốc đầu tiên: BYDAY=FR phải lấy được thứ Sáu của chính tuần đó.
  for (let week = 0; dates.length < limit && week <= MAX_OCCURRENCES_PER_EVENT; week += 1) {
    const weekMonday = addDaysIso(startMonday, week * 7 * interval);
    const candidates = byDay.length
      ? byDay.map(dayOffset).filter((o): o is number => o !== null).sort((a, b) => a - b).map((o) => addDaysIso(weekMonday, o))
      : [addDaysIso(start, week * 7 * interval)];
    for (const date of candidates) {
      if (date <= start) continue;
      if (untilDate && date > untilDate) return dates.slice(0, limit);
      if (!dates.includes(date)) dates.push(date);
    }
  }
  return dates.slice(0, limit);
}

export function parseIcsCalendar(text: string): IcsParseResult {
  const lines = unfold(String(text || ''));
  const skipped: string[] = [];
  const occurrences: IcsOccurrence[] = [];
  let inEvent = false;
  let current: Record<string, string> = {};
  let attendees: string[] = [];
  let seenEvents = 0;

  /** "CN=Nguyễn Văn A;ROLE=REQ-PARTICIPANT" -> "Nguyễn Văn A"; không có CN thì lấy chuỗi email. */
  const displayName = (params: string, value: string) => {
    const cn = /CN="?([^";]*)"?/i.exec(params);
    if (cn && cn[1].trim()) return cn[1].trim();
    return unescapeText(value).replace(/^mailto:/i, '').trim();
  };

  for (const line of lines) {
    const prop = splitProperty(line);
    if (!prop) continue;
    if (prop.name === 'BEGIN' && prop.value.toUpperCase() === 'VEVENT') {
      if (seenEvents >= MAX_PROCESSED_EVENTS) {
        skipped.push('Dừng đọc vì tệp có quá nhiều sự kiện (giới hạn 500).');
        break;
      }
      inEvent = true;
      seenEvents += 1;
      current = {};
      attendees = [];
      continue;
    }
    if (prop.name === 'END' && prop.value.toUpperCase() === 'VEVENT') {
      inEvent = false;
      const start = readTimeStamp(current.DTSTART || '');
      const title = unescapeText(current.SUMMARY || '').trim();
      if (!start) {
        if (title || current.UID) skipped.push(`Bỏ qua "${title || current.UID}": thiếu ngày bắt đầu hợp lệ.`);
        continue;
      }
      if (!title) {
        skipped.push(`Bỏ qua một sự kiện ngày ${start.date}: tiêu đề trống.`);
        continue;
      }
      let end: { date: string; time: string | null } | null = current.DTEND
        ? readTimeStamp(current.DTEND)
        : null;
      if (!end && current.DURATION) {
        const minutes = readDuration(current.DURATION);
        const startMinutes = start.time ? Number(start.time.slice(0, 2)) * 60 + Number(start.time.slice(3, 5)) : null;
        if (minutes && startMinutes !== null) {
          const total = startMinutes + minutes;
          end = {
            date: total >= 1440 ? addDaysIso(start.date, 1) : start.date,
            time: `${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`,
          };
        }
      }
      const base: IcsOccurrence = {
        uid: String(current.UID || '').trim(),
        title,
        event_date: start.date,
        start_time: start.time || '07:00',
        end_time: end?.time || null,
        all_day: start.time === null,
        location: unescapeText(current.LOCATION || '').trim(),
        content: unescapeText(current.DESCRIPTION || '').trim(),
        organizer: current.ORGANIZER || '',
        participants: attendees.join(', '),
        cancelled: String(current.STATUS || '').toUpperCase() === 'CANCELLED',
      };
      occurrences.push(base);
      for (const date of weeklyDates(start.date, current.RRULE || '')) {
        occurrences.push({ ...base, uid: `${base.uid}#${date}`, event_date: date, cancelled: false });
      }
      continue;
    }
    if (!inEvent) continue;
    if (prop.name === 'ATTENDEE') {
      const name = displayName(prop.params, prop.value);
      if (name && !attendees.includes(name) && attendees.length < 30) attendees.push(name);
      continue;
    }
    if (prop.name === 'ORGANIZER') {
      current.ORGANIZER = displayName(prop.params, prop.value);
      continue;
    }
    current[prop.name] = prop.value;
  }

  return { occurrences, skipped };
}
