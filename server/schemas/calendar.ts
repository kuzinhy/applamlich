import { z } from 'zod';

// Chuỗi giờ cho phép rỗng: văn bản nguồn không ghi giờ là chuyện bình thường,
// mục đó vẫn phải vào lịch dạng "chưa rõ giờ" chứ không bị bỏ.
const clockField = (label: string) =>
  z
    .string()
    .refine((v) => v === '' || /^([01]\d|2[0-3]):([0-5]\d)$/.test(v), `${label} phải có định dạng HH:MM (hoặc để trống)`);

export const CalendarEventSchema = z.object({
  title: z.string().min(1, "Tiêu đề không được để trống"),
  content: z.string().optional().default(""),
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải có định dạng YYYY-MM-DD"),
  start_time: clockField("Giờ bắt đầu").optional().default(""),
  end_time: clockField("Giờ kết thúc").nullable().optional(),
  chair: z.string().optional().default(""),
  participants: z.string().optional().default(""),
  location: z.string().min(1, "Địa điểm không được để trống"),
  confidence: z.number().min(0).max(1).default(0.9),
  reasoning: z.string().optional()
});

export type CalendarEvent = z.infer<typeof CalendarEventSchema>;
