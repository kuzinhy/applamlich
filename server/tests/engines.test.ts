import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseClock, formatClock, durationOf, locationBuffer, shareLeader, analyzeConflicts } from '../engines/conflict.ts';
import { normalizeTime, extractDate } from '../engines/extractor.ts';
import { foldVietnamese, similarity, upsertEvents } from '../services/merge.ts';
import { checkDocumentFormat } from '../engines/format_check.ts';
import { findFreeSlots } from '../engines/free_slots.ts';
import { planConflictResolutions } from '../engines/optimizer.ts';
import { buildWeekReport, buildMonthReport } from '../services/report_data.ts';
import { holidaysInRange, holidaysInYear } from '../utils/vn_holidays.ts';
import { weekDays, isoWeekNumber, mondayOfIsoWeek, startOfWeek } from '../utils/dates.ts';
import { DEFAULT_SETTINGS } from '../types.ts';
import type { ConflictRecord, EventRecord, SettingsRecord } from '../types.ts';

const BUFFERS = { sameBuilding: 5, sameWard: 15, sameCity: 30, outsideArea: 60 };

function ev(over: Partial<EventRecord> = {}): EventRecord {
  return {
    id: over.id || `ev-${Math.random().toString(36).slice(2, 8)}`,
    source_id: null,
    source_document: '',
    source_page: null,
    source_paragraph: null,
    event_date: '2026-10-26',
    start_time: '08:00',
    end_time: '09:30',
    title: 'Họp',
    content: '',
    chair: '',
    participants: '',
    participant_group: '',
    location: '',
    organizer: '',
    preparation: '',
    documents_required: '',
    contact_person: '',
    priority_score: 5,
    confidence: 0.8,
    status: 'APPROVED',
    missing_data_fields: [],
    leaders: [],
    also_from: [],
    tasks: [],
    series_id: null,
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
    ...over,
  };
}

function settings(over: Partial<SettingsRecord> = {}): SettingsRecord {
  return { ...DEFAULT_SETTINGS, ...over };
}

// ---------------------------------------------------------------- giờ giấc

test('parseClock đọc được các kiểu ghi giờ tiếng Việt', () => {
  assert.equal(parseClock('8h30'), 510);
  assert.equal(parseClock('08:30'), 510);
  assert.equal(parseClock('8:05'), 485);
  assert.equal(parseClock('23h59'), 1439);
  assert.equal(parseClock(null), null);
  assert.equal(parseClock(''), null);
  assert.equal(parseClock('sáng mai'), null);
  assert.equal(parseClock('25:00'), null, 'giờ ngoài 23 phải bị từ chối');
});

test('formatClock kẹp trong khoảng 00:00–23:59', () => {
  assert.equal(formatClock(510), '08:30');
  assert.equal(formatClock(-30), '00:00');
  assert.equal(formatClock(25 * 60), '23:59');
});

test('durationOf mặc định 90 phút khi thiếu/giờ kết thúc vô lý', () => {
  assert.equal(durationOf(ev({ start_time: '08:00', end_time: '09:30' })), 90);
  assert.equal(durationOf(ev({ start_time: '08:00', end_time: null })), 90);
  assert.equal(durationOf(ev({ start_time: '08:00', end_time: '07:00' })), 90, 'end <= start phải về mặc định');
  assert.equal(durationOf(ev({ start_time: '08:00', end_time: '10:00' })), 120);
});

test('normalizeTime chuẩn hoá giờ và đoán buổi chiều theo ngữ cảnh', () => {
  assert.equal(normalizeTime('8h30'), '08:30');
  assert.equal(normalizeTime('8 giờ 30'), '08:30');
  assert.equal(normalizeTime('13:00'), '13:00');
  assert.equal(normalizeTime('8h', 'cuộc họp buổi chiều'), '20:00');
  assert.equal(normalizeTime('7 giờ', 'Buổi chiều tại trụ sở'), '19:00');
  assert.equal(normalizeTime('9:00', 'buổi sáng'), '09:00');
  assert.equal(normalizeTime('99:99'), null);
  assert.equal(normalizeTime(''), null);
});

// ---------------------------------------------------------------- ngày tháng

