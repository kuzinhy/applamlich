# Đăng nhập bằng Gmail / Google Workspace

1. Tạo OAuth Client ID loại Web application trong Google Cloud Console: https://console.cloud.google.com/apis/credentials
2. Trong Authorized JavaScript origins, khai báo đúng origin chạy ứng dụng (gồm giao thức, tên miền và cổng). Localhost dùng HTTP; khi triển khai dùng HTTPS.
3. Tạo `.env` từ `.env.example`, cấu hình:

```env
GOOGLE_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com
GOOGLE_ADMIN_EMAILS=your-name@gmail.com
GOOGLE_SIGNUP_ROLE=viewer
```

Cấu hình Gmail quản trị trước lần đăng nhập đầu tiên. Tài khoản khác mặc định chỉ xem; quản trị viên cấp quyền biên tập trong phần Tài khoản. Không đặt GOOGLE_SIGNUP_ROLE=admin cho ứng dụng công khai. GOOGLE_ALLOWED_DOMAINS để trống nếu nhận Gmail cá nhân; chỉ điền khi muốn giới hạn Google Workspace.

4. Chạy `npm ci`, sau đó `npm run dev`. Khởi động lại server sau mỗi lần thay `.env`.
5. Đăng nhập Google, kiểm tra tài khoản quản trị, tạo lịch thử, đăng xuất và đăng nhập lại để kiểm tra phiên.

Khi đã có GOOGLE_CLIENT_ID, API đăng nhập mật khẩu và khởi tạo tài khoản cục bộ bị tắt. Ứng dụng không còn tự tạo hoặc đặt lại mật khẩu admin cố định. Tài khoản và lịch hiện có được giữ nguyên. Tài khoản Google hiện có giữ quyền đã cấp trong ứng dụng; GOOGLE_ADMIN_EMAILS áp dụng khi tạo tài khoản mới.

Nếu chưa cấu hình Google và kho chưa có người dùng, server sinh mã khởi tạo quản trị để sử dụng cục bộ. Không cần client secret cho luồng Google Identity Services này. Chưa thể kiểm thử đăng nhập Google thực tế nếu chưa có Client ID và origin hợp lệ.

## Vercel: applamlich.vercel.app

Đã cấu hình biến môi trường Production cho Client ID đã cung cấp, Gmail quản trị nguyenhuy.thudaumot@gmail.com và quyền mặc định viewer.

Trong Google Cloud Console, mở OAuth client tương ứng và thêm Authorized JavaScript origin chính xác: `https://applamlich.vercel.app` (không có đường dẫn). Đây là bước riêng với Authorized domains trong Firebase; ứng dụng hiện dùng Google Identity Services trực tiếp, không dùng Firebase ID token.

Vercel chạy `npm run vercel-build`: tạo frontend và bundle server ESM trong server-build/app.mjs để tránh import file TypeScript không có trong function. API giữ nguyên entry api/index.ts.

Lưu ý kiến trúc: store JSON trên Vercel hiện nằm trong /tmp, không phải kho bền vững hay dùng chung giữa các instance. Cần chuyển sang cơ sở dữ liệu dùng chung trước khi sử dụng lâu dài cho lịch chính thức; phiên và thay đổi lịch có thể mất khi instance được tạo lại.
