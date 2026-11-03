import { test } from 'node:test';
import assert from 'node:assert/strict';

import { planCarryForward } from '../services/carry_forward.ts';
import { searchEventsByQuery } from '../engines/retrieval.ts';

const FIELDS = ['title', 'chair', 'location'] as const;

function ev(title: string, event_date: string, start_time: string, status = 'PUBLISHED') {
  return { title, event_date, start_time, status };
}

// ---------------------------------------------------------------- kế thừa tuần

test('planCarryForward dịch toàn bộ lịch tuần sang tuần đích cách đúng số ngày yêu cầu', () => {
  const source = [ev('Họp giao ban', '2026-10-26', '07:30'), ev('Tiếp công dân', '2026-10-28', '14:00')];
  const plan = planCarryForward(source, [], 7);
  assert.equal(plan.take.length, 2);
  assert.deepEqual(
    plan.take.map((item) => `${item.date} ${item.base.title}`),
    ['2026-11-02 Họp giao ban', '2026-11-04 Tiếp công dân'],
  );
  assert.equal(plan.skipped.length, 0);
});

test('planCarryForward bỏ qua mục trùng tên + giờ ở tuần đích, giữ mục trùng tên khác giờ', () => {
  const source = [ev('Họp giao ban', '2026-10-26', '07:30'), ev('Sinh hoạt chi bộ', '2026-10-30', '15:00')];
  const existing = [ev('Họp giao ban', '2026-11-02', '07:30', 'APPROVED'), ev('Sinh hoạt chi bộ', '2026-11-06', '09:00', 'PROPOSED')];
  const plan = planCarryForward(source, existing, 7);
  assert.deepEqual(plan.take.map((item) => item.base.title), ['Sinh hoạt chi bộ']);
  assert.equal(plan.skipped.length, 1);
  assert.equal(plan.skipped[0].title, 'Họp giao ban');
});

test('planCarryForward coi mục bị từ chối ở tuần đích là chỗ trống và không sao hai lần trong một đợt', () => {
  const source = [
    ev('Hội nghị cán bộ', '2026-10-27', '08:00'),
    ev('Hội nghị cán bộ', '2026-10-27', '08:00'),
    ev('Đối thoại dân cư', '2026-10-28', '09:00'),
  ];
  const existing = [ev('Đối thoại dân cư', '2026-11-04', '09:00', 'REJECTED')];
  const plan = planCarryForward(source, existing, 7);
  assert.deepEqual(plan.take.map((item) => item.base.title), ['Hội nghị cán bộ', 'Đối thoại dân cư']);
  assert.equal(plan.skipped.length, 1);
  assert.equal(plan.skipped[0].title, 'Hội nghị cán bộ');
});

test('planCarryForward so khớp không phân biệt dấu khi kiểm tra trùng', () => {
  const source = [ev('hop ban thuong vu', '2026-10-26', '08:00')];
  const existing = [ev('Họp Ban Thường vụ', '2026-11-02', '08:00', 'APPROVED')];
  const plan = planCarryForward(source, existing, 7);
  assert.equal(plan.take.length, 0);
  assert.equal(plan.skipped.length, 1);
});

test('planCarryForward chấp nhận nhảy nhiều tuần và trả về bản gốc để route tự sao trường', () => {
  const source = [ev('Giao ban khối Đảng', '2026-11-02', '07:00')];
  const plan = planCarryForward(source, [], 28);
  assert.equal(plan.take[0].date, '2026-11-30');
  assert.equal(plan.take[0].base.status, 'PUBLISHED');
});

// ---------------------------------------------------------------- tìm kiếm toàn cục

const LIBRARY = [
    { title: 'Hội nghị tiếp công dân định kỳ', chair: 'Chủ tịch UBND', location: 'Trụ tiếp công dân', event_date: '2026-10-26', start_time: '08:00' },
    { title: 'Thẩm tra hồ sơ kết nạp đảng', chair: 'Trưởng Ban Xây dựng Đảng', location: 'Phòng họp số 1', event_date: '2026-11-02', start_time: '14:00' },
    { title: 'Sinh hoạt chi bộ tổ 4', chair: 'Bí thư chi bộ', location: 'Nhà văn hóa tổ 4', event_date: '2026-11-05', start_time: '19:30' },
];

test('searchEventsByQuery bỏ dấu nên gõ "tiep cong dan" vẫn thấy "tiếp công dân"', () => {
  const hits = searchEventsByQuery(LIBRARY, 'tiep cong dan', FIELDS);
  assert.equal(hits.length, 1);
  assert.match(hits[0].title, /tiếp công dân/i);
});

test('searchEventsByQuery tìm theo chủ trì và địa điểm, không phân biệt hoa thường', () => {
  assert.equal(searchEventsByQuery(LIBRARY, 'TRƯỞNG BAN', FIELDS).length, 1);
  assert.equal(searchEventsByQuery(LIBRARY, 'tổ 4', FIELDS).length, 1);
});

test('searchEventsByQuery trả mục mới nhất trước và giới hạn kết quả', () => {
  const hits = searchEventsByQuery(LIBRARY, 'ho', FIELDS, { limit: 2 });
  assert.equal(hits.length, 2);
  assert.equal(hits[0].event_date, '2026-11-05');
});

test('searchEventsByQuery lọc theo khoảng ngày và bỏ qua từ khoá quá ngắn', () => {
  const hits = searchEventsByQuery(LIBRARY, 'ho', FIELDS, { from: '2026-11-01', to: '2026-11-06' });
  assert.deepEqual(hits.map((e) => e.event_date).sort(), ['2026-11-02', '2026-11-05']);
  assert.equal(searchEventsByQuery(LIBRARY, 'a', FIELDS).length, 0);
  assert.equal(searchEventsByQuery(LIBRARY, '  ', FIELDS).length, 0);
});
