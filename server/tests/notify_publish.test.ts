import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildPublishText } from '../services/notify.ts';

function ev(title: string, event_date: string, start_time: string, end_time = '') {
  return { title, event_date, start_time, end_time } as any;
}

const BASE = {
  weekStart: '2026-11-02',
  weekEnd: '2026-11-08',
  weekNumber: 45,
  documentNumber: '45-LCT/VP',
  unitName: 'UBND phường Thủ Dầu Một',
};

test('bản tin ban hành không kèm chi tiết thì không lộ tiêu đề công việc', () => {
  const text = buildPublishText({
    ...BASE,
    events: [ev('Họp giao ban', '2026-11-02', '07:30')],
    includeDetails: false,
  });
  assert.ok(text.includes('ĐÃ BAN HÀNH LỊCH CÔNG TÁC'));
  assert.ok(text.includes('45-LCT/VP'));
  assert.ok(text.includes('1 mục lịch'));
  assert.ok(!text.includes('Họp giao ban'), 'tắt "gửi kèm chi tiết" phải ẩn tên công việc');
  assert.ok(text.includes('gửi kèm chi tiết'));
});

test('bản tin ban hành gộp theo ngày, ghi thứ và ngày dd/mm', () => {
  const text = buildPublishText({
    ...BASE,
    events: [
      ev('Họp giao ban', '2026-11-04', '07:30', '08:30'),
      ev('Sinh hoạt chi bộ', '2026-11-02', '15:00'),
      ev('Tiếp công dân', '2026-11-02', '07:00'),
    ],
    includeDetails: true,
  });
  assert.ok(text.includes('<b>Thứ Hai 02/11/2026</b> (2 mục)'), text);
  assert.ok(text.includes('<b>Thứ Tư 04/11/2026</b> (1 mục)'), text);
  assert.ok(text.indexOf('Tiếp công dân') < text.indexOf('Sinh hoạt chi bộ'), 'sắp theo giờ trong ngày, không theo chiều lưu dữ liệu');
  assert.ok(text.includes('07:30–08:30'));
});

test('mục chưa rõ giờ hiện nhãn "chưa rõ giờ", không bịa 08:00', () => {
  const text = buildPublishText({
    ...BASE,
    events: [ev('Dự hội nghị trực tuyến', '2026-11-05', '')],
    includeDetails: true,
  });
  assert.ok(text.includes('(chưa rõ giờ)'), text);
  assert.ok(!text.includes('08:00'), 'không được bịa giờ trong bản tin');
});

test('ngày không hợp lệ vẫn được nêu thành một nhóm riêng, không bị bỏ rơi', () => {
  const text = buildPublishText({
    ...BASE,
    events: [ev('Nộp báo cáo', '', '09:00')],
    includeDetails: true,
  });
  assert.ok(text.includes('Chưa xác định ngày'), text);
  assert.ok(text.includes('Nộp báo cáo'));
});

test('bản tin tự cắt khi vượt giới hạn và nói còn bao nhiêu mục chưa nêu', () => {
  const events = Array.from({ length: 12 }, (_unused, i) => ev(`Việc ${String(i + 1).padStart(2, '0')}`, '2026-11-02', '07:00'));
  const text = buildPublishText({ ...BASE, events, includeDetails: true, eventLimit: 5 });
  assert.ok(text.includes('12 mục lịch'));
  assert.ok(text.includes('Việc 05'));
  assert.ok(!text.includes('Việc 06'), 'phải dừng ở eventLimit');
  assert.ok(text.includes('còn 7 mục khác'), text);
});

test('tiêu đề được escape nên nội dung văn bản không phá định dạng tin', () => {
  const text = buildPublishText({
    ...BASE,
    events: [ev('Họp <script>alert(1)</script> & chỉ đạo', '2026-11-02', '07:00')],
    includeDetails: true,
  });
  assert.ok(!text.includes('<script>'));
  assert.ok(text.includes('&lt;script&gt;'));
  assert.ok(text.includes('&amp;'));
});
