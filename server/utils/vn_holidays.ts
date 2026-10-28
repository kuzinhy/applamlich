const pad2 = (n: number) => String(n).padStart(2, '0');

export interface HolidayDay {
  date: string;
  name: string;
  kind: 'holiday' | 'observe';
}

/** Ngày lễ cố định (dương lịch) theo Điều 112 Bộ luật Lao động 2019.
    Tết Nguyên đán và Giỗ tổ Hùng Vương tính theo âm lịch, mỗi năm UBND cấp trên
    thông báo số ngày nghỉ cụ thể — xem lunarNotice. */
const FIXED_HOLIDAYS: { month: number; day: number; name: string; kind: 'holiday' | 'observe' }[] = [
  { month: 1, day: 1, name: 'Tết Dương lịch', kind: 'holiday' },
  { month: 4, day: 30, name: 'Ngày giải phóng miền Nam, thống nhất đất nước', kind: 'holiday' },
  { month: 5, day: 1, name: 'Ngày Quốc tế Lao động', kind: 'holiday' },
  { month: 9, day: 2, name: 'Quốc khánh', kind: 'holiday' },
  { month: 7, day: 27, name: 'Ngày Thương binh - Liệt sĩ (không nghỉ, cần bố trí dâng hương)', kind: 'observe' },
];

export const LUNAR_NOTICE =
  'Tết Nguyên đán, Giỗ tổ Hùng Vương (10/3 âm lịch) và ngày nghỉ liền kề Quốc khánh thay đổi theo thông báo của cấp trên: '
  + 'nạp văn bản chỉ đạo nghỉ lễ vào Nguồn lịch để hệ thống ghi nhận, app không tự đoán ngày âm lịch.';

export function holidaysInYear(year: number): HolidayDay[] {
  return FIXED_HOLIDAYS
    .map((h) => ({ date: `${year}-${pad2(h.month)}-${pad2(h.day)}`, name: h.name, kind: h.kind }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Ngày lễ rơi trong khoảng (bao gồm cả hai đầu). */
export function holidaysInRange(startIso: string, endIso: string): HolidayDay[] {
  const from = Number(startIso.slice(0, 4));
  const to = Number(endIso.slice(0, 4));
  const out: HolidayDay[] = [];
  for (let year = from; year <= to; year += 1) {
    for (const h of holidaysInYear(year)) {
      if (h.date >= startIso && h.date <= endIso) out.push(h);
    }
  }
  return out;
}
