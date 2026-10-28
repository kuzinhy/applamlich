import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseIcsCalendar } from '../engines/ics_import.ts';
import { buildIcs } from '../engines/ics.ts';
import { migrateState, normalizeTask, normalizeTasks, SCHEMA_VERSION } from '../store.ts';
import { coerceAiEvent } from '../engines/extractor.ts';
import { EVENT_TASK_LIMIT } from '../types.ts';
import type { EventRecord } from '../types.ts';

const CTX = { source_doc: 'Thông báo 15/TB-UBND', source_id: null, source_priority: 70, week_start: '2026-10-26' };

function calendar(...eventLines: string[]): string {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', ...eventLines, 'END:VCALENDAR'].join('\r\n');
}

function event(...lines: string[]): string {
  return ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n');
}

// ---------------------------------------------------------------- đọc .ics

test('parseIcsCalendar đọc giờ local giữ nguyên, giờ UTC cộng sang giờ Việt Nam', () => {
  const { occurrences } = parseIcsCalendar(calendar(
    event(
      'UID:local-1',
      'SUMMARY:Họp giao ban',
      'DTSTART;TZID=Asia/Ho_Chi_Minh:20261026T073000',
      'DTEND;TZID=Asia/Ho_Chi_Minh:20261026T090000',
      'LOCATION:Phòng họp UBND',
    ),
    event(
      'UID:utc-1',
      'SUMMARY:Hội nghị trực tuyến',
      'DTSTART:20261026T230000Z',
      'DTEND:20261027T003000Z',
    ),
  ));

  assert.equal(occurrences.length, 2);
  assert.deepEqual(
    { date: occurrences[0].event_date, start: occurrences[0].start_time, end: occurrences[0].end_time },
    { date: '2026-10-26', start: '07:30', end: '09:00' },
  );
  assert.equal(occurrences[0].location, 'Phòng họp UBND');
  // 23:00 UTC = 06:00 sáng hôm sau ở Việt Nam
  assert.equal(occurrences[1].event_date, '2026-10-27');
  assert.equal(occurrences[1].start_time, '06:00');
  assert.equal(occurrences[1].end_time, '07:30');
});

test('parseIcsCalendar tính giờ kết thúc từ DURATION và nhận sự kiện cả ngày', () => {
  const { occurrences } = parseIcsCalendar(calendar(
    event('UID:d1', 'SUMMARY:Lớp bồi dưỡng', 'DTSTART:20261028T130000', 'DURATION:PT1H30M'),
    event('UID:d2', 'SUMMARY:Ngày hội đọc sách', 'DTSTART;VALUE=DATE:20261029', 'DTEND;VALUE=DATE:20261030'),
  ));

  assert.equal(occurrences[0].end_time, '14:30');
  assert.equal(occurrences[0].all_day, false);
  assert.equal(occurrences[1].event_date, '2026-10-29');
  assert.equal(occurrences[1].all_day, true);
  assert.equal(occurrences[1].start_time, '07:00');
});

test('parseIcsCalendar giãn khai báo RRULE hằng tuần, có BYDAY và COUNT', () => {
  const weekly = parseIcsCalendar(calendar(
    event('UID:r1', 'SUMMARY:Sinh hoạt chi bộ', 'DTSTART:20261026T070000', 'RRULE:FREQ=WEEKLY;COUNT=4'),
  )).occurrences;
  assert.deepEqual(weekly.map((o) => o.event_date), ['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16']);

  const byday = parseIcsCalendar(calendar(
    event('UID:r2', 'SUMMARY:Trực lãnh đạo', 'DTSTART:20261026T070000', 'RRULE:FREQ=WEEKLY;BYDAY=MO,FR;COUNT=3'),
  )).occurrences;
  // Thứ Hai tuần sau và thứ Sáu tuần sau, không lặp lại ngày đã có
  assert.deepEqual(byday.map((o) => o.event_date), ['2026-10-26', '2026-10-30', '2026-11-02']);
  assert.ok(byday.slice(1).every((o) => o.uid.startsWith('r2#')));
});

test('parseIcsCalendar chặn RRULE COUNT quá lớn và bỏ sự kiện đã huỷ/trống tiêu đề', () => {
  const huge = parseIcsCalendar(calendar(
    event('UID:h1', 'SUMMARY:Chuyên đề', 'DTSTART:20261026T070000', 'RRULE:FREQ=DAILY;COUNT=100000'),
  ));
  assert.equal(huge.occurrences.length, 60);

  const mixed = parseIcsCalendar(calendar(
    event('UID:c1', 'SUMMARY:Việc đã huỷ', 'DTSTART:20261026T070000', 'STATUS:CANCELLED'),
    event('UID:c2', 'DTSTART:20261026T080000'),
    event('UID:c3', 'SUMMARY:Việc không có ngày'),
  ));
  assert.equal(mixed.occurrences.length, 1);
  assert.equal(mixed.occurrences[0].cancelled, true);
  assert.equal(mixed.skipped.length, 2);
});

