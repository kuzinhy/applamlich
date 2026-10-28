---
name: nhap-lieu-van-ban
description: Nạp và xử lý văn bản nguồn cho ứng dụng lịch công tác (PDF, ảnh scan, DOCX, XLSX, TXT/CSV/HTML/JSON) và nhập lịch .ics từ Google/Outlook. Dùng khi gặp lỗi đọc tệp, PDF không có lớp chữ, OCR sai tiếng Việt, cảnh báo trùng nội dung, tệp quá lớn, RRULE không bung đúng, hoặc cần quét thư mục văn bản về.
---

# Nạp liệu văn bản

## Định dạng hỗ trợ

| Nhóm | Đuôi | Cách đọc |
|---|---|---|
| Word | `.docx` | Bóc XML, không cần mạng |
| Văn bản | `.txt`, `.md`, `.csv`, `.html`, `.htm`, `.json` | Đọc đồng bộ |
| PDF | `.pdf` | Lớp chữ bằng pdfjs; trang scan → render + OCR tiếng Việt |
| Ảnh | `.png`, `.jpg`, `.jpeg`, `.webp`, `.bmp`, `.tif`, `.tiff` | OCR tiếng Việt |
| Excel | `.xlsx` | Đọc từng sheet |
| Lịch | `.ics` | **Không vào hàng đợi văn bản** — `POST /api/import/ics` dựng thẳng thành mục lịch (xem bên dưới) |

Không hỗ trợ `.doc`, `.xls` cũ. Hãy "Lưu thành" `.docx`/`.xlsx` hoặc dán nội dung.

## Nhập lịch `.ics` (Google Calendar / Outlook)

`server/engines/ics_import.ts` là bộ phân tích RFC 5545 viết tay, không thêm thư viện:

- **Gãy dòng** (dòng tiếp theo bắt đầu bằng dấu cách) được nối lại; `\\,` `\\;` `\\n` được thoát.
- **Giờ**: `DTSTART;TZID=...:20261026T080000` giữ nguyên giờ địa phương; mốc `...Z` (UTC) **cộng 7 giờ** cho khớp giờ Việt Nam; `VALUE=DATE` → sự kiện cả ngày (`all_day`); thiếu `DTEND` thì lấy `DURATION`.
- **`RRULE`**: chỉ `FREQ=WEEKLY|DAILY`, nhận `BYDAY`, `INTERVAL`, `COUNT`, `UNTIL`, trần **60 mốc** cho một sự kiện. `COUNT` **tính cả mốc DTSTART**, và `BYDAY=FR` phải lấy được thứ Sáu của chính tuần đầu — hai điểm này từng làm sai test, đừng "dọn" lại vòng lặp tuần.
- **Người**: `ORGANIZER`/`ATTENDEE` lấy `CN=` (tên hiển thị), không lấy chuỗi mail thô; `STATUS:CANCELLED` bị bỏ và đếm trong `cancelled_skipped`.
- Kết quả là bản nháp `PROPOSED` với `source_document = "Lịch .ics: <tên tệp>"`, `confidence` 0.85 (có giờ) / 0.6 (cả ngày), ô thiếu liệt kê ở `missing_data_fields`. **Không** tự đặt giờ hay tên người cho mốc không có.
- Chống trùng theo `UID` qua `upsertEvents`, nên nạp lại cùng một tệp hai lần không tạo bản thứ hai.

## Giới hạn và biến môi trường

- `MAX_UPLOAD_MB` (mặc định 20): giới hạn tệp sau khi giải base64.
- `PDF_OCR_MAX_PAGES` (mặc định 10): số trang scan tối đa OCR mỗi tệp.
- `PDF_OCR_DISABLED=1`: tắt OCR, chỉ đọc lớp chữ.
- `RATE_UPLOAD_PER_HOUR` (mặc định 120): số lần nạp mỗi tài khoản/giờ.
- Dữ liệu tiếng Việt của Tesseract tải một lần vào `data/ocr-cache`; lần đầu cần mạng, sau đó chạy offline.

## Xử lý lỗi thường gặp

| Hiện tượng | Nguyên nhân | Cách xử lý |
|---|---|---|
| `409 DUPLICATE_SOURCE` | Nội dung trùng một nguồn đã có (so hash sau khi bỏ khoảng trắng) | Mở nguồn cũ để bóc tách; chỉ dùng `allow_duplicate` khi thật sự cần |
| `413` | Tệp vượt `MAX_UPLOAD_MB` | Tách nhỏ PDF, nén ảnh, hoặc tăng biến môi trường có chủ đích |
| "PDF không có lớp chữ và OCR không đọc được" | Bản scan mờ, trang nghiêng, OCR bị tắt | Chụp lại thẳng/đủ sáng, tăng độ phân giải, hoặc dán nội dung |
| "Chưa chạy được OCR" | Thiếu `@napi-rs/canvas`, chưa tải dữ liệu tiếng Việt | Kiểm tra log server; chạy lại khi có mạng |
| PDF đọc thiếu trang | Quá `PDF_OCR_MAX_PAGES` | Tách PDF thành nhiều tệp nhỏ hơn |
| Excel trống | Ô nằm ngoài vùng dữ liệu hoặc sheet ẩn | Mở Excel kiểm tra; dán nội dung nếu cần |
| Văn bản bóc ra thiếu dấu | Ảnh/scan kém hoặc font lạ | Dùng bản gốc số; OCR chỉ là phương án cuối |

## Quy trình nạp

1. Ưu tiên bản gốc số (`.docx`, PDF có lớp chữ) thay vì scan.
2. Nạp qua `POST /api/sources/upload` với `auto_extract=1` nếu muốn bóc tách ngay.
3. Đọc `meta` trả về: `pages`, `sheets`, `ocr` để biết đã OCR hay chưa.
4. Kiểm tra `extraction.created` và `extraction.error`; tệp OCR nên rà lại tên người và giờ.
5. Quét hàng loạt: thả tệp vào `data/drive_incoming/` rồi `POST /api/sources/ingest-dir`.

## An toàn

- Không nạp tệp từ nguồn không rõ, không mở link lạ trong văn bản.
- Không đưa `data/`, tệp scan hay `.env` lên git.
- Khi thử nghiệm, dùng `.scratch/` và bản sao kho; không ghi đè `data/app_store.json`.
