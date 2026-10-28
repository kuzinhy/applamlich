const MANDATORY = ['triệu tập', 'bắt buộc', 'chỉ đạo trực tiếp', 'khẩn', 'hỏa tốc', 'thượng khẩn'];
const HIGH_LEADERSHIP = ['bí thư', 'phó bí thư', 'thường trực', 'ban thường vụ', 'chủ tịch ubnd'];
const MID_LEADERSHIP = ['phó chủ tịch', 'ủy viên', 'trưởng ban', 'chánh văn phòng'];

/** Điểm ưu tiên 10-100: 50% nguồn văn bản + 25% tính bắt buộc + 15% cấp lãnh đạo + 10% tính gấp. */
export function scorePriority(input: {
  source_priority?: number;
  title?: string;
  content?: string;
  chair?: string;
  participants?: string;
}): number {
  const combined = `${input.title || ''} ${input.content || ''} ${input.chair || ''} ${input.participants || ''}`.toLowerCase();
  const chairLower = (input.chair || '').toLowerCase();

  let mandatory = 60;
  if (MANDATORY.some((kw) => combined.includes(kw))) mandatory = 100;
  else if (combined.includes('kính mời') || combined.includes('mời họp')) mandatory = 80;
  else if (combined.includes('cử đại diện') || combined.includes('tùy chọn')) mandatory = 40;

  let leadership = 50;
  if (HIGH_LEADERSHIP.some((kw) => chairLower.includes(kw))) leadership = 100;
  else if (MID_LEADERSHIP.some((kw) => chairLower.includes(kw))) leadership = 80;
  else if (HIGH_LEADERSHIP.some((kw) => combined.includes(kw))) leadership = 85;
  else if (MID_LEADERSHIP.some((kw) => combined.includes(kw))) leadership = 70;

  const urgency = /khẩn|đột xuất|gấp/.test(combined) ? 100 : 60;
  const source = Number(input.source_priority ?? 50);

  const final = Math.round(0.5 * source + 0.25 * mandatory + 0.15 * leadership + 0.1 * urgency);
  return Math.max(10, Math.min(100, final));
}
