/**
 * Kiểm chứng lớp trình diễn màn TV (kiosk).
 * Bất biến cần bảo vệ: màn TV chỉ trình bày dữ liệu có thật — không tự bịa giờ,
 * không tự nhận "đang diễn ra" khi chưa tới giờ, và hai dòng cùng một hoạt động
 * phải gom thành MỘT khung mà không làm mất mốc giờ riêng của từng dòng.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildKioskPayload,
  buildNotices,
  clockToMinutes,
  findCurrentEvents,
  groupFrames,
  mergeFrameGroup,
  normalizeClock,
  sessionOf,
  stripVietnameseDiacritics,
  toFrame,
} from '../services/kiosk_view.ts';
import type { EventRecord } from '../types.ts';

function ev(over: Partial<EventRecord> = {}): EventRecord {
  return {
    id: over.id || `ev-${Math.random().toString(36).slice(2, 8)}`,
    source_id: null,
    source_document: '',
    source_page: null,
    source_paragraph: null,
    event_date: '2026-11-02',
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
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: '2026-11-01T00:00:00.000Z',
    ...over,
  };
}

const frameOf = (over: Partial<EventRecord> = {}) => toFrame(ev(over));

test('giờ lịch → phút: chấp nhận giờ lẻ, giờ đã gom nhiều mốc, từ chối chuỗi vô nghĩa', () => {
  assert.equal(clockToMinutes('7:30'), 450);
  assert.equal(clockToMinutes('07:10 / 07:30'), 430);
  assert.equal(clockToMinutes('14:00'), 840);
  assert.equal(clockToMinutes('7h15'), 435);
  assert.equal(clockToMinutes('11 giờ 30'), 690);
  assert.equal(clockToMinutes(''), null);
  assert.equal(clockToMinutes(null), null);
  assert.equal(clockToMinutes('Sáng'), null);
  assert.equal(clockToMinutes('25:70'), null);
  assert.equal(normalizeClock('7:05'), '07:05');
  assert.equal(normalizeClock('Sáng'), 'Sáng');
});

test('buổi suy từ giờ, tên Thứ suy từ ngày — không lấy từ chuỗi tự do', () => {
  assert.equal(sessionOf(450), 'Sáng');
  assert.equal(sessionOf(840), 'Chiều');
  assert.equal(sessionOf(null), '');
  // 2026-11-02 là Thứ Hai, 2026-11-03 là Thứ Ba.
  assert.equal(frameOf({ event_date: '2026-11-02' }).weekday, 'Thứ Hai');
  assert.equal(frameOf({ event_date: '2026-11-03' }).weekday, 'Thứ Ba');
});

test('bỏ dấu tiếng Việt để nhận hai dòng cùng một hoạt động', () => {
  assert.equal(stripVietnameseDiacritics('Tổng kết năm học'), 'tong ket nam hoc');
  assert.equal(stripVietnameseDiacritics('Đ/c   Phạm Văn Nông'), 'd/c pham van nong');
  assert.equal(
    stripVietnameseDiacritics('Dự Lễ Tổng kết'),
    stripVietnameseDiacritics('du le tong ket'),
  );
});

test('hai dòng cùng ngày + cùng buổi + cùng tiêu đề gộp thành một khung, giữ đủ mốc giờ', () => {
  const merged = groupFrames([
    frameOf({
      id: 'a',
      event_date: '2026-11-03',
      start_time: '07:30',
      title: 'Dự Lễ Tổng kết năm học 2025-2026',
      participants: 'Đ/c Nguyễn Thu Cúc',
      location: 'Trường THPT Trần Hưng Đạo',
    }),
    frameOf({
      id: 'b',
      event_date: '2026-11-03',
      start_time: '07:10',
      title: 'dự lễ tổng kết năm học 2025-2026',
      participants: 'Đ/c Phạm Văn Nông',
      location: 'Trung tâm GDTX',
    }),
  ]);

  assert.equal(merged.length, 1, 'hai dòng trùng phải còn một khung');
  const frame = merged[0];
  assert.equal(frame.id, 'b__a', 'id ghép để truy được về hai sự kiện gốc');
  assert.equal(frame.start_time, '07:10 / 07:30');
  assert.equal(frame.start_minutes, 430, 'lấy mốc sớm nhất để tính thời gian');
  assert.equal(
    frame.participants,
    '07:10: Đ/c Phạm Văn Nông; 07:30: Đ/c Nguyễn Thu Cúc',
    'mỗi thành phần gắn kèm giờ của chính dòng đó',
  );
  assert.match(frame.location, /^07:10: /);
});

test('khung chỉ có một dòng thì giữ nguyên, không gắn thêm prefix giờ thừa', () => {
  const single = frameOf({ id: 'x', participants: 'Đ/c Bí thư', location: 'Phòng họp A' });
  const merged = groupFrames([single]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].start_time, '08:00');
  assert.equal(merged[0].participants, 'Đ/c Bí thư');
  assert.equal(merged[0].location, 'Phòng họp A');
});

test('không gộp bừa: khác ngày hoặc khác buổi thì tách khung', () => {
  const merged = groupFrames([
    frameOf({ id: 'a', event_date: '2026-11-02', start_time: '08:00', title: 'Giao ban' }),
    frameOf({ id: 'b', event_date: '2026-11-03', start_time: '08:00', title: 'Giao ban' }),
    frameOf({ id: 'c', event_date: '2026-11-02', start_time: '14:00', title: 'Giao ban' }),
  ]);
  assert.equal(merged.length, 3);
  assert.deepEqual(merged.map((f) => f.date), ['2026-11-02', '2026-11-02', '2026-11-03']);
  assert.deepEqual(merged.map((f) => f.session), ['Sáng', 'Chiều', 'Sáng']);
});

test('lịch không ghi giờ vẫn gộp theo tiêu đề và liệt kê đủ thành phần của hai dòng', () => {
  const merged = groupFrames([
    frameOf({ id: 'a', start_time: '', title: 'Trực cơ quan', participants: 'Đ/c Nhất' }),
    frameOf({ id: 'b', start_time: '', title: 'Trực cơ quan', participants: 'Đ/c Nhị' }),
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].start_time, '');
  assert.equal(merged[0].session, '', 'không có giờ thì không tự gán buổi');
  assert.equal(merged[0].participants, 'Đ/c Nhất; Đ/c Nhị');
});

test('lịch không tiêu đề không gộp bừa, mỗi dòng một khung riêng', () => {
  const merged = groupFrames([
    frameOf({ id: 'a', title: '', participants: 'Đ/c Nhất' }),
    frameOf({ id: 'b', title: '', participants: 'Đ/c Nhị' }),
  ]);
  assert.equal(merged.length, 2);
});

test('mergeFrameGroup với nhóm rỗng trả null, không sinh khung ảo', () => {
  assert.equal(mergeFrameGroup([]), null);
});

test('đang diễn ra: trong khoảng start–end là đang chạy, ngoài khoảng thì không', () => {
  const list = [
    frameOf({ id: 'hop', start_time: '07:30', end_time: '09:00', title: 'Họp ban thường vụ' }),
    frameOf({ id: 'lam', start_time: '14:00', end_time: '16:00', title: 'Làm việc sở' }),
  ];
  const at8 = findCurrentEvents(list, 480, 120);
  assert.deepEqual(at8.map((e) => e.id), ['hop']);
  assert.equal(at8[0].is_current, true);

  const at10 = findCurrentEvents(list, 600, 120);
  assert.deepEqual(at10.map((e) => e.id), ['lam'], '10:00 chưa tới 14:00 nên là "sắp diễn ra"');
  assert.equal(at10[0].is_current, false);

  const at17 = findCurrentEvents(list, 1020, 120);
  assert.deepEqual(at17, [], '17:00: mọi lịch đã xong, màn TV để trống chứ không treo lại lịch cũ');
});

test('lịch không ghi giờ kết thúc chỉ được treo tối đa số phút dự phòng', () => {
  const list = [frameOf({ id: 'a', start_time: '14:30', end_time: null })];
  assert.equal(findCurrentEvents(list, 14 * 60 + 30, 120).length, 1);
  assert.equal(findCurrentEvents(list, 16 * 60 + 29, 120).length, 1);
  assert.equal(findCurrentEvents(list, 16 * 60 + 31, 120).length, 0);
});

test('trước lịch đầu tiên trong ngày: hiện lịch sớm nhất nhưng gắn nhãn sắp diễn ra', () => {
  const list = [
    frameOf({ id: 'sau', start_time: '14:00', end_time: null }),
    frameOf({ id: 'som', start_time: '07:30', end_time: null }),
  ];
  const result = findCurrentEvents(list, 6 * 60, 120);
  assert.deepEqual(result.map((e) => e.id), ['som']);
  assert.equal(result[0].is_current, false);
});

test('ngày chỉ có lịch không giờ thì coi như chưa có gì đang diễn ra', () => {
  const list = [frameOf({ id: 'a', start_time: '', end_time: '' })];
  assert.deepEqual(findCurrentEvents(list, 600, 120), []);
});

test('payload tách đúng hôm nay / ngày mai và loại khung đang diễn ra khỏi danh sách sắp tới', () => {
  const now = new Date(2026, 10, 3, 8, 0); // Thứ Ba 03/11/2026, 08:00 giờ máy
  const payload = buildKioskPayload({
    now,
    meta: {
      week_start: '2026-11-02',
      week_end: '2026-11-08',
      week_number: 44,
      document_number: '20-LLV/ĐU',
      signer: 'Nguyễn Văn A',
      unit_name: 'ĐẢNG ỦY PHƯỜNG THỦ DẦU MỘT',
    },
    events: [
      ev({ id: '1', event_date: '2026-11-02', start_time: '08:00', end_time: '09:00', title: 'Họp đầu tuần' }),
      ev({ id: '2', event_date: '2026-11-03', start_time: '07:30', end_time: '09:00', title: 'Giao ban' }),
      ev({ id: '3', event_date: '2026-11-03', start_time: '14:00', end_time: '16:00', title: 'Tiếp công dân' }),
      ev({ id: '4', event_date: '2026-11-04', start_time: '08:00', end_time: '09:30', title: 'Làm việc sở' }),
    ],
  });

  assert.equal(payload.today, '2026-11-03');
  assert.equal(payload.tomorrow, '2026-11-04');
  assert.equal(payload.now_minutes, 480);
  assert.deepEqual(payload.current_events.map((e) => e.id), ['2']);
  assert.equal(payload.current_events[0].is_current, true);
  assert.deepEqual(payload.upcoming_today.map((e) => e.id), ['3']);
  assert.deepEqual(payload.tomorrow_events.map((e) => e.id), ['4']);
  assert.deepEqual(payload.week, {
    start: '2026-11-02',
    end: '2026-11-08',
    number: 44,
    display: '02/11/2026 – 08/11/2026',
  });
  assert.equal(payload.document_number, '20-LLV/ĐU');
  assert.equal(payload.org_name, 'ĐẢNG ỦY PHƯỜNG THỦ DẦU MỘT');
  assert.deepEqual(payload.notices, [], 'không có mục bổ sung thì không chạy dòng tin');
});

test('sự kiện bị xoá/gọi sai ngày không lọt vào cột hôm nay', () => {
  const now = new Date(2026, 10, 3, 8, 0);
  const payload = buildKioskPayload({
    now,
    meta: { week_start: '2026-11-02', week_end: '2026-11-08', week_number: 44 },
    events: [ev({ id: '1', event_date: '2026-11-09', start_time: '08:00', title: 'Ngoài tuần' })],
  });
  assert.deepEqual(payload.current_events, []);
  assert.deepEqual(payload.upcoming_today, []);
  assert.deepEqual(payload.tomorrow_events, []);
});

test('dòng tin chỉ lấy lịch bổ sung có ghi chú thật, không tự đặt nhãn điều chỉnh', () => {
  const notices = buildNotices([
    frameOf({ id: 'a', event_date: '2026-11-03', start_time: '14:00', title: 'Họp đột xuất' }),
    frameOf({
      id: 'b',
      event_date: '2026-11-04',
      start_time: '08:00',
      title: 'Kiểm tra hiện trường',
      is_supplemental: true,
      supplemental_note: 'Bổ sung theo công văn 45/UBND',
    }),
  ]);
  assert.equal(notices.length, 1);
  assert.equal(notices[0].label, 'Lịch bổ sung');
  assert.equal(notices[0].text, 'Lịch bổ sung: Kiểm tra hiện trường — Bổ sung theo công văn 45/UBND');
});

test('cấu hình làm mới và dự phòng bị chặn trong khoảng hợp lý, không nhận số âm', () => {
  const base = {
    now: new Date(2026, 10, 3, 8, 0),
    meta: { week_start: '2026-11-02', week_end: '2026-11-08', week_number: 44 },
    events: [] as EventRecord[],
  };
  assert.deepEqual(buildKioskPayload({ ...base }).config, {
    refresh_seconds: 300,
    current_fallback_minutes: 120,
  });
  assert.deepEqual(buildKioskPayload({ ...base, refresh_seconds: -5, fallback_minutes: 0 }).config, {
    refresh_seconds: 300,
    current_fallback_minutes: 120,
  });
  assert.deepEqual(buildKioskPayload({ ...base, refresh_seconds: 99999, fallback_minutes: 99999 }).config, {
    refresh_seconds: 3600,
    current_fallback_minutes: 600,
  });
  assert.deepEqual(buildKioskPayload({ ...base, refresh_seconds: 5, fallback_minutes: 10 }).config, {
    refresh_seconds: 30,
    current_fallback_minutes: 15,
  });
});
