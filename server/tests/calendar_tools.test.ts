import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNaturalLanguageEvent } from '../../src/utils/quickAddParser.js';
import { formatWeekForZalo } from '../../src/utils/zaloFormatter.js';

test('parseNaturalLanguageEvent nhận diện đúng thứ, giờ, phòng họp và chủ trì', () => {
  const weekStart = '2026-11-02'; // Thứ Hai
  const input = '8h30 thứ 3 họp giao ban lãnh đạo tại phòng họp 1, Đ/c Chủ tịch chủ trì, VP chuẩn bị tài liệu';
  const result = parseNaturalLanguageEvent(input, weekStart);

  assert.ok(result);
  assert.equal(result.event_date, '2026-11-03'); // Thứ Ba
  assert.equal(result.start_time, '08:30');
  assert.equal(result.end_time, '10:00'); // Mặc định 90 phút
  assert.match(result.location, /phòng họp 1/i);
  assert.match(result.chair, /Chủ tịch/i);
  assert.match(result.preparation, /VP chuẩn bị tài liệu/i);
  assert.match(result.title, /họp giao ban lãnh đạo/i);
});

test('parseNaturalLanguageEvent hiểu buổi chiều và khung giờ có khoảng', () => {
  const weekStart = '2026-11-02';
  const input = 'Chiều thứ 5 lúc 14h - 16h30 làm việc với đoàn kiểm tra tại Hội trường lớn';
  const result = parseNaturalLanguageEvent(input, weekStart);

  assert.ok(result);
  assert.equal(result.event_date, '2026-11-05'); // Thứ Năm
  assert.equal(result.start_time, '14:00');
  assert.equal(result.end_time, '16:30');
  assert.match(result.location, /Hội trường lớn/i);
  assert.match(result.title, /làm việc với đoàn kiểm tra/i);
});

test('formatWeekForZalo sinh cấu trúc tin nhắn đẹp mắt, đủ thứ ngày và icon', () => {
  const weekData = {
    week_number: 45,
    start_date: '2026-11-02',
    end_date: '2026-11-08',
    days: [
      {
        date: '2026-11-02',
        events: [
          {
            title: 'Giao ban đầu tuần',
            start_time: '08:00',
            end_time: '09:30',
            location: 'Phòng 1',
            chair: 'Đ/c Trưởng cơ quan',
            status: 'APPROVED',
          },
        ],
      },
      {
        date: '2026-11-03',
        events: [],
      },
    ],
  };

  const output = formatWeekForZalo(weekData, { unit_name: 'UBND Phường 1' });
  assert.match(output, /TUẦN 45/);
  assert.match(output, /UBND PHƯỜNG 1/);
  assert.match(output, /THỨ HAI/);
  assert.match(output, /Giao ban đầu tuần/);
  assert.match(output, /08:00 - 09:30/);
  assert.match(output, /📍 Phòng 1/);
  assert.match(output, /👤 Chủ trì: Đ\/c Trưởng cơ quan/);
});
