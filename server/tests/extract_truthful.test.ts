import { test } from 'node:test';
import assert from 'node:assert/strict';

import { coerceAiEvent, heuristicExtractEvents, normalizeTime } from '../engines/extractor.ts';
import { approximateClock, parseClock } from '../utils/clock.ts';
import { CalendarEventSchema } from '../schemas/calendar.ts';
import type { EventRecord } from '../types.ts';

const CTX = { source_doc: 'Thông báo 15/TB-UBND', source_id: null, source_priority: 70, week_start: '2026-10-26' };

// Các kiểm tra dưới đây giữ ba nguyên tắc nghiệp vụ của luồng bóc tách:
// (1) văn bản có thật thì không bị bỏ chỉ vì thiếu ngày/giờ, (2) giờ không có trong văn bản thì để trống chứ không bịa,
// (3) mục bị loại phải kèm LÝ DO để cán bộ biết bổ sung gì.

test('coerceAiEvent giữ mục không có giờ và đánh dấu thiếu thay vì bỏ', () => {
  const out = coerceAiEvent({ title: 'Trực cơ quan', content: 'Trực bảo đảm phục vụ Tết', event_date: '2026-10-28' }, CTX);
  assert.ok(out, 'mục có tiêu đề, nội dung và ngày là lịch thật, không được phép mất');
  assert.equal(out!.start_time, '', 'không được gán khống giờ');
  assert.deepEqual(out!.missing_data_fields.sort(), ['chair', 'end_time', 'location', 'start_time']);
  assert.equal(out!.status, 'PROPOSED');
});

test('coerceAiEvent giữ mục không có ngày, tạm đặt vào đầu tuần và báo thiếu event_date', () => {
  const out = coerceAiEvent({ title: 'Họp Tổ giúp việc', content: 'Họp chuẩn bị nội dung đại hội' }, CTX);
  assert.ok(out);
  assert.equal(out!.event_date, CTX.week_start);
  assert.ok(out!.missing_data_fields.includes('event_date'), 'ngày suy ra từ đầu tuần phải được đánh dấu để cán bộ kiểm tra');
});

test('coerceAiEvent chỉ loại mục rỗng và nêu rõ lý do trong diagnostics', () => {
  const diag: { reason?: string } = {};
  assert.equal(coerceAiEvent({ title: '', content: '   ' }, CTX, diag), null);
  assert.match(String(diag.reason), /mục rỗng/i);

  const badType: { reason?: string } = {};
  assert.equal(coerceAiEvent(null as any, CTX, badType), null);
  assert.match(String(badType.reason), /không đúng dạng/i);

  // Tiêu đề ngắn vẫn là lịch thật ("Họp", "Trực") — không được chặn bằng độ dài tối thiểu.
  assert.ok(coerceAiEvent({ title: 'Họp', content: '', event_date: '2026-10-27', start_time: '14:00' }, CTX));
});

test('mục thiếu giờ vẫn qua được CalendarEventSchema để không bị loại ở bước hậu kiểm', () => {
  const out = coerceAiEvent({ title: 'Tiếp công dân', content: 'Tại bộ phận một cửa', event_date: '2026-10-27' }, CTX)!;
  const validation = CalendarEventSchema.safeParse({
    title: out.title,
    content: out.content,
    event_date: out.event_date,
    start_time: out.start_time,
    end_time: out.end_time,
    chair: out.chair,
    participants: out.participants,
    location: out.location,
    confidence: out.confidence,
  });
  assert.ok(validation.success, `hậu kiểm không được loại mục thiếu giờ: ${validation.error?.message}`);
  const saiGio = CalendarEventSchema.safeParse({ title: 'A', event_date: '2026-10-27', start_time: '8h', location: 'x' });
  assert.equal(saiGio.success, false, 'giờ sai định dạng vẫn phải bị từ chối');
});

test('parseClock không bịa giờ từ chữ chỉ phiên; approximateClock chỉ dùng để sắp xếp', () => {
  for (const chiDinhCac of ['sáng mai', 'Chiều', 'buổi chiều thứ sáu', 'Cả ngày']) {
    assert.equal(parseClock(chiDinhCac, ''), null, `"${chiDinhCac}" không chứa giờ, phải trả null`);
  }
  assert.equal(approximateClock('sáng', ''), 7 * 60, 'phiên sáng xếp trước');
  assert.equal(approximateClock('chiều', ''), 14 * 60, 'phiên chiều xếp sau');
  assert.equal(approximateClock('14:30', ''), 870, 'có giờ thật thì dùng giờ thật');
  assert.equal(parseClock('9h', 'Họp buổi sáng'), 540);
  assert.equal(parseClock('3h', 'Họp buổi chiều'), 15 * 60, '3h chiều phải thành 15:00');
});