test('extractDate ưu tiên ISO rồi tới ngày kiểu Việt Nam', () => {
  assert.equal(extractDate('Lịch làm việc ngày 24/10/2026', 2026), '2026-10-24');
  assert.equal(extractDate('Họp 24/10 tại trụ sở', 2026), '2026-10-24');
  assert.equal(extractDate('Kèm 2026-10-05 để đối chiếu', 2025), '2026-10-05', 'ISO phải thắng');
  assert.equal(extractDate('Thứ Tư ngày 28/10/2026', 2026), '2026-10-28');
  assert.equal(extractDate('Không có ngày tháng gì', 2026), null);
  assert.equal(extractDate('ngày 32/13/2026', 2026), null, 'ngày/tháng ngoài khoảng phải trả null');
});

// ---------------------------------------------------------------- tuần + lễ

test('weekDays trả về 7 ngày liên tiếp với cờ cuối tuần và nhãn ngày đúng', () => {
  const days = weekDays('2026-10-26');
  assert.equal(days.length, 7);
  assert.equal(days[0].date, '2026-10-26');
  assert.equal(days[6].date, '2026-11-01');
  for (const d of days) {
    const dow = new Date(`${d.date}T00:00:00`).getDay();
    assert.equal(d.is_weekend, dow === 0 || dow === 6, `${d.date} phải khớp thứ thực tế`);
    assert.equal(d.display_date, `${d.date.slice(8, 10)}/${d.date.slice(5, 7)}`);
  }
});

test('tuần chứa 30/4 và 1/5 đánh dấu cả hai ngày lễ', () => {
  const days = weekDays('2026-04-27');
  const withHoliday = days.filter((d) => d.holiday).map((d) => d.date);
  assert.deepEqual(withHoliday.sort(), ['2026-04-30', '2026-05-01']);
  assert.match(days.find((d) => d.date === '2026-04-30')?.holiday || '', /giải phóng miền Nam/i);
  assert.equal(days.find((d) => d.date === '2026-04-27')?.holiday, null, 'ngày thường phải null');
});

test('holidaysInYear sắp xếp tăng dần và holidaysInRange đóng hai đầu', () => {
  const y = holidaysInYear(2026);
  assert.deepEqual(y.map((h) => h.date), [...y.map((h) => h.date)].sort());
  assert.ok(y.some((h) => h.date === '2026-09-02' && h.kind === 'holiday'));
  assert.ok(y.some((h) => h.date === '2026-07-27' && h.kind === 'observe'));
  assert.deepEqual(holidaysInRange('2026-06-30', '2026-07-01'), [], 'khoảng không chứa lễ phải rỗng');
  assert.equal(holidaysInRange('2026-07-27', '2026-07-27').length, 1, 'ngày lễ ở biên vẫn được tính');
  assert.equal(holidaysInRange('2026-09-01', '2027-01-02').length, 2, 'khoảng vắt năm lấy đủ cả hai năm');
});

test('isoWeekNumber / mondayOfIsoWeek / startOfWeek khớp nhau', () => {
  assert.equal(isoWeekNumber('2026-10-26'), 44);
  assert.equal(mondayOfIsoWeek(44, 2026), '2026-10-26');
  assert.equal(startOfWeek('2026-10-26'), '2026-10-26');
  assert.equal(isoWeekNumber(mondayOfIsoWeek(1, 2027)), 1, 'tuần 1 phải quy về tuần 1');
});

// ---------------------------------------------------------------- tiếng Việt + gộp nguồn

test('foldVietnamese bỏ dấu cho cả chữ hoa và thường', () => {
  assert.equal(foldVietnamese('Hội nghị Đảng ủy'), 'hoi nghi dang uy');
  assert.equal(foldVietnamese('ĐẢNG BỘ PHƯỜNG AN BÌNH'), 'dang bo phuong an binh');
  assert.equal(foldVietnamese('Hoàng Thị Thu'), foldVietnamese('HOÀNG THỊ THU'));
  assert.equal(foldVietnamese(''), '');
});

test('similarity giữa các mức trùng nội dung', () => {
  assert.equal(similarity('Họp giao ban', 'Họp giao ban'), 1);
  assert.ok(similarity('Họp ban chấp hành đảng bộ', 'Hội nghị ban chấp hành đảng bộ') >= 0.6,
    'khác vài từ vẫn phải coi là cùng việc (ngưỡng gộp)');
  assert.ok(similarity('Tập huấn chữ ký số', 'Bàn giao nhà tình nghĩa') < 0.3);
  assert.equal(similarity('', 'abc'), 0);
});

