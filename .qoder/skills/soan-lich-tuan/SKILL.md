---
name: soan-lich-tuan
description: Soạn nội dung và thể thức lịch công tác tuần cho Đảng ủy/UBND phường từ dữ liệu đã bóc tách. Dùng khi cần viết lời văn lịch tuần, chuẩn hoá tên người/chức danh, đặt số ký hiệu, sắp thứ tự ưu tiên, viết phần chuẩn bị và nơi nhận, hoặc kiểm tra thể thức trước khi ban hành.
---

# Soạn lịch tuần

## Nguyên tắc

- Chỉ dùng dữ kiện có trong kho (`events`, `settings`, `sources`). Không tự thêm việc, người, giờ, địa điểm.
- Thiếu dữ kiện thì giữ trống và ghi rõ "chưa có trong dữ liệu", hoặc hỏi lại; không suy đoán tên riêng.
- Giọng văn hành chính, ngắn, trung tính, không viết tắt tuỳ tiện.
- Mỗi ngày chỉ nêu việc thật sự diễn ra; không tạo dòng "không có lịch" trừ khi người dùng yêu cầu.

## Cấu trúc một dòng lịch

```
- 08:00–09:30: <Tên cuộc họp>. Chủ trì: <họ và tên, chức danh>.
  Thành phần: <cơ quan/đơn vị/cá nhân>. Địa điểm: <phòng, địa chỉ>.
  Chuẩn bị: <đơn vị> gửi <tài liệu> trước <hạn>.
```

Quy tắc trình bày:

- Giờ dạng `HH:MM–HH:MM`; nếu văn bản chỉ ghi "sáng/chiều" thì dùng `08:00–11:00` hoặc `14:00–16:30` và hạ `confidence`.
- Tên người: họ tên đầy đủ; chức danh viết đúng thứ bậc (Bí thư, Phó Bí thư Thường trực, Chủ tịch, Phó Chủ tịch, Trưởng phòng…).
- Cùng một địa điểm trong ngày thì ghi đầy đủ lần đầu, các lần sau có thể ghi "tại phòng họp A".
- Việc có nhiều lãnh đạo chủ trì: liệt kê đủ, không gộp thành "lãnh đạo đơn vị".
- Phần chuẩn bị phải nêu **đơn vị + đầu việc + hạn nộp** nếu văn bản có.

## Việc chuẩn bị và lịch lặp (schema v7)

- Khi văn bản ghi rõ "A chuẩn bị X trước ngày Y", ghi thành **một việc chuẩn bị** thay vì chỉ nhét vào ô mô tả: `POST /api/events/:id/tasks` với `{text, owner, due_date}`. Mỗi mục lịch tối đa 20 việc; `due_date` bắt buộc `YYYY-MM-DD`, không có hạn thì để trống chứ không suy đoán.
- `GET /api/analytics/deadlines` trả hai loại: `source:"task"` (việc giao rõ người + hạn, đáng tin) và `source:"text"` (máy đọc từ cụm "trước ngày dd/MM" — **bao giờ cũng kiểm chứng lại** trước khi đôn đốc).
- Sinh hoạt định kỳ (giao ban thứ Hai, tiếp công dân định kỳ) chỉ cần soạn **một lần**, rồi `POST /api/events/:id/repeat {weeks}`. Chuỗi chung `series_id`; tuần đã có việc trùng tên sẽ bị bỏ qua chứ không nhân đôi.
- Bản lặp mang `status` của bản gốc nhưng `PUBLISHED` hạ về `APPROVED` — tuần sau vẫn phải ký ban hành lại, và các việc chuẩn bị trở lại trạng thái *chưa xong* với hạn nộp dời +7 ngày.

## Thứ tự ưu tiên trong ngày

1. Việc do cấp trên triệu tập, có từ "khẩn/hỏa tốc" (ưu tiên 100).
2. Việc do Bí thư/Chủ tịch chủ trì.
3. Việc có thời gian cố định, đông thành phần.
4. Việc nội bộ, linh hoạt giờ.

Dùng `priority_score` thực tế từ kho; không tự đổi điểm.

## Thể thức văn bản

Theo Nghị định 30/2020/NĐ-CP:

- A4; lề trái 30–35 mm, phải 15–20 mm, trên/dưới 20–25 mm.
- Times New Roman 13–14; tiêu đề in hoa đậm.
- Góc trái: hai dòng tổ chức — dòng trên là cấp trên trực tiếp (`settings.parent_org`, ví dụ "Đảng bộ Thành phố Hồ Chí Minh"), dòng dưới là đơn vị ban hành (`settings.unit_name`), cả hai in hoa; để trống `parent_org` thì bản in tự suy "ĐẢNG BỘ <tên phường>".
- Góc phải: văn bản của Đảng (đơn vị có "Đảng bộ", "Đảng ủy", "Chi bộ", "Ban Thường vụ") ghi "ĐẢNG CỘNG SẢN VIỆT NAM"; văn bản chính quyền ghi quốc hiệu + tiêu ngữ. Dưới là địa danh, ngày tháng năm.
- Số/ký hiệu gợi ý: `<số tuần>-LCT/VP` (ví dụ `44-LCT/VP`), lấy người ký từ `settings.signer`.
- Cuối văn bản: "Nơi nhận" và khối chữ ký. Không tự bịa số văn bản hay người ký.

## Quy trình

1. Đọc `settings` (đơn vị, tổ chức cấp trên, số hiệu, người ký, giờ làm việc) và sự kiện tuần đã duyệt.
2. Sắp theo ngày, trong ngày theo giờ; bỏ `REJECTED`.
3. Soạn từng dòng theo mẫu, giữ nguyên dữ kiện gốc.
4. Đối chiếu thể thức bằng `GET /api/util/format-check?week=YYYY-MM-DD` trước khi ban hành.
5. Nêu rõ việc còn thiếu dữ kiện để cán bộ bổ sung.

## Không làm

- Không thêm khách mời, địa điểm, số hiệu, người ký ngoài dữ liệu.
- Không đổi giờ để "cho đẹp" lịch.
- Không gộp hai cuộc họp khác nhau cùng giờ thành một.
- Không ghi "đã mời" khi chưa có thông tin mời.
