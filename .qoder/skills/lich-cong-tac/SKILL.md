---
name: lich-cong-tac
description: Vận hành và nâng cấp ứng dụng lịch công tác cơ quan tại D:\Du_an\TuyenGiaoCalendarAI. Dùng khi cần nạp văn bản, bóc tách lịch bằng AI, xử lý xung đột, ban hành tuần, xuất DOCX/XLSX/PDF/ICS, gửi nhắc việc, hoặc sửa code backend/frontend của repo này.
---

# Lịch công tác cơ quan

## Tổng quan

Ứng dụng Node + React chạy cục bộ cho Văn phòng Đảng ủy / UBND phường: nạp văn bản (PDF, ảnh scan, DOCX, XLSX, TXT), AI bóc tách thành sự kiện, rà xung đột, ban hành và xuất bản. Kho dữ liệu là JSON phẳng trong `data/app_store.json`.

## Bất biến bắt buộc

- **Không bịa dữ liệu lịch.** Thiếu thông tin thì trả lỗi rõ ràng hoặc để trống; không tự thêm sự kiện, người, giờ.
- **Giữ nguyên dữ liệu thật.** Không xoá/ghi đè `data/app_store.json`, không chạy script thử trên kho thật. Dùng `.scratch/` hoặc bản sao.
- **Không commit** `data/`, `.env`, `firebase-applet-config.json`, `*.traineddata`, `backups/`.
- **Mặc định bind `127.0.0.1`.** Chỉ mở mạng khi người dùng yêu cầu rõ.
- **Phân quyền fail-closed.** Route ghi mới phải thêm dòng vào `PERMISSION_RULES` trong `server/routes.ts`; route không khai báo chỉ admin dùng được.
- **Bí mật không ra API.** Token/secret phải che bằng `••••` khi trả về và giữ nguyên khi client gửi lại chuỗi đã che.
- **Thao tác ghi phải có audit** qua `audit(req, ...)` và `persist()` sau `mutate()`.

## Kiến trúc nhanh

| Tầng | Tệp chính |
|---|---|
| Khởi động, body limit, scheduler | `server.ts` |
| Toàn bộ API + middleware quyền/CSRF/rate limit | `server/routes.ts` |
| Kho JSON, migrate schema, audit | `server/store.ts`, `server/types.ts` |
| Bóc tách, xung đột, ưu tiên, tìm khung trống | `server/engines/*.ts` |
| Xuất / nhập `.ics` (RFC 5545, `RRULE`) | `server/engines/ics.ts`, `server/engines/ics_import.ts` |
| Agent, LLM đa provider, retrieval | `server/engines/agent.ts`, `llm.ts`, `gemini.ts`, `retrieval.ts` |
| Nhận diện thành phần công tác xây dựng Đảng (17 nhóm dấu hiệu, 5 mức A–E, 8 lớp chống bỏ sót — hoàn toàn xác định, không gọi AI) | `server/engines/party_signals.ts`, `server/services/party_detection.ts`, màn `src/components/PartyDetectionView.jsx` |
| Dịch vụ nghiệp vụ | `server/services/*.ts` |
| Giao diện React | `src/App.jsx`, `src/components/*.jsx`, `src/services/api.js` |
| PWA (manifest, service worker, icon) | `public/manifest.webmanifest`, `public/sw.js`, `tools/make_icons.mjs` |

Kho đang ở **schema v7**: mỗi sự kiện có `tasks[]` + `series_id`, lần ban hành có `share_token`, kho có `trash[]` và `share_access[]`. Đổi cấu trúc lần nữa thì tăng `SCHEMA_VERSION` và viết migrate cộng thêm.

## Luồng nghiệp vụ

1. **Nạp nguồn** — `POST /api/sources/upload` (base64, tự nhận dạng PDF/ảnh/Excel) hoặc `POST /api/sources/paste`. Trùng nội dung trả `409 DUPLICATE_SOURCE`. Lịch `.ics` của Google/Outlook đi ngả khác: `POST /api/import/ics`.
2. **Bóc tách** — `POST /api/sources/:id/extract` hoặc `POST /api/ai/week-draft`. Kết quả là sự kiện `PROPOSED`, gộp việc trùng, không ghi đè dữ liệu cán bộ đã sửa.
3. **Rà soát** — `GET /api/conflicts`, `POST /api/conflicts/auto-plan`, `GET /api/calendar/free-slots`. Chỉ đề xuất, không tự đổi lịch.
4. **Chuẩn bị & lặp** — `POST /api/events/:id/tasks` giao việc có người làm + hạn nộp (`GET /api/analytics/deadlines` gộp thành sổ tay đôn đốc, phân loại `task`/`text`); `POST /api/events/:id/repeat` nhân bản sinh hoạt định kỳ sang các tuần kế tiếp.
5. **Duyệt & ban hành** — `POST /api/events/:id/status`, `POST /api/publish`, rồi `POST /api/publications/:id/share` nếu cần link tra cứu công khai.
6. **Xuất bản** — `/api/export/document|ics|week.json|docx|xlsx|pdf`, báo cáo `/api/reports/week|month`.
7. **Nhắc việc** — `/api/notify/config|test|digest`, scheduler nền tự gửi Telegram/email/webhook.
8. **Dọn & thu hồi** — xoá lịch là vào `trash` (`/api/trash` + `/restore`), thu hồi ban hành `POST /api/publications/:id/revoke`, phục hồi dữ liệu `POST /api/backup/restore`.

## Quy tắc khi sửa code

- Đọc `server/types.ts` trước khi thêm trường; tăng `SCHEMA_VERSION` và viết migrate khi đổi cấu trúc kho.
- Route mới: khai báo quyền, kiểm tra đầu vào, trả mã lỗi tiếng Việt có `code` ổn định, gọi `mutate` + `persist`.
- AI luôn đi qua lớp `ask`/`askJson`/`runAgent`; không gọi thẳng SDK hãng. Không có provider thì trả `503` kèm `ai_available: false`, không trả dữ liệu mẫu.
- Tôn trọng `RATE_RULES` cho route AI/nạp tệp; không hạ mức chặn để chạy thử.
- Giao diện dùng tiếng Việt, tông xanh nhạt (`#2563EB` / `#EFF6FF`), không thêm thư viện UI nặng.

## Lệnh

```bash
cd /d/Du_an/TuyenGiaoCalendarAI
npm run dev     # chạy cục bộ, mở http://127.0.0.1:3000
npm run lint    # tsc --noEmit
npm test        # node test + tsx
npm run build   # vite build
```

## Checklist trước khi kết thúc

- [ ] `npm run lint` và `npm test` xanh.
- [ ] Không đụng `data/`, `.env`, secret.
- [ ] Route mới có quyền + audit + test nếu là logic thuần.
- [ ] UI hiển thị lỗi thật, không nuốt lỗi thành dữ liệu rỗng.
- [ ] Đã dọn script/tệp tạm trong `.scratch/`.

## Tài nguyên

- `references/api-map.md` — bảng endpoint, tham số và mã lỗi.
- `references/domain-rules.md` — tuần ISO, ưu tiên, xung đột, thể thức, quyền riêng tư thông báo.