test('upsertEvents chèn việc mới và gộp việc trùng mà không xoá dữ liệu cán bộ', () => {
  const existing = ev({
    id: 'a1',
    title: 'Họp giao ban tuần',
    content: 'Đánh giá công tác tuần trước',
    chair: 'Nguyễn Văn An',
    also_from: [],
    confidence: 0.6,
    priority_score: 5,
  });
  const state = { events: [existing] };
  const result = upsertEvents(state, [
    ev({
      id: 'b1',
      title: 'Họp giao ban đầu tuần',
      content: 'Đánh giá công tác tuần trước',
      chair: '',
      participants: 'Các ngành',
      location: 'Phòng họp trụ sở',
      source_document: 'Thông báo 12/TB-UBND',
      confidence: 0.9,
      priority_score: 8,
      leaders: ['Trần Thị Bình'],
    }),
    ev({ id: 'b2', title: 'Tiếp công dân', location: 'Trụ tiếp công dân', source_document: 'Kế hoạch 5' }),
  ]);

  assert.equal(result.merged.length, 1);
  assert.equal(result.inserted.length, 1);
  assert.equal(state.events.length, 2);
  assert.equal(existing.chair, 'Nguyễn Văn An', 'phần cán bộ đã sửa không được bị xoá');
  assert.deepEqual(existing.also_from, ['Thông báo 12/TB-UBND']);
  assert.equal(existing.confidence, 0.9, 'lấy độ tin cao nhất');
  assert.equal(existing.priority_score, 8, 'lấy ưu tiên cao nhất');
  assert.equal(existing.participants, 'Các ngành', 'chỉ điền vào chỗ trống');
  assert.deepEqual(existing.leaders, ['Trần Thị Bình']);
});

test('upsertEvents không ghi nguồn trùng lặp hai lần', () => {
  const existing = ev({ id: 'a1', title: 'Kiểm tra hiện trường', also_from: ['Công văn 9'] });
  const state = { events: [existing] };
  upsertEvents(state, [ev({ id: 'x', title: 'Kiểm tra hiện trường', source_document: 'Công văn 9' })]);
  assert.deepEqual(existing.also_from, ['Công văn 9']);
});

// ---------------------------------------------------------------- phát hiện xung đột

test('analyzeConflicts báo trùng giờ của cùng một chủ trì ở hai địa điểm', () => {
  const conflicts = analyzeConflicts(
    [
      ev({ id: 'a', title: 'Họp Đảng ủy', chair: 'Nguyễn Văn An', location: 'Phòng họp Trụ sở Đảng ủy', start_time: '08:00', end_time: '09:00' }),
      ev({ id: 'b', title: 'Làm việc với UBND', chair: 'Nguyễn Văn An', location: 'Phòng họp UBND phường', start_time: '08:30', end_time: '10:00' }),
    ],
    BUFFERS,
  );
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].severity, 'CONFLICT HIGH');
  assert.equal(conflicts[0].conflict_type, 'SAME_PERSON_DIFFERENT_LOC');
  assert.equal(conflicts[0].status, 'OPEN');
});

test('analyzeConflicts bỏ qua sự kiện đã từ chối và không có giờ', () => {
  const conflicts = analyzeConflicts(
    [
      ev({ id: 'a', chair: 'Nguyễn Văn An', status: 'REJECTED' }),
      ev({ id: 'b', chair: 'Nguyễn Văn An' }),
    ],
    BUFFERS,
  );
  assert.equal(conflicts.length, 0, 'sự kiện REJECTED không được so');
  const khongGio = analyzeConflicts(
    [ev({ id: 'c', start_time: '', chair: 'A' }), ev({ id: 'd', start_time: '', chair: 'A' })],
    BUFFERS,
  );
  assert.equal(khongGio.length, 0);
});

test('analyzeConflicts cảnh báo khi quãng nghỉ dưới buffer di chuyển', () => {
  const conflicts = analyzeConflicts(
    [
      ev({ id: 'a', title: 'Kiểm tra cơ sở', location: 'Phường A', start_time: '07:00', end_time: '07:50' }),
      ev({ id: 'b', title: 'Làm việc với phòng', location: 'Phường B', start_time: '08:00', end_time: '09:00' }),
    ],
    BUFFERS,
  );
  const travel = conflicts.filter((c) => c.conflict_type === 'TRAVEL_BUFFER_VIOLATION');
  assert.equal(travel.length, 1);
  assert.match(travel[0].description, /cần tối thiểu 15 phút/);

  const duThoiGian = analyzeConflicts(
    [
      ev({ id: 'c', title: 'Kiểm tra cơ sở', location: 'Phường A', start_time: '07:00', end_time: '07:30' }),
      ev({ id: 'd', title: 'Làm việc với phòng', location: 'Phường B', start_time: '08:00', end_time: '09:00' }),
    ],
    BUFFERS,
  );
  assert.equal(duThoiGian.filter((c) => c.conflict_type === 'TRAVEL_BUFFER_VIOLATION').length, 0);
});

