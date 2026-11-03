import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('lucide-react')) return 'vendor-icons';
          if (id.includes('react-router') || id.includes('react-dom') || id.includes('/react/')) return 'vendor-react';
          if (id.includes('@tanstack/react-query')) return 'vendor-query';
          if (id.includes('framer-motion')) return 'vendor-motion';
          return undefined;
        },
      },
    },
  },
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
