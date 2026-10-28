# Quy tắc nghiệp vụ

## Tuần và ngày

- Tuần ISO 8601, Thứ Hai là ngày đầu tuần. Dùng `weekDays`, `startOfWeek`, `mondayOfIsoWeek`, `isoWeekNumber` trong `server/utils/dates.ts`.
- Ngày lưu dạng `YYYY-MM-DD`, giờ `HH:MM` 24h. Không lưu timezone trong sự kiện; hiển thị và xuất theo `Asia/Ho_Chi_Minh`.
- Ngày lễ Việt Nam (kể cả âm lịch) lấy từ `server/utils/vn_holidays.ts`; không tự đoán.

## Giờ làm việc mặc định

`07:30–11:30` và `13:30–17:00`, làm việc Thứ Hai đến Thứ Bảy. Cấu hình trong `settings.working_hours`; tìm khung trống bỏ hẳn giờ nghỉ trưa.

## Điểm ưu tiên (10–100)

Công thức trong `server/engines/priority.ts`:

- 50% điểm nguồn (`source.priority_level`)
- 25% tính bắt buộc: "triệu tập/bắt buộc/khẩn" = 100; "kính mời/mời họp" = 80; "cử đại diện/tùy chọn" = 40; mặc định 60
- 15% cấp lãnh đạo: Bí thư/Phó Bí thư/Thường trực/Ban Thường vụ/Chủ tịch UBND = 100; Phó Chủ tịch/Ủy viên/Trưởng ban/Chánh Văn phòng = 80
- 10% tính gấp: "khẩn/đột xuất/gấp" = 100, còn lại 60

Ngưỡng dùng trong báo cáo: **≥ 80 là ưu tiên cao**, 60–79 trung bình, dưới 60 thấp. Cảnh báo quá tải khi một người ≥ 4 buổi hoặc ≥ 2 việc ưu tiên cao trong tuần.

## Xung đột

`analyzeConflicts` trong `server/engines/conflict.ts`:

| Loại | Mức | Điều kiện |
|---|---|---|
| `SAME_PERSON_DIFFERENT_LOC` | `CONFLICT HIGH` | Cùng người chủ trì/tham dự, giờ chồng lấn, khác địa điểm |
| `OVERLAP_TIME` | `CONFLICT HIGH` | Cùng người, cùng địa điểm, giờ chồng lấn |
| `OVERLAP_TIME` | `CONFLICT MEDIUM` | Khác người nhưng cùng phòng/địa điểm bị chiếm |
| `TRAVEL_BUFFER_VIOLATION` | `WARNING` | Khoảng nghỉ giữa hai việc ngắn hơn thời gian di chuyển |

Thời gian di chuyển mặc định: cùng tòa nhà 5 phút, cùng phường 15, cùng thành phố 30, ngoài khu vực 60 (`settings.travel_buffers`).

Sự kiện `REJECTED` không tham gia tính xung đột. Xung đột chỉ là **đề xuất**; không tự đổi giờ/người khi chưa có thao tác của cán bộ.

## Thể thức văn bản (Nghị định 30/2020/NĐ-CP)

- Khổ A4, lề trên 20–25 mm, dưới 20–25 mm, trái 30–35 mm, phải 15–20 mm.
- Font chữ: Times New Roman, cỡ 13–14; dãn dòng 1.5 hoặc 1.2–1.5.
- Cụm đầu văn bản: góc trái ghi hai dòng tổ chức (`settings.parent_org` phía trên, `settings.unit_name` phía dưới); góc phải ghi quốc hiệu – tiêu ngữ với văn bản chính quyền, hoặc "ĐẢNG CỘNG SẢN VIỆT NAM" với văn bản của tổ chức Đảng. Dưới là địa danh và ngày tháng năm.
- Tên văn bản in hoa, đậm; nội dung chia mục rõ ràng; nơi nhận và chữ ký ở cuối.
- Số/ký hiệu lịch tuần gợi ý: `<số tuần>-LCT/VP`; người ký lấy từ `settings.signer`.

## Vai trò

