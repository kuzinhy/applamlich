# Bản đồ API

Tất cả dưới `/api`, cần phiên cookie `tg_session` trừ `/health`, `/auth/status|login|setup|google` và `/public/week/:token(+/print)` (chỉ mở khi đã bật link cho tuần đã ban hành).
Tuần nhận một trong ba dạng: `?week=YYYY-MM-DD` (ngày bất kỳ), `?week_number=44&year=2026`, hoặc body `week_start`.

## Phiên & người dùng

| Method | Đường dẫn | Ghi chú |
|---|---|---|
| GET | `/health` | Công khai; liệt kê provider AI, schema, số đếm |
| GET | `/auth/status` | Trạng thái đăng nhập, `needs_setup` |
| POST | `/auth/login` | `{username,password}`; khoá tạm sau nhiều lần sai |
| POST | `/auth/google` | `{credential}` — ID token Google được server xác minh chữ ký qua JWKS; cần `GOOGLE_CLIENT_ID`, trả `needs_drive_setup`. Không có client secret, không lưu token |
| PUT | `/auth/me/drive` | `{folder_id,folder_name,folder_url}` — tự phục vụ, lưu thư mục Drive của chính tài khoản (server chỉ giữ mã thư mục) |
| POST | `/auth/setup` | Chỉ khi chưa có tài khoản; cần mã khởi tạo |
| POST | `/auth/logout` | Xoá phiên hiện tại |
| GET | `/users`, POST/PATCH/DELETE `/users` | Quyền `users:manage` |

## Kho dữ liệu

| Method | Đường dẫn | Ghi chú |
|---|---|---|
| GET | `/state` | Toàn bộ tuần: events, conflicts, settings, sources… |
| GET/PUT | `/settings` | `unit_name` (đơn vị ban hành), `parent_org` (tổ chức cấp trên in ở dòng đầu cụm header; để trống thì bản in tự suy "ĐẢNG BỘ \<phường\>"), `advisor_unit` (tên đơn vị lập lịch nội bộ ở màn Tham mưu lịch, để trống → "Ban Xây dựng Đảng"), `document_number`, `signer`, `officer_name`, `officer_role`, `travel_buffers`, `working_hours`.PUT cần quyền `settings:write` |
| GET | `/agency` | Lịch Ban Xây dựng Đảng theo tuần: `items`, `personnel`, `memory` + `advisor_unit` và `advisor_head` (`{left:[cấp trên, tên Ban], right:[ĐẢNG CỘNG SẢN VIỆT NAM hoặc quốc hiệu – tiêu ngữ]}`) để màn hình và tệp .doc dùng chung một cụm đầu văn bản |
| GET | `/signals/config` | 17 nhóm dấu hiệu (id/label/base_level/rationale/patterns) + `disabled_groups`, `extra_keywords`, `learned_assignments`, `personnel`, `advisor_unit` |
| PATCH | `/signals/config` | Bật/tắt nhóm, thêm từ khóa tùy biến, sửa quy tắc đã học; id nhóm lạ bị loại. Cần `settings:write` |
| POST | `/signals/detect` | `{week_start}` hoặc `{source_id}`, `relevant_only?` → `detections` (schema 20 trường), `warnings` (8 lớp chống bỏ sót), `stats`, `roster`. Chỉ đọc và đề xuất, không ghi lịch. Lỗi: `404 NOTHING_TO_DETECT`, `400 EMPTY_ROSTER` |
| POST | `/signals/learn` | Học quy tắc "ai thường dự nhóm nào" từ lịch `APPROVED`/`PUBLISHED`; merge vào `signal_learned_assignments` (mỗi nhóm tối đa 4 người). Cần `agency:write`; `404 NO_APPROVED` |
| POST | `/personnel` | Thêm cán bộ vào danh bạ nhận diện `{name,title,role_description,is_active}`; tên <2 ký tự → 400, trùng tên sau khi bỏ lời gọi "đ/c" → 409, vượt 200 người → 400 |
| PATCH | `/personnel/:id` | Sửa thông tin/ngưng hoạt động; đổi tên trùng người khác → 409 |
| DELETE | `/personnel/:id` | Xoá khỏi danh bạ và gỡ người đó khỏi mọi quy tắc đã học |
| POST | `/events` | Tạo sự kiện tay |
| PATCH | `/events/:id` | Sửa; giữ lịch sử nguồn |
| POST | `/events/:id/move` | `{event_date,start_time}` dời lịch |
| POST | `/events/:id/status` | `DRAFT|PROPOSED|APPROVED|PUBLISHED|REJECTED` |
| POST | `/events/:id/ai-fill` | AI điền trường thiếu, không ghi đè trường đã có |
| DELETE | `/events/:id` | **Xoá mềm** — đẩy sự kiện vào `trash`, giữ nguyên id để khôi phục |
| POST | `/events/:id/tasks` | `{text, owner?, due_date?}` giao việc chuẩn bị; `text` rỗng hoặc đã đủ 20 việc → 422 |
| PATCH | `/events/:id/tasks/:taskId` | Sửa `{text, owner, due_date, done}`; `done=true` đóng dấu `done_at` |
| DELETE | `/events/:id/tasks/:taskId` | Xoá một việc chuẩn bị |
| POST | `/events/:id/repeat` | `{weeks:1..26}` nhân bản sang các tuần kế tiếp (chung `series_id`, việc chuẩn bị reset `done`, dời hạn +7 ngày/tuần); tuần đã có trùng tên+ngày bị bỏ qua, trả `created[]`/`skipped[]` |
| GET | `/sources` | Danh sách văn bản nguồn |
| POST | `/sources/paste` | `{file_name,text,source_type,priority_level}` |
| POST | `/sources/upload` | `{file_name,content_base64,auto_extract?}`; PDF/ảnh OCR tự động; trùng → `409 DUPLICATE_SOURCE` |
| POST | `/sources/:id/extract` | Bóc tách một nguồn |
| POST | `/sources/ingest-dir` | Quét `data/drive_incoming` |
| GET | `/drive/incoming` | Danh sách tệp chờ nạp |