test('normalizeTime không trả giờ khi văn bản chỉ ghi phiên làm việc', () => {
  assert.equal(normalizeTime('sáng thứ Bảy', ''), null);
  assert.equal(normalizeTime('08 giờ 00', ''), '08:00');
});

const GIAY_MOI_KHONG_GIO = [
  'ỦY BAN NHÂN DÂN PHƯỜNG THỦ DẦU MỘT',
  'GIẤY MỜI',
  'Kính mời: đồng chí Trưởng ban Xây dựng Đảng',
  'Dự cuộc họp kiểm tra cải cách hành chính quý IV',
  'Thành phần: các ngành liên quan',
  'Thời gian: sáng thứ Bảy',
  'Địa điểm: Phòng họp Trụ sở UBND phường',
].join('\n');

test('bộ bóc tách nội hàm giữ giấy mời chưa ghi giờ, không tự điền 08:00', () => {
  const { events, rejected } = heuristicExtractEvents(GIAY_MOI_KHONG_GIO, CTX);
  assert.equal(events.length, 1, `phải đọc được 1 mục lịch, nhận ${events.length}`);
  assert.equal(rejected.length, 0);
  assert.equal(events[0].start_time, '');
  assert.ok(events[0].missing_data_fields.includes('start_time'));
  assert.equal(events[0].location, 'Phòng họp Trụ sở UBND phường');
  assert.match(events[0].title, /cải cách hành chính/i);
  assert.equal(events[0].title.charAt(0), events[0].title.charAt(0).toUpperCase(), 'tiêu đề đưa ra lịch tuần phải viết hoa đầu câu');
});

test('bộ bóc tách nội hàm vẫn đọc đúng giờ khi văn bản có ghi giờ', () => {
  const vanBan = GIAY_MOI_KHONG_GIO.replace('Thời gian: sáng thứ Bảy', 'Thời gian: 14 giờ 00 ngày 28/10');
  const { events } = heuristicExtractEvents(vanBan, CTX);
  assert.equal(events.length, 1);
  assert.equal(events[0].start_time, '14:00');
  assert.equal(events[0].event_date, '2026-10-28');
  assert.ok(!events[0].missing_data_fields.includes('start_time'));
});

test('bộ bóc tách nội hàm đọc được cả hai cách ghi người chủ trì', () => {
  const theoNhan = heuristicExtractEvents(
    [
      'GIẤY MỜI',
      'V/v dự hội nghị triển khai công tác năm 2027',
      'Thời gian: 14 giờ 00 ngày 07/11/2026',
      'Địa điểm: Hội trường Trung tâm chính trị',
      'Chủ trì: đồng chí Bí thư Đảng ủy',
    ].join('\n'),
    CTX,
  ).events;
  assert.equal(theoNhan.length, 1);
  assert.match(String(theoNhan[0].chair), /Bí thư Đảng ủy/i, '"Chủ trì: <người>" là cách ghi phổ biến nhất');
  assert.ok(!theoNhan[0].missing_data_fields.includes('chair'));

  const daoNguoc = heuristicExtractEvents(
    [
      'THÔNG BÁO',
      'Họp Ban Thường vụ Đảng ủy',
      'Thời gian: 08 giờ 00 ngày 09/11/2026',
      'Địa điểm: Phòng họp Ban Thường vụ',
      'Thành phần: các đồng chí ủy viên thường vụ',
      'Do đồng chí Bí thư Đảng ủy chủ trì',
    ].join('\n'),
    CTX,
  ).events;
  assert.equal(daoNguoc.length, 1);
  assert.match(String(daoNguoc[0].chair), /Bí thư Đảng ủy/i, '"do <người> chủ trì" vẫn phải đọc được');
  assert.ok(!/chủ trì/i.test(daoNguoc[0].chair), 'không để lẫn chữ "chủ trì" vào tên người');
});

test('mọi dòng bị bỏ qua đều để lại lý do, không âm tĩnh mất lịch', () => {
  const inputs = [
    GIAY_MOI_KHONG_GIO,
    ['THÔNG BÁO', 'V/v nghỉ Tết dương lịch 2027', 'Kính mời các đồng chí ủy viên'.repeat(3)].join('\n'),
    '2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n13\n14\nPhòng họp trực tuyến đầu cầu phường',
  ];
  for (const text of inputs) {
    const { events, rejected } = heuristicExtractEvents(text, CTX);
    assert.ok(events.length + rejected.length > 0, `văn bản mất tích không dấu vết:\n${text}`);
    for (const r of rejected) {
      assert.ok(r.title, 'phải nêu được nhãn mục bị loại');
      assert.ok(String(r.reason).length > 10, `lý do quá vắn: "${r.reason}"`);
    }
  }
});

