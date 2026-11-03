# Trợ lý lập lịch công tác cho Văn phòng Đảng ủy — UBND phường

Ứng dụng nội bộ giúp cán bộ văn phòng **rút ngắn một tuần làm việc**: nạp thư mời/văn bản chỉ đạo, để AI bóc tách thành các mục lịch, tự dò trùng giờ – trùng người – thiếu thời gian di chuyển, soi thể thức văn bản theo Nghị định 30/2020/NĐ-CP, rồi ban hành và lưu nhật ký.

Chạy hoàn toàn trên máy địa phương (không cần máy chủ riêng; dữ liệu chỉ rời máy khi gọi nhà cung cấp AI — có thể dùng **Ollama cục bộ** để không rời máy). Ứng dụng **có tài khoản đăng nhập và ba mức phân quyền** (Quản trị / Biên tập / Chỉ xem). Tên đơn vị, tổ chức cấp trên, người ký và cán bộ phụ trách đều đặt trong **Cài đặt**. Repo công khai **không chứa lịch thật** — xem [Dữ liệu & bảo mật](#-dữ-liệu--bảo-mật).

---

## Mục lục

- [Tính năng](#-tính-năng-theo-luồng-nghiệp-vụ)
- [Tài khoản & phân quyền](#-tài-khoản-phiên--phân-quyền)
- [Tiện ích kết nối: webhook](#-tiện-ích-kết-nối-webhook)
- [Nhắc việc nhẹ nhàng](#7-nhắc-việc-nhẹ-nhàng-không-lộ-dữ-liệu)
- [Trợ lý AI & kỹ năng có sẵn](#-trợ-lý-ai--kỹ-năng-có-sẵn)
- [Gọn thao tác cho cán bộ văn phòng](#-gọn-thao-tác-cho-cán-bộ-văn-phòng)
- [Chạy nhanh](#-chạy-nhanh)
- [Biến môi trường](#-biến-môi-trường)
- [Kiến trúc](#-kiến-trúc)
- [API](#-api)
- [Dữ liệu & bảo mật](#-dữ-liệu--bảo-mật)
- [Công khai qua HTTPS](#-công-khai-qua-https)
- [Kiểm thử](#-kiểm-thử)
- [Đồng bộ ngược về Google AI Studio](#-đồng-bộ-ngược-về-google-ai-studio)
- [Giới hạn đã biết](#-giới-hạn-đã-biết)

---

## ✨ Tính năng theo luồng nghiệp vụ

### 1. Tiếp nhận văn bản
- Đọc **.docx**, **.txt, .md, .csv, .html, .json**, **.xlsx** (từng sheet), **.pdf** (lớp chữ bằng pdfjs), và **ảnh scan** `.png/.jpg/.jpeg/.webp/.bmp/.tif/.tiff` bằng OCR tiếng Việt (Tesseract, chạy cục bộ).
- Lịch **.ics** của Google Calendar / Outlook không đi qua hàng đợi văn bản: thả vào hộp *Thu thập nguồn* là nhập thẳng thành mục lịch (xem [Gọn thao tác cho cán bộ văn phòng](#-gọn-thao-tác-cho-cán-bộ-văn-phòng)).
- PDF scan không có lớp chữ được **render từng trang rồi OCR** (tối đa `PDF_OCR_MAX_PAGES` trang, mặc định 10). Lần OCR đầu cần mạng để tải dữ liệu tiếng Việt; sau đó chạy offline.
- Chặn **nạp trùng nội dung** bằng vân tay SHA-256 sau khi chuẩn hoá khoảng trắng: cùng một văn bản dưới hai tên tệp trả `409 DUPLICATE_SOURCE`.
- Lấy văn bản từ **Google Drive**: đăng nhập Google (Firebase Auth, scope `drive.readonly`), hoặc đơn giản là thả tệp vào `data/drive_incoming/` rồi bấm *Nhập thư mục*.
- Mỗi mục lịch giữ lại **tên văn bản nguồn, số trang, đoạn** để truy vết "mục này lấy từ đâu".

### 2. AI bóc tách và soạn lịch
- Bóc tách một văn bản thành danh sách sự kiện `PROPOSED` (AI chỉ **đề xuất**, cán bộ mới là người duyệt).
- **Soạn cả tuần** từ kho văn bản đã nạp, prompt kèm danh sách cán bộ đương nhiệm và 8 bài học hiệu chỉnh gần nhất làm few-shot.
- **Đa nhà cung cấp miễn phí**: Gemini, mọi API OpenAI-compatible (Groq/OpenRouter/…) và **Ollama cục bộ** (`LLM_PROVIDER=auto|gemini|ollama|openai`). `GET /api/ai/status` cho biết provider nào đang sẵn sàng.
- **Trợ lý agent có công cụ** (`POST /api/ai/agent`): tìm sự kiện, xem tuần, tìm khung trống, kiểm tra xung đột, tra cán bộ, thống kê tải, và tạo đề xuất khi được cho phép. Agent theo giao thức JSON-ReAct nên chạy được cả với model nhỏ cục bộ.
- Gọi model có **thử lại + sửa JSON**: khi mô hình trả JSON kèm chữ thừa hoặc bọc trong ` ```json `, bộ phân tích vẫn cứu được dữ liệu trước khi báo lỗi.
- Không có provider nào → tính năng AI trả **503 kèm hướng dẫn**, **không bịa lịch mẫu**.

### 3. Chống trùng và giữ công sức của cán bộ
- Cùng ngày + cùng giờ + nội dung gần trùng (so khớp tiếng Việt đã bỏ dấu) → **gộp làm một**, ghi thêm tên văn bản khác vào trường `also_from`.
- Khi gộp, **không ghi đè** phần cán bộ đã sửa: chỉ bổ sung nguồn, lấy ưu tiên/độ tin cao nhất và điền vào ô còn trống.
- Sửa tay một mục do AI sinh ra → hệ thống ghi một **bài học** (`memory`) để lần soạn sau không tái phạm.

### 4. Rà soát xung đột
- Trùng giờ cùng người chủ trì / cùng lãnh đạo (mức `HIGH`), hai sự kiện trùng khung giờ (`MEDIUM`), và **vi phạm buffer di chuyển** giữa hai địa điểm (cùng phòng họp / cùng phường / cùng thành phố / ngoài khu vực — chỉnh được trong Cài đặt).
- **Kéo – thả** thẻ sự kiện trên lưới lịch để dời ngày giờ; mỗi lần dời đều ghi audit log.
- **Tự động lập phương án**: giữ việc điểm ưu tiên cao, dời việc thấp hơn sang khung trống gần nhất (cùng ngày rồi các ngày làm việc kế tiếp), đã trừ giờ nghỉ trưa và thời gian di chuyển. Cán bộ bấm áp dụng mới đổi lịch.
- **Tìm khung giờ trống** ngay trong hộp sửa sự kiện: xét người chủ trì, địa điểm, thời gian di chuyển và khoảng cách tới giờ cũ.
- Có thể nhờ AI gợi ý phương án xử lý cho từng cặp xung đột.

### 5. Thể thức văn bản và ban hành
- **Cụm đầu văn bản tự đúng theo loại đơn vị**: góc trái in hai dòng tổ chức (cấp trên ở `settings.parent_org` → đơn vị ban hành ở `settings.unit_name`), để trống `parent_org` thì tự suy "ĐẢNG BỘ \<tên phường\>". Đơn vị mang tên Đảng bộ/Đảng ủy/Chi bộ/Ban Thường vụ ghi "ĐẢNG CỘNG SẢN VIỆT NAM", cơ quan chính quyền ghi quốc hiệu – tiêu ngữ.
- **Lịch nội bộ Ban ở màn Tham mưu** tự đặt tên được ở *Cài đặt › Đơn vị lập lịch nội bộ* (`settings.advisor_unit`, mặc định "Ban Xây dựng Đảng"): dòng trên là đơn vị ban hành lịch tuần (`unit_name`), dòng dưới là tên Ban, góc phải theo loại tổ chức của cấp trên.
- **Màn "Nhận diện thành phần"** quét toàn bộ mục lịch của tuần theo 17 nhóm dấu hiệu công tác xây dựng Đảng (Ban Thường vụ, lãnh đạo Ban, Ban Chỉ đạo 35, kiểm tra–giám sát, tuyên giáo–dân vận, hội nghị cấp ủy, tổ chức–đảng viên, ủy nhiệm/thay mặt, chuẩn bị nội dung, hoạt động tập thể…), chia 5 mức A–E và với mỗi đề xuất nêu **ai được giao – ai gợi ý – ai cùng dự – ai chuẩn bị**, kèm căn cứ (tên người, chức danh kiêm nhiệm, nhóm dấu hiệu + mẫu khớp, số trang trích dẫn). Có 8 lớp kiểm tra độc lập chống bỏ sót (BTV chưa có người, mức A chưa ai phụ trách, một người trùng hai việc, tên ngoài danh bạ…), bảng tự xếp theo ngày/giờ, nút **Vào lịch** chỉ mở bản nháp để người dùng kiểm rồi lưu — ứng dụng không tự phân công, không tự phê duyệt. Màn này còn quản lý **danh bạ cán bộ** (thêm/ngưng/xoá, chống trùng tên kể cả khi ghi "đ/c") và bật/tắt từng nhóm dấu hiệu hoặc thêm từ khóa riêng của đơn vị; quy tắc "ai thường dự nhóm nào" học từ lịch đã duyệt, mỗi nhóm tối đa 4 người.
- **Soi thể thức** theo Nghị định 30/2020/NĐ-CP: quốc hiệu – tiêu ngữ, địa danh, số/ký hiệu, thẩm quyền ký (phân biệt khối Đảng và khối chính quyền, cảnh báo khi đơn vị ban hành lệch với chức danh người ký), trích yếu, ô trống trong bảng, định dạng giờ, xung đột còn mở, nơi nhận → chấm **điểm /100**.
- **Ban hành tuần**: chuyển mọi mục `APPROVED` → `PUBLISHED`, ghi một dòng **nhật ký ban hành** (số văn bản, người ký, đơn vị, danh mục mục đã ban hành). **Thu hồi** để trả về `APPROVED` nếu phát hiện sai.
- **Link tra cứu công khai** cho tuần đã ban hành: bật/tắt ngay trên chế độ Văn bản hành chính, thu hồi bất cứ lúc nào (xem [Gọn thao tác cho cán bộ văn phòng](#-gọn-thao-tác-cho-cán-bộ-văn-phòng)).
- Lưới lịch tự đánh dấu **ngày lễ dương lịch** (Điều 112 Bộ luật Lao động) và cuối tuần; ngày âm lịch do văn bản cấp trên quyết định, app **không tự đoán**.

### 6. Xuất bản — miễn phí, chạy cục bộ

| Đầu ra | Cách lấy |
|---|---|
| Lịch A4 để in / lưu PDF | Nút *In* ở chế độ Văn bản hành chính, hoặc `GET /api/export/document?week=YYYY-MM-DD` |
| **Word .docx** đúng thể thức | `GET /api/export/docx?week=…` (A4, Times New Roman 13, bảng lịch, khối chữ ký) |
| **Excel .xlsx** nhiều sheet | `GET /api/export/xlsx?week=…` (lịch, theo ngày, theo người, xung đột mở, thông tin) |
| **PDF** A4 | `GET /api/export/pdf?week=…` (chữ Times New Roman có dấu, nhúng font lấy từ máy) |
| **.ics** cho Google Calendar / Outlook | `GET /api/export/ics?week=…` (time zone `Asia/Ho_Chi_Minh`, gãy dòng theo RFC 5545) |
| **JSON** để đối soát / nhập hệ thống khác | `GET /api/export/week.json?week=…` |
| **Báo cáo tuần / tháng** | `GET /api/reports/week?week=…`, `GET /api/reports/month?month=YYYY-MM` |
| Sao lưu toàn bộ kho | `POST /api/backup` → `data/backups/backup_<timestamp>.json` |
| Tải bản sao lưu về máy | `GET /api/backup/download` (quyền `backup`, có sẵn ở *Cài đặt › Dữ liệu & sao lưu*) |
| Phục hồi từ bản sao lưu | `POST /api/backup/restore` (chỉ admin, phải gõ `PHUC HOI`; tự viết bản an toàn `pre_restore_*.json` trước khi ghi) |
| Bản tra cứu công khai của tuần đã ban hành | `GET /api/public/week/<token>/print` — mở không cần đăng nhập, tắt link là hết hiệu lực |

Giao diện có nút **Tải Word / Excel / PDF** ngay trên thanh lệnh; mục *Thống kê tải công tác* hiển thị thêm báo cáo tháng và số liệu từng tuần ISO.

**Font** — app không tải chữ từ mạng nên chạy được hoàn toàn offline (kể cả PWA):

- Giao diện: `"Segoe UI"` rồi tới font hệ thống (`system-ui`, `-apple-system`, `Roboto`, `Arial`…), khai báo một lần bằng biến `--font-ui` trong `src/index.css`.
- Văn bản hành chính (bản in A4, .docx, .pdf, tệp .doc của Ban Xây dựng Đảng): **Times New Roman**, fallback đúng số đo `Tinos` / `Nimbus Roman` / `Liberation Serif` cho máy chưa có Times.
- Bảng tính .xlsx vẫn dùng Calibri vì là số liệu để lọc, không phải bản văn bản để ký.
- PDF chọn font `.ttf` theo từng họ (regular và bold cùng họ), ưu tiên nhóm serif: Times New Roman → Liberation Serif → DejaVu Serif, chỉ rơi sang Arial/Segoe UI/DejaVu Sans khi máy không còn serif nào. Không dò được phông nào thì báo lỗi rõ ràng thay vì xuất tệp mất dấu.

### 7. Nhắc việc nhẹ nhàng, không lộ dữ liệu

- **Telegram**, **email SMTP** và **webhook** cấu hình trong *Cài đặt*; bật/tắt từng kênh, gửi thử ngay.
- **Bản tin đầu ngày** theo giờ đặt trước và **nhắc trước** 24h/2h (tuỳ chỉnh danh sách mốc).
- Scheduler chạy trong tiến trình server, mặc định mỗi 60 giây (`NOTIFY_SCHEDULER=0` để tắt).
- Mặc định **không gửi tên lãnh đạo, địa điểm hay nội dung** (`include_details=false`); chỉ bật khi người dùng chủ động.
- Token/secret luôn được che (`••••`) khi trả về API; gửi lại chuỗi che thì server giữ nguyên giá trị cũ.

---

## 🧩 Gọn thao tác cho cán bộ văn phòng

- **Việc chuẩn bị có người làm, hạn nộp và trạng thái**: mỗi mục lịch thêm được tối đa 20 đầu việc kiểu *"Văn phòng chuẩn bị tài liệu" — "08:30 28/10" — chưa xong*. Bấm tròn/vuông để đánh dấu hoàn thành, xoá từng việc, hạn nộp đẩy lùi tự nhiên khi lặp lịch.
- **Sổ tay đôn đốc hạn chót** gộp hai nguồn: việc giao có hạn rõ (cột *Trạng thái* bấm **Đã xong** là cập nhật luôn vào sự kiện) và hạn trích từ câu chữ trong phần Chuẩn bị/Nội dung — hai loại có nhãn khác nhau để biết cái nào cần kiểm chứng.
- **Lặp hằng tuần**: sinh hoạt định kỳ (giao ban, tiếp công dân) tạo một lần rồi **nhân bản sang 1–26 tuần kế tiếp**; tuần đã có việc trùng tên bị bỏ qua, việc chuẩn bị sao lại ở trạng thái *chưa xong*, cả chuỗi chung `series_id` để lần lặp sau không tạo bản trùng.
- **Nhập lịch .ics từ Google/Outlook**: thả tệp `.ics` vào hộp *Thu thập nguồn*. Bộ phân tích dựng lại sự kiện cả ngày, đổi giờ UTC → giờ Việt Nam, bung `RRULE` `WEEKLY`/`DAILY` (kèm `BYDAY`, `INTERVAL`, `COUNT`, `UNTIL`, tối đa 60 lần lặp), bỏ bản `CANCELLED`, lấy tên người từ `ORGANIZER`/`ATTENDEE`. Nạp lại theo `UID` nên hai lần cùng một tệp **không tạo bản trùng**; mục nhập vào để ở trạng thái `PROPOSED` để người duyệt.
- **Thùng rác**: xoá mục lịch chỉ chuyển vào thùng (giữ 100 bản gần nhất, kèm người xoá và thời điểm). *Cài đặt › Dữ liệu & sao lưu* cho **khôi phục** lại đúng sự kiện đó hoặc xoá vĩnh viễn.
- **Phím tắt**: `n` thêm lịch, `t` về tuần này, `←`/`→` chuyển tuần, `/` nhảy vào ô tìm kiếm, `1…4` chuyển tab Tổng quan/Lịch/Chờ duyệt/Xung đột. Phím không nhận khi đang gõ trong ô văn bản.
- **Link tra cứu công khai cho tuần đã ban hành**: tạo token ngẫu nhiên 24 byte, mở không cần tài khoản, chỉ hiển thị các mục `PUBLISHED` của đúng lần ban hành đó, **không kèm** tên văn bản nguồn, số điện thoại, độ tin cậy hay ghi chú nội bộ. Số lượt xem ghi lại để biết có người mở thật; tắt link thì mọi lượt đã gửi trước đó trả 404 ngay.
- **Cài như ứng dụng (PWA)**: bản production có manifest + service worker, cài được từ Chrome/Edge để mở thành cửa sổ riêng. **Service worker không cache `/api`** — lịch thật của phường không nằm lại trên đĩa máy tính dùng chung; mất mạng thì ứng dụng vẫn mở được vỏ và báo rõ "đây là dữ liệu đã tải trước đó".

---

## 🤖 Trợ lý AI & kỹ năng có sẵn

**Trong ứng dụng**: khung chat ở thanh lệnh gọi `/api/ai/agent`; agent có 9 công cụ (tìm sự kiện, xem tuần, tìm khung trống, kiểm tra xung đột, tra cán bộ, thống kê tải, liệt kê việc chuẩn bị còn hạn, tạo đề xuất lịch, giao việc chuẩn bị cho một mục lịch). Mọi bước agent gọi đều hiển thị; tạo lịch chỉ ở trạng thái `PROPOSED` và phải có `allow_write`.

**Trong Qoder** (mở repo này):

| Kỹ năng | Dùng khi |
|---|---|
| `.qoder/skills/lich-cong-tac` | Vận hành/sửa ứng dụng: nạp nguồn, bóc tách, xung đột, ban hành, xuất bản, quyền và audit |
| `.qoder/skills/soan-lich-tuan` | Viết lời văn, thứ tự ưu tiên, thể thức Nghị định 30/2020, nơi nhận, chữ ký |
| `.qoder/skills/nhap-lieu-van-ban` | Xử lý PDF/ảnh scan/Excel, lỗi OCR, trùng nội dung, giới hạn dung lượng |

Hai agent gợi ý đã tạo ở dạng **bản nháp** trong Qoder: *Thư ký lịch công tác* và *Kiểm tra thể thức lịch tuần*. Mở phần Agent, xem lại rồi bấm **Continue configuration** để lưu vào máy.

---

## 🔐 Tài khoản, phiên & phân quyền

Mọi endpoint đều cần đăng nhập, trừ `GET /api/health`, ba route `POST /api/auth/status|login|setup` và **đường dẫn tra cứu công khai** `/api/public/week/<token>` (+ `/print`) — route cuối chỉ mở được khi quản trị/biên tập chủ động bật link cho một tuần đã ban hành, và trả bản đã cắt bỏ thông tin nhạy cảm. Các route `/api/auth/me|logout|password|sessions` chỉ bắt buộc *có phiên*, không xét vai trò — ai cũng đổi được mật khẩu và thu hồi thiết bị của chính mình. Frontend không hiển thị lịch nếu chưa có phiên hợp lệ.

| Vai trò | Làm được | Không làm được |
|---|---|---|
| **Quản trị** (`admin`) | Soạn + duyệt + ban hành, đổi Cài đặt, sao lưu, tải bản sao lưu về máy, **phục hồi** từ tệp sao lưu, tạo/sửa/xoá tài khoản, đọc nhật ký, cấu hình webhook | — |
| **Biên tập** (`editor`) | Soạn lịch, giao việc chuẩn bị, lặp lịch, nhập `.ics`, thùng rác/khôi phục, nạp văn bản nguồn, duyệt đề xuất AI, kéo-thả dời lịch, ban hành/thu hồi tuần, bật/tắt link công khai, chạy AI | Đổi Cài đặt chung, sao lưu/phục hồi, quản lý tài khoản, xem nhật ký thao tác, bật webhook |
| **Chỉ xem** (`viewer`) | Xem lịch, xem xung đột, tìm kiếm, in A4 / xuất .ics, xem danh sách thùng rác | Mọi thao tác ghi — kể cả xoá vào thùng, nhập `.ics` và bật link |

Bảng quyền nằm ở `server/auth.ts` (`ROLE_PERMISSIONS`) và được **server** kiểm tra cho từng request — ẩn nút trên giao diện chỉ là tiện ích, không phải biện pháp bảo mật. Route ghi chưa được khai báo trong `PERMISSION_RULES` mặc định **chỉ admin dùng được** (fail-closed), để thêm endpoint mới không vô tình mở quyền.

Chi tiết kỹ thuật:

- **Mật khẩu**: băm bằng `scrypt` (N=16384, r=8, p=1, muối 16 byte) từ `node:crypto`, **không thêm thư viện đăng nhập nào**. So khớp bằng `timingSafeEqual`. Không có chức năng "quên mật khẩu" — quản trị viên đặt lại trong *Tài khoản & phân quyền*.
- **Phiên**: token ngẫu nhiên 24 byte (base64url), lưu trong `data/app_store.json` để thu hồi được, cookie `HttpOnly`, `SameSite=Strict` (production qua HTTPS dùng `SameSite=None; Secure`), thời hạn 7 ngày (`SESSION_TTL_DAYS`).
- **Rút quyền có hiệu lực ngay**: đổi vai trò / vô hiệu hoá / đặt lại mật khẩu của một người sẽ thu hồi toàn bộ phiên của người đó ở lần kiểm tra kế tiếp (vai trò đọc từ bản ghi user, không đọc từ phiên).
- **Chống dò mật khẩu**: khoá tài khoản sau `LOGIN_MAX_FAILURES` lần sai, thời gian khoá tăng gấp đôi mỗi lần (`LOGIN_LOCKOUT_MINUTES`), tính cả theo IP lẫn theo tên đăng nhập. Tên đăng nhập không tồn tại vẫn tốn một lần băm scrypt y như thật, để không đo được tài khoản nào có trên hệ thống.
- **Nhật ký thao tác**: mỗi dòng `audit_log` có `actor` (tên đăng nhập) và `ip`; các dòng cũ trước khi có đăng nhập hiển thị là "(trước khi có đăng nhập)".
- **IP thật**: chỉ đọc `X-Forwarded-For` / `X-Forwarded-Proto` khi `TRUST_PROXY=1`, tránh giả mạo header khi chạy không có proxy.
- **Mã khởi tạo**: lần chạy đầu tiên chưa có tài khoản nào, server in ra console một mã 8 ký tự ngẫu nhiên. Người ngồi trước máy nhập mã đó trên màn hình đăng nhập để tạo tài khoản quản trị đầu tiên. Không có mật khẩu mặc định, không có "cửa sau" qua biến môi trường — đây là điểm bảo vệ quan trọng khi đưa app ra HTTPS công khai.
- **Đăng nhập bằng Google (tuỳ chọn)**: nút "Đăng nhập bằng Google" dùng Google Identity Services. Trình duyệt lấy ID token, **server tự kiểm tra chữ ký RS256 qua JWKS của Google** (`server/services/google_auth.ts`) rồi mới tạo phiên — không tin tên do client gửi lên, không cần client secret, không lưu token. `aud`, `iss`, `exp`, `email_verified` đều bắt buộc khớp; sai bất kỳ mục nào là từ chối với mã lỗi rõ (`BAD_SIGNATURE`, `BAD_AUDIENCE`, `DOMAIN_BLOCKED`…). Tài khoản Google chưa tồn tại được tạo với vai trò hạn chế (`GOOGLE_SIGNUP_ROLE`, mặc định `viewer`) và **không có mật khẩu**, nên không thể bị đăng nhập bằng ô mật khẩu. Cùng cơ chế khoá tạm khi đăng nhập sai, cùng ràng buộc HTTPS ở production.
- **Thư mục Google Drive cá nhân**: sau lần đăng nhập Google đầu tiên, ứng dụng mở wizard 4 bước xin quyền `drive.file` (chỉ thấy tệp do app tạo), chọn/tạo thư mục "Lịch công tác …", chia sẻ cho đồng nghiệp rồi lưu **mã thư mục** vào tài khoản qua `PUT /auth/me/drive`. Access token chỉ sống trong bộ nhớ trình duyệt ~1 giờ; máy chủ không giữ refresh token.

---

## 🔌 Tiện ích kết nối: webhook

Ứng dụng có thể **đẩy** thông tin lịch đã chọn sang hệ thống khác qua webhook (Google Apps Script, n8n, Zapier self-host, hoặc một endpoint nội bộ bất kỳ). Tính năng **mặc định TẮT** và chỉ quản trị viên bật được (Cài đặt → *Webhook xuất lịch*).

- **Sự kiện**: `week.published`, `week.revoked`, `event.created`, `event.updated`, `event.moved`, `proposal.created`, `conflict.opened`. Chọn từng loại.
- **Chống lộ dữ liệu**: mặc định bản tin **đã che tên cán bộ, địa điểm và nội dung**, chỉ còn ngày – giờ – số lượng – số tuần. Muốn gửi đầy đủ phải tích "Gửi kèm tên cán bộ, địa điểm, nội dung" và hiểu là dữ liệu lịch đang rời khỏi máy.
- **Chữ ký HMAC-SHA256** trên đúng thân bản tin, gửi trong header `X-TG-Signature` (dạng `sha256=<hex>`) **và** ở tham số `?sig=` của URL — Google Apps Script không cho `doPost` đọc header nên cần tham số này. Kèm `X-TG-Event` và `X-TG-Timestamp`. Khoá ký do app sinh, **chỉ hiện một lần** khi tạo/quay vòng.
- **URL bị chặn** nếu không phải `http(s)` hoặc nhúng thông tin đăng nhập (`https://user:pass@host`); URL ghi vào nhật ký gửi được **rút bỏ query string** để token không nằm lại trong kho dữ liệu.
- **Gửi lại**: 3 lần thử (0s / 1s / 3s) khi bên nhận lỗi; 100 lần gửi gần nhất được lưu trong kho, `GET /api/webhook/log` trả 40 lần mới nhất để xem lại trong giao diện, kèm HTTP status và lỗi (nếu có).
- **Nút "Gửi bản tin thử"** trả về HTTP status và thời gian phản hồi để biết bên nhận có thật sự trả 2xx hay không (Apps Script hay trả 200 kèm trang HTML, hãy kiểm tra nội dung phía nhận).

Mẫu phía nhận — Google Apps Script (Web App, đường dẫn `/exec`):

```javascript
const SECRET = PropertiesService.getScriptProperties().getProperty('TG_WEBHOOK_SECRET');

function sha256Hex(message, key) {
  const bytes = Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_256, message, key);
  return 'sha256=' + bytes.map((b) => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

function doPost(e) {
  const payload = e.postBody.contents;               // chuỗi JSON gốc — ký trên đúng chuỗi này, không parse lại
  if (sha256Hex(payload, SECRET) !== e.parameter.sig) {
    return ContentService.createTextOutput('{"ok":false,"error":"chữ ký không khớp"}');
  }
  const data = JSON.parse(payload);
  // data.event, data.week.number, data.counts, (data.items khi bật "gửi kèm chi tiết")
  return ContentService.createTextOutput('{"ok":true}').setMimeType(ContentService.MimeType.JSON);
}
```

---

## 🚀 Chạy nhanh

Cần **Node.js ≥ 20.12** (dùng cờ `--env-file-if-exists`; server TypeScript chạy trực tiếp bằng `tsx`, không cần bước build).

```bash
npm install
cp .env.example .env        # Windows: copy .env.example .env
npm run dev
```

Mở <http://127.0.0.1:3000>. Muốn dùng AI thì điền `GEMINI_API_KEY` vào `.env` rồi khởi động lại; không có khoá vẫn chạy được mọi chức năng còn lại.

**Lần chạy đầu tiên chưa có tài khoản nào.** Terminal sẽ in:

```
LẦN CHẠY ĐẦU — chưa có tài khoản nào.
Mã khởi tạo: 4f2a9c1e
```

Trên màn hình đăng nhập, bấm *"Chưa có tài khoản? Nhập mã khởi tạo để tạo"*, nhập mã 8 ký tự đó cùng tên đăng nhập và mật khẩu quản trị. Mã do `crypto.randomBytes` sinh ra, chỉ hiện một lần và biến mất ngay khi tạo xong tài khoản — không có mật khẩu mặc định để người khác đoán.

```bash
npm run lint     # tsc --noEmit — kiểm tra kiểu toàn bộ server/ + src/
npm test         # 89 unit test engine nghiệp vụ + auth + webhook + nhập .ics, không cần mạng
npm run build    # bản production vào dist/
```

Chạy bản production (phục vụ `dist/` thay vì Vite dev server):

```bash
# Linux / macOS
NODE_ENV=production npm start
# PowerShell
$env:NODE_ENV='production'; npm start
```

**Cài thành ứng dụng (PWA)**: service worker chỉ đăng ký ở bản production, nên muốn cài thì chạy `npm run build` rồi `NODE_ENV=production npm start`, mở `http://127.0.0.1:3000` và bấm nút *Cài đặt* trên thanh công cụ Chrome/Edge (hoặc dấu "+" trong ô địa chỉ). Bản dev không có service worker để HMR không bị cache chắn. Vẽ lại biểu tượng khi đổi màu thương hiệu: `node tools/make_icons.mjs`.

---

## 🔧 Biến môi trường

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `GEMINI_API_KEY` | *(trống)* | Khoá Gemini. Thiếu → tính năng AI trả 503, không bịa dữ liệu. |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Tên model Gemini đang được hỗ trợ. |
| `GEMINI_MAX_ATTEMPTS` | `3` | Số lần thử khi mô hình báo lỗi; lần cuối cố sửa JSON ở nhiệt độ 0. |
| `LLM_PROVIDER` | `auto` | `auto` chọn provider khả dụng đầu tiên; hoặc ép `gemini` / `ollama` / `openai`. |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Địa chỉ Ollama cục bộ (chạy offline, không gửi dữ liệu ra ngoài). |
| `OLLAMA_MODEL` | `qwen2.5:7b` | Model Ollama dùng cho bóc tách/agent. |
| `OPENAI_BASE_URL` | *(trống)* | Base URL của API OpenAI-compatible (Groq, OpenRouter, LM Studio…); phải đặt cùng khoá. |
| `OPENAI_API_KEY` | *(trống)* | Khoá cho provider OpenAI-compatible. |
| `OPENAI_MODEL` | `llama-3.3-70b-versatile` | Tên model của provider OpenAI-compatible. |
| `LLM_MAX_ATTEMPTS` | `3` | Số lần thử chung cho mọi provider (dùng chung với `GEMINI_MAX_ATTEMPTS`). |
| `MAX_UPLOAD_MB` | `20` | Giới hạn tệp nạp (sau khi giải base64); body JSON của route nạp tệp tự nới theo giá trị này. |
| `PDF_OCR_MAX_PAGES` | `10` | Số trang PDF scan tối đa được render + OCR mỗi tệp. |
| `PDF_OCR_DISABLED` | *(trống)* | Đặt `1` để tắt OCR, chỉ đọc lớp chữ của PDF. |
| `PDF_FONT_PATH` | *(tự dò)* | Font `.ttf` cho xuất PDF khi máy không có serif tiếng Việt (ví dụ `/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf`). Đường dẫn hỏng sẽ bỏ qua và tự dò tiếp; đặt cùng `PDF_FONT_BOLD_PATH` để chữ đậm đúng cùng họ. |
| `PDF_FONT_BOLD_PATH` | *(tự dò)* | Font đậm cho PDF. Nếu chỉ đặt `PDF_FONT_PATH`, app tìm bản đậm cùng họ (timesbd/arialbd…), không có thì dùng lại font thường. |
| `RATE_AI_PER_MIN` | `30` | Số lần gọi AI mỗi phút cho mỗi tài khoản (route `/ai/*`, phân tích tệp, gợi ý xung đột). |
| `RATE_UPLOAD_PER_HOUR` | `120` | Số lần nạp tệp mỗi giờ cho mỗi tài khoản. |
| `NOTIFY_SCHEDULER` | *(bật)* | Đặt `0` để tắt scheduler nhắc việc trong tiến trình. |
| `HOST` | `127.0.0.1` | Mặc định chỉ nghe trên máy này. Đặt `0.0.0.0` khi mở cho các máy khác truy cập (khi đó nên có HTTPS — xem mục bên dưới). |
| `PORT` | `3000` | Cổng của cả API và giao diện. |
| `NODE_ENV` | *(dev)* | `production` → phục vụ `dist/`, bỏ Vite middleware, và **từ chối đăng nhập qua HTTP**. |
| `APP_DATA_DIR` | `./data` | Thư mục chứa kho dữ liệu; đặt ra ngoài mã nguồn khi deploy để cập nhật code không đụng lịch thật. |
| `SESSION_TTL_DAYS` | `7` | Số ngày một phiên đăng nhập còn hiệu lực. |
| `PASSWORD_MIN_LENGTH` | `10` | Mật khẩu tối thiểu (vẫn bắt buộc có chữ + số, không trùng/chứa tên đăng nhập). |
| `LOGIN_MAX_FAILURES` | `8` | Số lần đăng nhập sai liên tiếp trước khi tạm khoá (tính theo IP và theo tên đăng nhập). |
| `LOGIN_LOCKOUT_MINUTES` | `15` | Thời gian khoá; tăng gấp đôi mỗi lần vi phạm tiếp. |
| `COOKIE_SECURE` | `auto` | `auto` = chỉ gắn cờ Secure khi request qua HTTPS; `always` / `never` để ép. |
| `TRUST_PROXY` | `0` | `1` khi chạy sau nginx/Caddy: server mới đọc `X-Forwarded-For` / `X-Forwarded-Proto` để lấy IP thật và biết là HTTPS. |
| `GOOGLE_CLIENT_ID` | *(trống)* | OAuth client ID loại *Web application* (chuỗi công khai, không phải client secret) để hiện nút "Đăng nhập bằng Google". Chưa đặt thì màn đăng nhập chỉ còn ô tên đăng nhập/mật khẩu. |
| `GOOGLE_ALLOWED_DOMAINS` | *(trống)* | Danh sách miền Google Workspace được phép đăng nhập, phân cách bởi dấu phẩy. Để trống thì Gmail thường cũng vào được. |
| `GOOGLE_SIGNUP_ROLE` | `viewer` | Vai trò gán cho tài khoản tự tạo ở lần đăng nhập Google đầu tiên (`admin` / `editor` / `viewer`). |
| `WEBHOOK_TIMEOUT_MS` | `6000` | Thời gian chờ tối đa mỗi lần gọi URL webhook (chặn ở 1000–20000). |
| `VITE_FIREBASE_*` | *(trống)* | Cấu hình Firebase cho *Bộ não AI* (nạp qua frontend trực tiếp). Nếu không dùng, để trống và đặt `firebase-applet-config.json` cạnh server. |

`.env` được `npm run dev` / `npm start` tự nạp và đã nằm trong `.gitignore`.

---

## 🏗 Kiến trúc

```
.
├── server.ts                 # Express 5: gắn router /api; dev thì cắm Vite middleware, production thì phục vụ dist/
├── server/
│   ├── routes.ts             # ~70 endpoint; cổng đăng nhập + bảng quyền chạy trước mọi route, mọi thay đổi đều ghi audit log
│   ├── auth.ts               # scrypt + phiên + bảng vai trò/quyền + chống dò mật khẩu (không dùng thư viện ngoài)
│   ├── store.ts              # Kho JSON data/app_store.json + migration an toàn (schema v6)
│   ├── types.ts              # Kiểu dữ liệu + mặc định (EventRecord, UserRecord, WebhookConfig, …)
│   ├── engines/
│   │   ├── extractor.ts      # Đọc ngày/giờ tiếng Việt ("8h30", "13 giờ", "chiều") + chuẩn hoá JSON của AI
│   │   ├── llm.ts            # Chọn provider Gemini/OpenAI-compatible/Ollama, thử lại, parse JSON lỏng
│   │   ├── gemini.ts         # Lớp tương thích ask/askJson cũ, chuyển sang llm.ts
│   │   ├── agent.ts          # Agent JSON-ReAct + 7 công cụ (đọc lịch, slot trống, cán bộ, tạo đề xuất)
│   │   ├── retrieval.ts      # BM25 tiếng Việt + trích đoạn cho ngữ cảnh
│   │   ├── free_slots.ts     # Tìm khung giờ trống theo người/địa điểm/giờ làm
│   │   ├── optimizer.ts      # Phương án dời việc ưu tiên thấp (tham lam)
│   │   ├── conflict.ts       # Xung đột trùng giờ / trùng người / buffer di chuyển
│   │   ├── format_check.ts   # Soi thể thức Nghị định 30/2020/NĐ-CP → điểm /100
│   │   ├── priority.ts       # Điểm ưu tiên = 50% nguồn + 25% bắt buộc + 15% cấp lãnh đạo + 10% gấp
│   │   ├── preparation.ts    # Rút đầu việc "chuẩn bị" từ câu chữ văn bản
│   │   ├── document_text.ts  # DOCX/TXT/CSV/HTML/JSON + PDF (pdfjs) + XLSX + OCR ảnh
│   │   ├── export_docx.ts    # Lịch tuần .docx đúng thể thức
│   │   ├── export_xlsx.ts    # Báo cáo .xlsx 5 sheet
│   │   ├── export_pdf.ts     # PDF A4 với font Unicode
│   │   ├── ics.ts            # Lịch .ics theo RFC 5545
│   │   └── official_document.ts  # Bản in A4 đúng cụm đầu văn bản
│   ├── services/
│   │   ├── merge.ts          # Bỏ dấu tiếng Việt + so mức gần trùng → gộp đa nguồn
│   │   ├── report_data.ts    # Số liệu báo cáo tuần/tháng dùng chung cho API và file
│   │   ├── notify.ts         # Telegram/SMTP/webhook + bản tin ngày + scheduler
│   │   ├── webhook.ts        # Ký HMAC-SHA256, redact mặc định, retry 3 lần, nhật ký gửi
│   │   └── week_draft.ts     # Soạn lịch cả tuần (danh sách cán bộ + bài học few-shot)
│   ├── utils/                # dates.ts (ISO week) + organization.ts (dòng tổ chức cấp trên, loại văn bản Đảng/chính quyền) + vn_holidays.ts (ngày lễ)
│   └── tests/                # 89 unit test (npm test)
├── src/                      # React 19 + Vite 6 (JSX), gọi thẳng /api của server này
│   ├── App.jsx               # Cổng đăng nhập, điều phối tuần, kéo-thả, ban hành, pop-up sự kiện
│   ├── components/           # Lưới lịch V2, Văn bản hành chính, Conflicts, Agency, Brain, Settings, LoginView, UsersView, SecurityView…
│   └── services/api.js       # Client duy nhất cho toàn bộ endpoint (credentials: same-origin, tự báo 401)
├── data/                     # Dữ liệu thật (KHÔNG commit — xem .gitignore)
├── metadata.json             # Tên/mô tả/capabilities cho Google AI Studio
└── docs/ARCHITECTURE_DESIGN.md
```

**Luồng dữ liệu**: văn bản → `sources.raw_text` → AI bóc tách → `events` (`PROPOSED`) → cán bộ duyệt/sửa → `APPROVED` → ban hành → `PUBLISHED` + một dòng `publications`. Mọi bước ghi `audit_log` (giữ 500 dòng gần nhất).

---

## 📡 API

Toàn bộ endpoint đặt dưới `/api` và **cần đăng nhập**, trừ `/api/health` cùng `/api/auth/status|login|setup`.

| Nhóm | Endpoint | Mô tả |
|---|---|---|
| Đăng nhập | `GET /auth/status`, `POST /auth/login`, `POST /auth/google`, `POST /auth/setup`, `POST /auth/logout`, `GET /auth/me`, `PUT /auth/me/drive`, `POST /auth/password`, `GET/DELETE /auth/sessions/:id` | Trạng thái phiên (+ cấu hình Google), đăng nhập mật khẩu, đăng nhập Google có xác minh chữ ký ID token, tạo tài khoản đầu tiên bằng mã khởi tạo, gắn thư mục Google Drive của chính mình, đổi mật khẩu, liệt kê/thu hồi thiết bị đang đăng nhập |
| Quản trị | `GET/POST/PATCH/DELETE /users`, `GET /audit` | CRUD tài khoản theo quyền `users:manage`; nhật ký thao tác (kèm người + IP) |
| Webhook | `GET/PUT /webhook/config`, `POST /webhook/secret`, `POST /webhook/test`, `GET /webhook/log` | Bật/tắt, chọn sự kiện, tạo/quay vòng khoá HMAC, gửi bản tin thử, xem 40 lần gửi gần nhất |
| Firebase | `GET /config/firebase` | Phát cấu hình Firebase cho frontend; thiếu tệp thì trả 404 kèm hướng dẫn sao chép từ `.example` |
| Hiện trạng | `GET /health`, `GET /state?week=` | Đếm sự kiện/văn bản/xung đột; trả nguyên tuần đang xem + lịch tuần |
| Văn bản nguồn | `POST /sources/upload`, `POST /sources/paste`, `POST /sources/:id/extract`, `POST /sources/ingest-dir`, `DELETE /sources/:id` | Nạp tệp / dán nội dung / bóc tách / nhập `data/drive_incoming` |
| Sự kiện | `POST /events`, `PATCH /events/:id`, `POST /events/:id/move`, `POST /events/:id/status`, `DELETE /events/:id`, `POST /events/:id/ai-fill` | CRUD + kéo-thả đổi giờ + duyệt/từ chối + AI điền nốt ô trống. `DELETE` là **xoá mềm** — sự kiện vào thùng rác |
| Việc chuẩn bị | `POST /events/:id/tasks`, `PATCH /events/:id/tasks/:taskId`, `DELETE /events/:id/tasks/:taskId` | Giao việc kèm người làm + hạn nộp, đánh dấu xong (tối đa 20 việc/mục) |
| Lặp & thùng rác | `POST /events/:id/repeat`, `GET /trash`, `POST /trash/:id/restore`, `DELETE /trash/:id`, `DELETE /trash` | Nhân bản sang 1–26 tuần kế tiếp; xem/thu hồi/xoá hẳn bản đã bỏ (giữ 100 bản) |
| Nhập lịch ngoài | `POST /import/ics` | Đưa tệp `.ics` của Google/Outlook thành mục lịch `PROPOSED` (bung `RRULE`, đổi UTC → giờ VN, chống trùng theo `UID`) |
| Xung đột | `GET /conflicts`, `POST /conflicts/reanalyze`, `POST /conflicts/auto-plan`, `POST /conflicts/:id/resolve`, `POST /conflicts/:id/ai-suggest`, `GET /calendar/free-slots` | Liệt kê, tính lại, lập phương án dời việc, đánh dấu đã xử lý, nhờ AI gợi ý, tìm khung trống |
| AI | `GET /ai/status`, `POST /ai/agent`, `POST /ai/week-draft`, `POST /ai/parse-text`, `POST /ai/chat` | Tình trạng provider, agent có công cụ, soạn cả tuần, bóc tách nhanh, hỏi đáp về lịch |
| Nhắc việc | `GET/PUT /notify/config`, `POST /notify/test`, `POST /notify/digest`, `GET /notify/log` | Cấu hình Telegram/SMTP, gửi thử, gửi bản tin ngày, xem nhật ký; secret được che |
| Ban hành | `POST /publish`, `GET /publications`, `POST /publications/:id/revoke`, `POST/DELETE /publications/:id/share` | Ban hành tuần, xem nhật ký, thu hồi, bật/tắt link tra cứu công khai |
| Công khai (không cần đăng nhập) | `GET /public/week/<token>`, `GET /public/week/<token>/print` | JSON đã cắt thông tin nhạy cảm và bản in A4 của đúng tuần đã ban hành; có ghi nhật ký lượt xem |
| Thể thức & lịch nghỉ | `GET /util/format-check?week=`, `GET /calendar/holidays` | Điểm thể thức NĐ 30 + gợi ý sửa; ngày lễ (kèm cảnh báo ngày âm lịch) |
| Lịch Ban Xây dựng Đảng | `GET/POST /agency`, `PATCH/DELETE /agency/:id`, `POST /agency/ai-draft`, `POST /agency/trace-check`, `POST /agency/qc-review`, `POST /agency/analyze-file` | Luồng 5 cột chuẩn thể thức + đối chiếu căn cứ để không mục nào lạc nguồn. Tên đơn vị ở màn này lấy từ `settings.advisor_unit` (Cài đặt › *Đơn vị lập lịch nội bộ*), mặc định "Ban Xây dựng Đảng"; cụm đầu văn bản do `GET /agency` trả `advisor_head` nên màn hình và tệp .doc luôn khớp nhau |
| Nhận diện thành phần Ban | `GET/PATCH /signals/config`, `POST /signals/detect`, `POST /signals/learn`, `POST/PATCH/DELETE /personnel` | Quét 17 nhóm dấu hiệu trên lịch tuần, trả đề xuất kèm căn cứ + 8 lớp cảnh báo chống bỏ sót; học quy tắc phân công từ lịch đã duyệt; danh bạ cán bộ để nhận đúng tên người |
| Xuất & báo cáo | `GET /export/document`, `GET /export/docx`, `GET /export/xlsx`, `GET /export/pdf`, `GET /export/ics`, `GET /export/week.json`, `GET /reports/week`, `GET /reports/month?month=YYYY-MM` | Bản in A4, Word, Excel, PDF, .ics, JSON, số liệu tuần/tháng |
| Khác | `GET/PUT /settings`, `GET/PUT /drive/config`, `GET /analytics/workload`, `GET /analytics/deadlines`, `GET/POST/DELETE /brain`, `POST /backup`, `GET /backup/download`, `POST /backup/restore` | Cấu hình đơn vị, Google Drive, thống kê tải công việc, sổ tay hạn nộp (phân biệt *việc giao* và *suy từ văn bản*), trí nhớ chỉ đạo, sao lưu, tải và phục hồi bản sao lưu |

Quy ước lỗi: thân JSON không hợp lệ → `400 Body không phải JSON hợp lệ`; chưa đăng nhập → `401 AUTH_REQUIRED` (frontend tự quay về màn hình đăng nhập); sai vai trò → `403 FORBIDDEN` kèm tên quyền thiếu; route ghi chưa khai báo trong bảng quyền → `403 PERMISSION_UNDECLARED` (chỉ admin dùng được); request ghi từ Origin khác máy chủ → `403 CSRF_BLOCKED`; tệp trùng nội dung → `409 DUPLICATE_SOURCE`; tệp quá lớn → `413`; sai tham số/không đọc được tệp → `422`; vượt giới hạn AI/nạp tệp → `429 RATE_LIMITED` kèm `Retry-After`; AI chưa cấu hình hoặc gọi không thành công → `503` kèm mô tả, **không trả dữ liệu mẫu**.

---

## 🔒 Dữ liệu & bảo mật

- **Toàn bộ dữ liệu nằm trong `data/app_store.json`** (file phẳng, ghi kiểu tmp → rename để không hỏng giữa chừng).
- **`data/app_store.json`, `data/schedule_export.json`, `data/backups/`, `data/drive_incoming/`, `*.db` đều nằm trong `.gitignore`.** Repo công khai chỉ có `data/.gitkeep`.
- **Nâng cấp schema không xoá lịch thật**: khi `SCHEMA_VERSION` tăng, bản cũ được sao thành `data/app_store.json.v<n>.bak` rồi **migration từng bản ghi** (`migrateState`), không dựng lại từ đầu. v4 → v5 thêm `users/sessions/auth/webhook_*` trống và chuẩn hoá `audit_log.actor`; v6 → v7 thêm `tasks`/`series_id` cho từng mục lịch, `share_token` cho nhật ký ban hành cùng hai danh mục mới `trash` và `share_access` — dữ liệu lịch giữ nguyên. Kho v4 thật của phường đã chạy qua migration này trên **bản sao** để kiểm chứng: vẫn đủ 18 sự kiện, 12 văn bản nguồn, 1 lượt ban hành. File hỏng → sao `.malformed.bak` và khởi tạo sạch để server không chết.
- **Phục hồi dữ liệu có phanh an toàn**: `POST /api/backup/restore` chỉ admin, phải gõ đúng `PHUC HOI`, từ chối JSON không đủ cấu trúc và bản sao lưu có schema mới hơn app, **viết trước** `data/backups/pre_restore_<timestamp>.json`, rồi thu hồi phiên đang mở để người đăng nhập lại đọc đúng dữ liệu mới.
- **Link công khai là cửa có khoá**: token 24 byte chỉ bật được cho một lần ban hành cụ thể, tắt là hết hiệu lực ngay; nội dung trả về đã cắt số điện thoại, tên văn bản nguồn, độ tin cậy AI và việc chuẩn bị nội bộ; mỗi lượt xem ghi một dòng `share_access` (giữ 300 dòng).
- **Service worker chỉ cache vỏ giao diện và tài nguyên tĩnh**, không đụng `/api`, nên lịch thật không nhân bản ra đĩa máy tính công cộng.
- **Có đăng nhập + phân quyền, mặc định vẫn chỉ nghe `127.0.0.1`.** Đặt `HOST=0.0.0.0` là mở cho các máy khác truy cập — khi đó hãy chạy sau một lớp HTTPS (xem mục *Công khai qua HTTPS*) và tạo tài khoản bằng mã khởi tạo trước khi mở mạng.
- **`firebase-applet-config.json` không còn nằm trong repo**: server đọc tệp này từ đĩa và phát cho frontend qua `GET /api/config/firebase`, hoặc frontend lấy từ `VITE_FIREBASE_*`. Repo chỉ giữ `firebase-applet-config.example.json`. Khoá Firebase web vốn được phát cho browser nên không phải bí mật tuyệt đối, nhưng **vẫn phải chặn bằng Firebase Security Rules**; nếu dùng lại dự án này cho dữ liệu thật, hãy kiểm tra rules và OAuth client.
- **Webhook là opt-in và mặc định che nội dung**: chỉ khi quản trị viên bật và chọn sự kiện thì lịch mới rời máy; muốn gửi kèm tên cán bộ/địa điểm/nội dung phải tích chọn riêng.
- Không commit `.env`, `*.key`, `*.pem`.
- `APP_DATA_DIR` cho phép đặt kho dữ liệu ngoài thư mục mã nguồn (kèm `data/backups/`), hữu ích khi cập nhật code không muốn đụng lịch thật.

---

## 🌐 Công khai qua HTTPS

App được thiết kế để chạy một máy, nhưng nếu cần cán bộ trong phường truy cập từ máy khác qua tên miền riêng:

1. `npm run build` rồi chạy `NODE_ENV=production npm start` (phục vụ `dist/`, không cần Vite).
2. Đặt reverse proxy có TLS (Caddy đơn giản nhất — tự xin và tự gia hạn chứng chỉ Let's Encrypt):

   ```caddy
   lich.phanphoai.example {
     reverse_proxy 127.0.0.1:3000
   }
   ```

3. Chạy app với `HOST=127.0.0.1` (không nghe công khai trực tiếp), `TRUST_PROXY=1` để nhận `X-Forwarded-Proto`/`X-Forwarded-For`.
4. **Không có màn hình đăng nhập qua HTTP ở chế độ production**: `POST /api/auth/login` trả `400 HTTPS_REQUIRED` để không bao giờ phát cookie phiên trên đường truyền không mã hoá.
5. `SameSite=None; Secure` chỉ được bật khi request thực sự là HTTPS, nên cookie vẫn gửi được khi người dùng mở qua tên miền, nhưng không gửi sang site khác.
6. Firewall chỉ mở cổng 443; tạo tài khoản cho từng cán bộ với vai trò phù hợp (Biên tập cho người soạn lịch, Chỉ xem cho người đọc), thay vì dùng chung một tài khoản.
7. **Sao lưu định kỳ**: `POST /api/backup` (hoặc bấm *Sao lưu toàn bộ ngay* trong Cài đặt), rồi copy `data/backups/` ra phương tiện khác — kho dữ liệu không tự nhân bản ra ngoài máy.

---

## ✅ Kiểm thử

```bash
npm test
```

89 unit test chạy bằng `node:test` + `tsx`, **không cần mạng, không cần key, không chạm dữ liệu thật**:

| File | Phạm vi |
|---|---|
| `server/tests/engines.test.ts` | Đọc giờ/ngày tiếng Việt, buffer di chuyển, phát hiện xung đột, tìm khung trống, phương án dời việc, báo cáo tuần/tháng, bỏ dấu + mức gần trùng, gộp đa nguồn, ngày lễ, ISO week, chấm điểm thể thức |
| `server/tests/data.test.ts` | Migration schema, `parseLooseJson` cứu JSON lỗi, `coerceAiEvent` chặn AI bịa, xuất ICS (escape + gãy dòng RFC 5545), bản in A4 (escape HTML, không cho `<script>` lọt vào; dòng tổ chức cấp trên, đổi quốc hiệu ↔ "ĐẢNG CỘNG SẢN VIỆT NAM" theo loại đơn vị), đọc .docx thật |
| `server/tests/auth.test.ts` | Định dạng băm scrypt + muối riêng từng tài khoản, từ chối hash hỏng, luật mật khẩu/tên đăng nhập, ma trận đăng nhập (sai mật khẩu / bị vô hiệu / bị khoá), bảng quyền theo vai trò, `publicUser` không lộ hash, hết hạn phiên, cookie Strict vs None+Secure, `clientIp` chỉ tin `X-Forwarded-For` khi `TRUST_PROXY=1`, khoá sau 8 lần sai và tăng gấp đôi, khớp mã khởi tạo |
| `server/tests/google_auth.test.ts` | Tự sinh khoá RSA rồi ký JWT giả: chấp nhận token hợp lệ, chặn token ký bằng khoá khác hoặc `alg: none`, sai `aud`/`iss`, hết hạn và chưa tới hạn (kèm dung sai 60 giây), email chưa xác minh, thiếu `sub`, chặn theo miền Workspace, máy không lấy được JWKS, email chuẩn hoá về chữ thường, đọc cấu hình từ biến môi trường |
| `server/tests/webhook.test.ts` | HMAC khớp giá trị tính độc lập và không lộ secret, phát hiện body bị sửa, chặn scheme lạ (`file://`, `javascript:`) và URL nhúng tài khoản, nhật ký ẩn token trong query, bản tin mặc định redact không còn tên cán bộ/địa điểm/nội dung, migration v4 → v5, lọc tên sự kiện lạ, `?sig=` cho Apps Script |
| `server/tests/v7_features.test.ts` | Phân tích `.ics`: giờ UTC → giờ Việt Nam, `DURATION`, sự kiện cả ngày, `RRULE` `COUNT`/`BYDAY` (kể cả ngày trong chính tuần đầu), trần 60 lần lặp, bỏ bản `CANCELLED`, dòng gãy + ký tự thoát, vòng tròn xuất→nhập `buildIcs` → `parseIcsCalendar`; `normalizeTask`/`normalizeTasks`, `coerceAiEvent` mặc định `tasks`/`series_id`, migration v6 → v7, cắt `share_token` khi trả công khai và trần thùng rác |
| `server/tests/party_signals.test.ts` | Bộ nhận diện thành phần Ban Xây dựng Đảng: từng nhóm trong 17 nhóm dấu hiệu (Ban Thường vụ, lãnh đạo Ban, chỉ đạo 35, kiểm tra giám sát, tuyên giáo dân vận, hội nghị cấp ủy, tổ chức đảng viên, ủy nhiệm–thay mặt…), văn bản không dấu/viết tắt, tắt nhóm + từ khóa tùy biến, phạm vi triệu tập (cơ quan Ban / khối Đảng / toàn phường / đảng viên), danh bạ có lời gọi "Đ/c" vẫn khớp đúng một người, chức danh kiêm nhiệm suy ra người dự, trùng giờ trong tuần, 8 lớp kiểm tra chống bỏ sót, học quy tắc từ lịch đã duyệt (có trần mỗi nhóm) và đề xuất luôn ở trạng thái chờ người xác nhận |

Bộ test này đã tìm ra bốn lỗi thật: **địa danh nơi ban hành không bao giờ được nhận** (đọc sai chỉ số nhóm capture), **`Đ` viết hoa không bị bỏ dấu** khi so trùng nội dung, **đi/về ngoài khu vực bị tính thiếu thời gian di chuyển**, và **nhận dạng sai văn bản của Đảng** — mẫu `đảng u[ỷy]` chỉ khớp "uỷ" nên "Đảng ủy" (chữ `ủ` đứng trước `y`) vẫn bị coi là khối chính quyền; nay bỏ dấu rồi so khớp nên cả hai cách viết đều đúng.

---

## ☁️ Đồng bộ ngược về Google AI Studio

Repo được giữ đúng khuôn dự án Node của AI Studio nên nhập ngược trở lại được:

1. **Đẩy code lên GitHub** (repo `kuzinhy/applamlich`, nhánh `master`). Không cần xoá gì thêm: dữ liệu thật đã nằm ngoài `.gitignore`.
2. Trong AI Studio: **Build → Import from GitHub** (hoặc mở dự án cũ → *Connect GitHub repository*), dán `https://github.com/kuzinhy/applamlich`.
3. Studio đọc:
   - `metadata.json` — tên, mô tả, `capabilities: ["MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API"]`.
   - `package.json` — `npm install`, `npm run dev` (cổng 3000), `npm run build` cho bản production.
   - `engines.node: ">=20.12"` — chọn runtime Node tương ứng.
4. **Cấu hình secret**: đặt `GEMINI_API_KEY` (và `VITE_FIREBASE_*` nếu dùng *Bộ não AI*) trong phần Secrets/Environment của Studio. Code chỉ đọc `process.env`; không có khoá nào nằm trong repo.
5. Repo đang **public**, nên mọi commit đều lộ — hãy review và chắc chắn không có tệp dữ liệu thật (`data/`, `*.db`, `uploads/`, `.env`, `firebase-applet-config.json`) trước khi push.
6. **Trên Studio chưa có lịch thật**: kho `data/app_store.json` không lên git, nên lần chạy đầu ở Studio sẽ in mã khởi tạo và tạo tài khoản quản trị mới; muốn có dữ liệu thì import bản `POST /api/backup` hoặc thả văn bản vào `data/drive_incoming/`.
7. Chiều ngược lại (Studio → máy này): `git pull` rồi `npm install && npm test` trước khi chạy, để chắc chắn engine nghiệp vụ không bị bản mẫu trên Studio ghi đè. **Không xoá `data/app_store.json` local** — đó là lịch thật của phường.

---

## ⚠️ Giới hạn đã biết

- **Ngày nghỉ âm lịch** (Tết Nguyên đán, Giỗ tổ 10/3, số ngày nghỉ liền kề Quốc khánh) không tự đoán — phải nạp văn bản chỉ đạo nghỉ lễ của cấp trên. API trả kèm `notice` nói rõ điều này.
- **Phân quyền trong một đơn vị, không phải multi-tenant**: một kho dữ liệu chung, các tài khoản chỉ khác nhau về *được làm gì*, không có chỗ chứa lịch của hai phường riêng biệt.
- **Không có "quên mật khẩu"**: quản trị viên đặt lại mật khẩu giúp, hoặc phải có người quản trị còn truy cập được.
- **Nhập `.ics` chỉ bung được `RRULE` kiểu `WEEKLY`/`DAILY`** (tối đa 60 lần lặp cho một sự kiện); `MONTHLY`/`YEARLY` và chuỗi `EXDATE` không mở rộng — các mốc đó phải nhập tay. Sự kiện `CANCELLED` bị bỏ qua có báo cáo số lượng.
- **Lặp hằng tuần là nhân bản, không phải chuỗi liên kết**: sửa một bản đã sinh ra không tự lan sang các bản khác (chủ ý, vì lịch công tác hay phải điều chỉnh riêng từng tuần).
- **Bản offline chỉ có vỏ giao diện**: service worker không cache dữ liệu lịch, nên mất mạng thì mở được app nhưng số liệu trên màn hình là bản tải trước đó (có dải cảnh báo vàng báo rõ).
- **Link công khai chỉ có giá trị trong mạng nội bộ/HTTPS**: token nằm trong URL, ai có link đều xem được tuần đó; vì vậy chỉ bật cho tuần đã ký ban hành và tắt khi không cần nữa.
- Audit log, trí nhớ AI, nhật ký ban hành, nhật ký webhook, thùng rác và nhật ký lượt xem có trần (500 / 300 / 120 / 100 / 100 / 300 dòng); bản đầy đủ hãy dùng `POST /api/backup`.

---

## Giấy phép

Chưa kèm tệp LICENSE. Repo công khai để lưu trữ và hợp tác nội bộ; muốn sử dụng ngoài phạm vi đó hãy liên hệ chủ repo.