## Lịch & xung đột

| Method | Đường dẫn | Ghi chú |
|---|---|---|
| GET | `/calendar/free-slots` | `date`, `duration`, `people` (phẩy), `location`, `prefer_start`, `limit` ≤ 12 |
| GET | `/conflicts` | Xung đột mở |
| POST | `/conflicts/reanalyze` | Tính lại toàn kho |
| POST | `/conflicts/auto-plan` | `{week, days_ahead?}` → phương án dời việc ưu tiên thấp |
| POST | `/conflicts/:id/resolve` | Đánh dấu đã xử lý, kèm ghi chú |
| POST | `/conflicts/:id/ai-suggest` | Gợi ý bằng AI, không tự áp dụng |
| POST | `/publish` | Ban hành các mục đã duyệt |
| GET | `/calendar/holidays` | Ngày lễ Việt Nam theo năm |

## AI

| Method | Đường dẫn | Ghi chú |
|---|---|---|
| GET | `/ai/status` | `providers[]`, `active`, `any_available` |
| POST | `/ai/agent` | `{message, allow_write?, week}` → `{reply, steps, created_events}` |
| POST | `/ai/week-draft` | `{save?}` → dự thảo tuần, `rejected[]` nêu lý do |
| POST | `/ai/chat` | Hỏi đáp trên dữ liệu tuần, trả `{text}` |
| POST | `/ai/parse-text` | Bóc tách đoạn dán tay, không lưu kho |

Không có provider: `503 {error, ai_available:false}`. Lỗi gọi provider: `502`.

## Nhắc việc & webhook

| Method | Đường dẫn | Ghi chú |
|---|---|---|
| GET/PUT | `/notify/config` | Secret trả về dạng `••••`; gửi lại chuỗi này thì giữ nguyên |
| POST | `/notify/test` | Gửi thử mọi kênh đang bật; 502 nếu không kênh nào gửi được |
| POST | `/notify/digest` | `{date?}` gửi bản tin ngày |
| GET | `/notify/log` | 60 lần gửi gần nhất |
| GET/PUT | `/webhook/config` | Bật/tắt, danh sách sự kiện, `include_details` mặc định tắt |
| POST | `/webhook/secret`, `/webhook/test` | Xoay khoá, gửi thử |
| GET | `/webhook/log` | 40 lần gửi gần nhất |