| Vai trò | Quyền chính |
|---|---|
| `admin` | Tất cả, kể cả users/settings/backup |
| `editor` | Đọc, sửa lịch/nguồn, chạy AI, duyệt đề xuất, ban hành |
| `viewer` | Chỉ đọc |

Route ghi không có trong `PERMISSION_RULES` mặc định **chỉ admin**.

## Dấu hiệu nhận diện thành phần Ban Xây dựng Đảng

`server/engines/party_signals.ts` quét mục lịch theo **17 nhóm dấu hiệu** và **không gọi AI**, nên mỗi kết quả đều nêu được căn cứ và tái hiện trong test. Mẫu dò và văn bản cùng đi qua `normalizeSignalText` (bỏ dấu, bỏ dấu câu, chữ thường) nên "Ban Thường vụ", "ban thuong vu", "UVBTV" đều khớp.

| Mức | Ý nghĩa | Ai được gắn |
|---|---|---|
| A | Chắc chắn thuộc thành phần Ban | Đã khớp đúng tên trong danh bạ (`assigned_person_ids`) |
| B | Dấu hiệu rõ, chưa thấy tên | Trưởng Ban nếu là Ủy viên Ban Thường vụ; Phó Trưởng Ban Thường trực/Phó Trưởng Ban theo phạm vi triệu tập; người hay dự theo quy tắc đã học |
| C | Nghiệp vụ tuyên giáo, kiểm tra–giám sát, báo cáo, tổ chức–đảng viên | Chuyên viên phụ trách |
| D | Hoạt động tập thể | Cả cơ quan Ban nếu nguồn nêu "toàn thể cán bộ, công chức" |
| E | Không liên quan | Không ai — mặc định bị ẩn, chỉ đối chiếu |

Ràng buộc nghiệp vụ:
- **Người dự theo ủy nhiệm**: chỉ ghi trạng thái chờ phân công khi chưa nêu tên thật, không tự bịa người.
- **Chức danh kiêm nhiệm** trong `personnel.role_description` (VD "Ủy viên Ban Thường vụ Đảng ủy") là căn cứ duy nhất để Trưởng Ban có mặt trong lịch khối Đảng.
- **Phạm vi triệu tập** phân biệt cơ quan Ban / khối Đảng / toàn phường / đảng viên; khớp nhầm cấp là lỗi nghiêm trọng — để trống và báo `SCOPE_NOT_RESOLVED`.
- **8 lớp kiểm tra** (`auditCoverage`) chạy độc lập với bước nhận diện: `BTV_NO_PERSON`, `SCOPE_NOT_RESOLVED`, `COMMITTEE_MEMBERSHIP_UNKNOWN`, `PREPARATION_UNOWNED`, `LEVEL_A_NO_OWNER`, `DOUBLE_BOOKED`, `MISSING_EVIDENCE`, `MISSING_TIME`/`UNKNOWN_PERSON`/`DISABLED_GROUP_LEAKED`/`PARTIAL_ROSTER`.
- Kết quả **chỉ là đề xuất**: `requires_confirmation: true` với mọi mục chưa đủ căn cứ, không tự ghi lịch, không tự ban hành. Muốn đổi hành vi thì chỉnh `settings.signal_disabled_groups` / `signal_extra_keywords` qua `PATCH /signals/config`, không sửa mẫu trong engine.
- Tên người so khớp sau khi bỏ lời gọi đầu câu (`canonicalPersonName`): "Đ/c Lê Thị Minh Tâm" và "Lê Thị Minh Tâm" là một người — danh bạ cũng dùng chuẩn này để chặn trùng.

## Thông báo và quyền riêng tư

- Telegram, email SMTP, webhook, bản tin đầu ngày và nhắc trước `reminder_before_hours` (mặc định 24h và 2h).
- `include_details: false` là mặc định: chỉ gửi giờ, số lượng, tiêu đề rút gọn — **không gửi tên lãnh đạo, địa điểm, nội dung**.
- Secret (bot token, SMTP password, webhook secret) luôn che khi trả API và không ghi vào audit/nhật ký.
