import { addDays } from '../utils/dates.ts';
import { foldVietnamese } from './merge.ts';

/** Phần sự kiện mà việc kế thừa cần đọc: tên, ngày, giờ và trạng thái. */
export interface CarryShape {
  title: string;
  event_date: string;
  start_time: string | null;
  status: string;
}

export interface CarryPlanItem<B> {
  base: B;
  /** Ngày đích sau khi dịch `deltaDays` ngày so với bản gốc. */
  date: string;
}

export interface CarryPlan<B> {
  take: CarryPlanItem<B>[];
  skipped: { title: string; date: string; reason: string }[];
}

/**
 * Lập kế hoạch kế thừa lịch: chọn những bản nào sẽ được sao sang tuần đích và mục nào bỏ qua
 * vì tuần đích đã có rồi. Hàm thuần, chỉ đọc dữ liệu đưa vào, không ghi kho.
 *
 * Bản đã dự kiến tạo trong chính đợt này cũng được tính là "đã có", nên hai bản gốc trùng nhau
 * trong tuần nguồn chỉ tạo ra một bản sao.
 */
export function planCarryForward<B extends CarryShape, E extends CarryShape>(
  sourceEvents: B[],
  existingEvents: E[],
  deltaDays: number,
): CarryPlan<B> {
  const take: CarryPlanItem<B>[] = [];
  const skipped: CarryPlan<B>['skipped'] = [];
  const sameSlot = (candidate: CarryShape, title: string, start: string, date: string) =>
    candidate.event_date === date
    && candidate.status !== 'REJECTED'
    && foldVietnamese(candidate.title) === foldVietnamese(title)
    && (candidate.start_time || '') === start;

  for (const base of [...sourceEvents].sort((a, b) => `${a.event_date} ${a.start_time}`.localeCompare(`${b.event_date} ${b.start_time}`))) {
    const date = addDays(base.event_date, deltaDays);
    const start = base.start_time || '';
    const alreadyPlanned = take.some((item) => sameSlot({ ...item.base, event_date: item.date }, base.title, start, date));
    if (existingEvents.some((e) => sameSlot(e, base.title, start, date)) || alreadyPlanned) {
      skipped.push({ title: base.title, date, reason: 'Tuan dich da co muc trung ten va gio' });
      continue;
    }
    take.push({ base, date });
  }
  return { take, skipped };
}