test('parseIcsCalendar nối dòng gấp và mở mã ký tự RFC 5545', () => {
  const { occurrences } = parseIcsCalendar(calendar(
    event(
      'UID:f1',
      'SUMMARY:Họp về công tác giải phóng m',
      ' ặt bằng khu dân cư',
      'DESCRIPTION:Kèm báo cáo 15 trang\\, in 30 bản\\nPhô tô trước giờ họp',
      'DTSTART:20261026T070000',
    ),
  ));
  assert.equal(occurrences[0].title, 'Họp về công tác giải phóng mặt bằng khu dân cư');
  assert.ok(occurrences[0].content.includes('in 30 bản'));
  assert.ok(occurrences[0].content.includes('\n'));
});

test('lịch do app xuất ra đọc lại được bằng chính bộ nhập .ics', () => {
  const now = '2026-10-20T00:00:00.000Z';
  const eventRecord = {
    id: 'ev1', source_id: null, source_document: '', source_page: null, source_paragraph: null,
    event_date: '2026-10-26', start_time: '08:00', end_time: '10:00',
    title: 'Kiểm tra công trình', content: 'Tại tổ 4', chair: '', participants: '', participant_group: '',
    location: 'Tổ 4, phường An Bình', organizer: '', preparation: '', documents_required: '', contact_person: '',
    priority_score: 60, confidence: 1, status: 'PUBLISHED', missing_data_fields: [], leaders: [], also_from: [],
    tasks: [], series_id: null, created_at: now, updated_at: now,
  } satisfies EventRecord;

  const roundTrip = parseIcsCalendar(buildIcs([eventRecord], 'Lịch tuần')).occurrences;
  assert.equal(roundTrip.length, 1);
  assert.equal(roundTrip[0].event_date, '2026-10-26');
  assert.equal(roundTrip[0].start_time, '08:00');
  assert.equal(roundTrip[0].end_time, '10:00');
  assert.equal(roundTrip[0].title, 'Kiểm tra công trình');
});

// ---------------------------------------------------------------- việc chuẩn bị

test('normalizeTask chấp nhận dạng cũ là chuỗi và chỉ nhận ngày hợp lệ', () => {
  assert.equal(normalizeTask('In tài liệu')?.text, 'In tài liệu');
  assert.equal(normalizeTask({ text: '  ', owner: 'A' }), null);
  assert.equal(normalizeTask({ text: 'Báo cáo', due_date: '31/10/2026' })?.due_date, '');
  assert.equal(normalizeTask({ text: 'Báo cáo', due_date: '2026-10-31' })?.due_date, '2026-10-31');
});

test('normalizeTask gắn thời điểm hoàn thành và normalizeTasks cắt theo giới hạn', () => {
  const done = normalizeTask({ text: 'Xong việc', done: true });
  assert.match(String(done?.done_at), /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(normalizeTask({ text: 'Chưa làm' })?.done_at, null);
  assert.equal(
    normalizeTasks(Array.from({ length: EVENT_TASK_LIMIT + 10 }, (_, i) => ({ text: `việc ${i}` }))).length,
    EVENT_TASK_LIMIT,
  );
});

test('coerceAiEvent luôn khởi tạo tasks và series_id để không vỡ dạng bản ghi', () => {
  const ev = coerceAiEvent({ event_date: '2026-10-28', title: 'Họp', start_time: '08:00' }, CTX);
  assert.deepEqual(ev.tasks, []);
  assert.equal(ev.series_id, null);
});

// ---------------------------------------------------------------- nâng cấp schema v7

test('migrateState nâng kho v6 lên v7: thêm tasks/series_id, thùng rác và nhật ký chia sẻ', () => {
  const v6 = {
    schema_version: 6,
    events: [{ id: 'e1', event_date: '2026-10-26', start_time: '08:00', title: 'Họp giao ban', preparation: 'In tài liệu' }],
    sources: [],
    settings: { unit_name: 'UBND Phường An Bình' },
    audit_log: [],
    publications: [
      { id: 'p1', week_start: '2026-10-26', week_end: '2026-11-01', document_number: '12-LCT/VP', event_ids: ['e1'] },
    ],
  };
  const state = migrateState(structuredClone(v6));

  assert.equal(state.schema_version, SCHEMA_VERSION);
  assert.deepEqual(state.events[0].tasks, []);
  assert.equal(state.events[0].series_id, null);
  assert.deepEqual(state.trash, []);
  assert.deepEqual(state.share_access, []);
  assert.equal(state.publications[0].share_token, '');
});

test('migrateState giữ token chia sẻ hợp lệ, bỏ token lạ và giới hạn thùng rác', () => {
  const token = 'a'.repeat(32);
  const state = migrateState({
    schema_version: SCHEMA_VERSION,
    events: [],
    publications: [
      { id: 'p1', week_start: '2026-10-26', event_ids: [], share_token: token },
      { id: 'p2', week_start: '2026-11-02', event_ids: [], share_token: '../../etc/passwd' },
    ],
    trash: Array.from({ length: 120 }, (_, i) => ({
      id: `t${i}`,
      deleted_at: '2026-10-01T00:00:00.000Z',
      deleted_by: null,
      event: { id: `e${i}`, event_date: '2026-10-26', start_time: '07:00', title: `Việc ${i}` },
    })),
  });

  assert.equal(state.publications[0].share_token, token);
  assert.equal(state.publications[1].share_token, '');
  assert.equal(state.trash.length, 100);
  assert.equal(state.trash[0].event.title, 'Việc 20');
  assert.deepEqual(state.trash[0].event.tasks, []);
});
