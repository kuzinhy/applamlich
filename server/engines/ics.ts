import type { EventRecord } from '../types.ts';
import { parseClock, durationOf } from './conflict.ts';

const TZID = 'Asia/Ho_Chi_Minh';
const stamp = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');

function localStamp(date: string, minutes: number): string {
  const day = date.replace(/-/g, '');
  const h = String(Math.floor(minutes / 60)).padStart(2, '0');
  const m = String(minutes % 60).padStart(2, '0');
  return `${day}T${h}${m}00`;
}

function esc(value: string): string {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Gãy dòng theo RFC 5545 (75 octet) để Google Calendar/Outlook không từ chối file. */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest, 'utf8') > 75) {
    let cut = 75;
    while (cut > 0 && Buffer.byteLength(rest.slice(0, cut), 'utf8') > 75) cut -= 1;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  out.push(rest);
  return out.join('\r\n ');
}

export function buildIcs(events: EventRecord[], calendarName: string): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TuyenGiaoCalendarAI//Lich cong tac phuong//VN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    fold(`X-WR-CALNAME:${esc(calendarName)}`),
    `X-WR-TIMEZONE:${TZID}`,
  ];

  for (const ev of events) {
    const start = parseClock(ev.start_time);
    if (!ev.event_date || start === null) continue;
    const uid = `${ev.id}@applamlich.local`;
    lines.push(
      'BEGIN:VEVENT',
      fold(`UID:${uid}`),
      `DTSTAMP:${stamp(new Date(ev.updated_at || Date.now()).toISOString())}`,
      `DTSTART;TZID=${TZID}:${localStamp(ev.event_date, start)}`,
      `DTEND;TZID=${TZID}:${localStamp(ev.event_date, start + durationOf(ev))}`,
      fold(`SUMMARY:${esc(ev.title || 'Lịch công tác')}`),
      fold(`DESCRIPTION:${esc([ev.content, ev.preparation && `Chuẩn bị: ${ev.preparation}`, ev.source_document && `Nguồn: ${ev.source_document}`].filter(Boolean).join('\n'))}`),
      fold(`LOCATION:${esc(ev.location)}`),
      `STATUS:${ev.status === 'PUBLISHED' || ev.status === 'APPROVED' ? 'CONFIRMED' : 'TENTATIVE'}`,
      `PRIORITY:${Math.max(1, 100 - (ev.priority_score || 50))}`,
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