test('locationBuffer phân bậc khoảng cách', () => {
  assert.equal(locationBuffer('Phòng họp Trụ sở Đảng ủy', 'Phòng họp UBND phường', BUFFERS), BUFFERS.sameBuilding);
  assert.equal(locationBuffer('Phường A', 'Phường B', BUFFERS), BUFFERS.sameWard);
  assert.equal(locationBuffer('Hà Nội', 'Phòng họp UBND phường', BUFFERS), BUFFERS.outsideArea);
  assert.equal(locationBuffer('Phòng họp UBND phường', 'Hà Nội', BUFFERS), BUFFERS.outsideArea,
    'chiều đi hay về đều phải tính đủ thời gian di chuyển');
  assert.equal(locationBuffer('Tỉnh lộ 16', 'Trụ sở UBND', BUFFERS), BUFFERS.outsideArea);
  assert.equal(locationBuffer('Trụ sở', 'Trụ sở', BUFFERS), 0, 'cùng một nơi không cần buffer');
  assert.equal(locationBuffer('', 'Trụ sở', BUFFERS), 15);
});

test('shareLeader khớp khi hai sự kiện nêu cùng lãnh đạo', () => {
  assert.equal(shareLeader(ev({ leaders: ['Nguyễn Văn An'] }), ev({ leaders: ['Nguyễn Văn An'] })), true);
  assert.equal(shareLeader(ev({ leaders: ['Nguyễn Văn An'] }), ev({ leaders: ['Lê Thị B'] })), false);
});

// ---------------------------------------------------------------- thể thức văn bản

test('checkDocumentFormat chấm điểm thấp khi chưa nhập số hiệu và người ký', () => {
  const { score, items } = checkDocumentFormat({
    events: [ev({ title: 'Họp', location: '', start_time: '08:00', end_time: '' })],
    settings: settings({ unit_name: 'UBND Phường An Bình', document_number: '', signer: '' }),
    weekNumber: 44,
    conflicts: [],
  });
  const byKey = Object.fromEntries(items.map((i) => [i.key, i.status]));
  assert.equal(byKey.doc_number, 'FAIL');
  assert.equal(byKey.signer, 'FAIL');
  assert.ok(score < 70, `điểm phải thấp, nhận được ${score}`);
  const docNumberItem = items.find((i) => i.key === 'doc_number');
  assert.match(docNumberItem?.detail || '', /44-LCT\/VP/);
});

test('checkDocumentFormat đạt cao với văn bản đủ thể thức', () => {
  const { score, items } = checkDocumentFormat({
    events: [
      ev({
        title: 'Họp giao ban',
        content: 'Đánh giá công tác tuần',
        location: 'Phòng họp Trụ sở UBND phường',
        chair: 'Nguyễn Văn An',
        start_time: '08:00',
        end_time: '09:30',
      }),
    ],
    settings: settings({
      unit_name: 'UBND Phường An Bình',
      document_number: '44-LCT/VP',
      signer: 'Chủ tịch UBND phường Nguyễn Văn An',
    }),
    weekNumber: 44,
    conflicts: [],
  });
  assert.ok(score >= 80, `điểm phải cao, nhận được ${score}`);
  assert.equal(items.find((i) => i.key === 'doc_number')?.status, 'PASS');
  assert.equal(items.find((i) => i.key === 'org')?.status, 'PASS');
});

test('checkDocumentFormat phạt xung đột còn mở', () => {
  const base = {
    events: [ev({ title: 'Họp', content: 'x', location: 'Phòng họp Trụ sở UBND phường', start_time: '08:00', end_time: '09:00' })],
    settings: settings({ unit_name: 'UBND Phường An Bình', document_number: '44-LCT/VP', signer: 'Chủ tịch UBND phường Nguyễn Văn An' }),
    weekNumber: 44,
  };
  const clean = checkDocumentFormat({ ...base, conflicts: [] });
  const dirty = checkDocumentFormat({
    ...base,
    conflicts: [{ id: 'c1', event_id_1: 'a', event_id_2: 'b', conflict_type: 'OVERLAP_TIME', severity: 'CONFLICT HIGH', description: '', resolution_suggestion: '', status: 'OPEN', created_at: '' }],
  });
  assert.equal(dirty.items.find((i) => i.key === 'conflicts')?.status, 'FAIL');
  assert.ok(clean.score > dirty.score, 'cùng dữ liệu, có xung đột mở thì điểm phải thấp hơn');
});