## Báo cáo & xuất bản

| Method | Đường dẫn | Ghi chú |
|---|---|---|
| GET | `/reports/week` | Tổng hợp ngày/người/địa điểm |
| GET | `/reports/month` | `?month=YYYY-MM`; sai định dạng → 422 |
| GET | `/export/docx` | Lịch tuần .docx (A4, Times New Roman 13) |
| GET | `/export/xlsx` | 5 sheet: lịch, theo ngày, theo người, xung đột, thông tin |
| GET | `/export/pdf` | PDF A4; thiếu font tiếng Việt → 500 nêu rõ `PDF_FONT_PATH` |
| GET | `/export/document` | HTML in trực tiếp |
| GET | `/export/ics` | Nhập Google/Outlook, `Asia/Ho_Chi_Minh` |
| GET | `/export/week.json` | Đối soát toàn tuần |

## Thùng rác, nhập .ics, sao lưu & chia sẻ

| Method | Đường dẫn | Ghi chú |
|---|---|---|
| GET | `/trash` | 10 bản xoá gần nhất (trần `TRASH_LIMIT=100`); viewer đọc được, ghi cần `events:write` |
| POST | `/trash/:id/restore` | Khôi phục đúng sự kiện; va chạm id thì cấp id mới, rồi tính lại xung đột |
| DELETE | `/trash/:id`, `/trash` | Xoá vĩnh viễn một bản / dọn sạch thùng |
| POST | `/import/ics` | `{file_name, content_base64, from?, to?}` — quyền `sources:write`. Trả `parsed_events[]` (bản nháp `PROPOSED`), `imported/merged/cancelled_skipped/out_of_range_skipped/notes/open_conflicts`. Bung `RRULE` WEEKLY/DAILY tối đa 60 mốc, UTC → `+07:00`, chống trùng theo `UID` |
| POST | `/backup` | Viết `data/backups/backup_<ts>.json` |
| GET | `/backup/download` | Quyền `backup` (chỉ admin); attaches chính kho hiện tại, có audit |
| POST | `/backup/restore` | Chỉ admin. `{confirm:'PHUC HOI', content_base64}`. Chặn: thiếu confirm, JSON không đủ `events[]`+`settings`, schema mới hơn app. Trước khi ghi viết `data/backups/pre_restore_<ts>.json`, sau đó thu hồi cookie phiên → client phải đăng nhập lại |
| POST/DELETE | `/publications/:id/share` | Bật/tắt link công khai (quyền `publish`). Bật trả `{share_token, print_path, json_path, views}`; token rỗng = chưa chia sẻ |
| GET | `/publications?week=` | Nhật ký ban hành; kèm `share_token` để UI hiển trạng thái link |
| GET | `/public/week/:token` | **Không cần đăng nhập.** JSON đã cắt: không số điện thoại, không tên nguồn, không confidence, không tasks; chỉ sự kiện `PUBLISHED` của đúng lần ban hành. Mỗi lượt xem ghi `share_access` (trần 300) |
| GET | `/public/week/:token/print` | Bản A4 cùng nội dung, toolbar rút gọn (không có nút .ics vì cần đăng nhập); token sai/hết hiệu lực → 404 HTML |

## Mã lỗi thường gặp

- `401 AUTH_REQUIRED` — chưa đăng nhập.
- `403 FORBIDDEN` / `PERMISSION_UNDECLARED` — thiếu quyền hoặc route chưa khai báo.
- `403 CSRF_BLOCKED` — Origin/Referer khác máy chủ.
- `409 DUPLICATE_SOURCE` — nội dung tệp đã có trong kho.
- `413` — tệp vượt `MAX_UPLOAD_MB`.
- `422` — tham số/sai định dạng hoặc không trích được nội dung.
- `429 RATE_LIMITED` — vượt `RATE_AI_PER_MIN` hoặc `RATE_UPLOAD_PER_HOUR`; có `Retry-After`.
