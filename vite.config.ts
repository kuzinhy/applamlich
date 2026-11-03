import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 3000,
    watch: {
      // Kho dữ liệu do server ghi mỗi lần thêm/sửa lịch. Nếu để Vite theo dõi,
      // mỗi thao tác lưu sẽ nạp lại cả trang và làm mất modal đang hiển thị.
      ignored: ['**/data/**', '**/node_modules/**', '**/dist/**', '**/.git/**'],
    },
  },
});