// ---------------------------------------------------------------- xếp lịch thông minh

test('findFreeSlots tránh giờ đã có việc và trả khung nằm trong giờ làm', () => {
  const busy = ev({ event_date: '2026-10-26', start_time: '08:00', end_time: '09:00', chair: 'Nguyễn Văn An' });
  const slots = findFreeSlots({
    date: '2026-10-26',
    durationMinutes: 60,
    workingHours: DEFAULT_SETTINGS.working_hours,
    events: [busy],
    buffers: BUFFERS,
    people: ['Nguyễn Văn An'],
    limit: 10,
  });
  assert.ok(slots.length > 0, 'phải còn khung trống buổi sáng');
  for (const slot of slots) {
    assert.ok(!(slot.start_time < '09:00' && slot.end_time > '08:00'), `khung ${slot.start_time}-${slot.end_time} trùng giờ họp`);
    assert.ok(slot.start_time >= '07:30' && slot.end_time <= '17:00');
  }
});

test('findFreeSlots không xếp vào Chủ nhật', () => {
  const slots = findFreeSlots({
    date: '2026-11-01',
    durationMinutes: 60,
    workingHours: DEFAULT_SETTINGS.working_hours,
    events: [],
    buffers: BUFFERS,
  });
  assert.deepEqual(slots, []);
});

test('planConflictResolutions dời sự kiện điểm ưu tiên thấp hơn', () => {
  const keep = ev({ id: 'keep', event_date: '2026-10-26', start_time: '08:00', end_time: '09:30', chair: 'Nguyễn Văn An', priority_score: 90 });
  const move = ev({ id: 'move', event_date: '2026-10-26', start_time: '08:00', end_time: '09:30', chair: 'Nguyễn Văn An', priority_score: 40 });
  const conflict: ConflictRecord = {
    id: 'c1', event_id_1: 'keep', event_id_2: 'move', conflict_type: 'OVERLAP_TIME',
    severity: 'CONFLICT HIGH', description: 'Trùng giờ', resolution_suggestion: '', status: 'OPEN', created_at: '',
  };
  const plans = planConflictResolutions([keep, move], [conflict], DEFAULT_SETTINGS.working_hours, BUFFERS, { maxDaysAhead: 0 });
  assert.equal(plans.length, 1);
  assert.equal(plans[0].move_event.id, 'move', 'phải giữ việc ưu tiên cao và dời việc thấp hơn');
  assert.ok(plans[0].options.length > 0, 'phải có khung giờ thay thế trong ngày');
  assert.match(plans[0].recommendation, /Dời/);
});

// ---------------------------------------------------------------- số liệu báo cáo

test('buildWeekReport gom đúng số việc, thời lượng và tải theo người', () => {
  const events = [
    ev({ event_date: '2026-10-26', start_time: '08:00', end_time: '09:00', chair: 'Nguyễn Văn An', priority_score: 85, location: 'Phòng họp A' }),
    ev({ event_date: '2026-10-27', start_time: '14:00', end_time: '15:30', chair: 'Trần Thị Bình', priority_score: 50, location: 'Phòng họp A' }),
  ];
  const report = buildWeekReport(events, DEFAULT_SETTINGS, '2026-10-26');
  assert.equal(report.totals.events, 2);
  assert.equal(report.totals.minutes, 150);
  assert.equal(report.totals.high_priority, 1);
  assert.equal(report.days.length, 2);
  assert.equal(report.by_location[0].location, 'Phòng họp A');
  assert.equal(report.by_person.length, 2);
});

test('buildMonthReport tách tuần ISO và cộng khớp tổng tháng', () => {
  const events = [
    ev({ event_date: '2026-10-05', start_time: '08:00', end_time: '09:00', chair: 'Nguyễn Văn An' }),
    ev({ event_date: '2026-10-06', start_time: '08:00', end_time: '10:00', chair: 'Nguyễn Văn An' }),
    ev({ event_date: '2026-10-14', start_time: '14:00', end_time: '15:00', chair: 'Trần Thị Bình' }),
  ];
  const report = buildMonthReport(events, DEFAULT_SETTINGS, '2026-10-01');
  assert.equal(report.totals.events, 3);
  assert.equal(report.totals.minutes, 240);
  const weekEvents = report.weeks.reduce((sum, w) => sum + w.events, 0);
  assert.equal(weekEvents, 3, 'tổng theo tuần phải bằng tổng tháng');
  assert.ok(report.weeks.length >= 2);
});
