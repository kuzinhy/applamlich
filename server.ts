import express from 'express';
import { createServer as createViteServer } from 'vite';
import { router } from './server/routes.ts';
import { getState, bootstrapAuth } from './server/store.ts';
import { hasApiKey, aiModel, probeProviders } from './server/engines/llm.ts';
import { startNotificationScheduler } from './server/services/notify.ts';

const app = express();
const PORT = Number(process.env.PORT) || 3000;
// Mặc định chỉ nghe trên máy này. Đặt HOST=0.0.0.0 nếu cố ý cho mạng nội bộ dùng chung.
const HOST = process.env.HOST || '127.0.0.1';
const MAX_UPLOAD_MB = Math.max(1, Number(process.env.MAX_UPLOAD_MB) || 20);

app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : false);
// Tệp gửi dạng base64 nên thân yêu cầu phình ~4/3; các đường nạp tệp cần hạn mức riêng.
const bigJson = express.json({ limit: `${MAX_UPLOAD_MB + 5}mb` });
app.use(['/api/sources/upload', '/api/sources/ingest-dir', '/api/agency/analyze-file'], bigJson);
app.use(express.json({ limit: '10mb' }));
app.use('/api', router);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Body không phải JSON hợp lệ' });
    return;
  }
  console.error('Unhandled API error:', err);
  res.status(500).json({ error: 'Lỗi server', message: err?.message || 'Không xác định' });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        // Chạy nhiều bản thử nghiệm trên cùng máy: đặt HMR_PORT riêng cho từng cổng.
        hmr: { host: HOST, port: Number(process.env.HMR_PORT) || 24678 },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
  }

  app.listen(PORT, HOST, () => {
    const s = getState();
    console.log(`Lịch công tác phường đang chạy: http://${HOST}:${PORT}`);
    console.log(`  Dữ liệu: ${s.events.length} sự kiện, ${s.sources.length} văn bản nguồn, ${s.conflicts.filter((c) => c.status === 'OPEN').length} xung đột mở`);
    console.log(`  AI: ${hasApiKey() ? `đã sẵn sàng (${aiModel()})` : 'CHƯA có khoá — tính năng AI sẽ báo 503 thay vì trả mẫu có sẵn'}`);
    console.log(`  Đăng nhập: ${s.users.length} tài khoản (${s.sessions.length} phiên đang mở)`);
    console.log(`  Nhắc việc: ${s.notifications.enabled ? 'đang bật' : 'đang tắt'} · bản tin ${s.notifications.daily_digest_time} · nhắc trước ${s.notifications.reminder_before_hours.join('/')}h`);

    startNotificationScheduler();
    void probeProviders().then((providers) => {
      const ready = providers.filter((p) => p.available).map((p) => `${p.provider}${p.model ? ` (${p.model})` : ''}`);
      console.log(`  Nhà cung cấp AI khả dụng: ${ready.length ? ready.join(', ') : 'chưa có — chạy Ollama cục bộ hoặc đặt GEMINI_API_KEY/OPENAI_API_KEY trong .env'}`);
    }).catch(() => {});

    const setupCode = bootstrapAuth();
    if (setupCode) {
      console.log('');
      console.log('  LẦN CHẠY ĐẦU — chưa có tài khoản nào.');
      console.log(`  Mã khởi tạo: ${setupCode}`);
      console.log('  Mở ứng dụng, nhập mã này cùng tên đăng nhập + mật khẩu để tạo tài khoản quản trị đầu tiên.');
      console.log('  Mã chỉ dùng một lần và biến mất sau khi tạo xong tài khoản.');
    }

    const loopback = HOST === '127.0.0.1' || HOST === 'localhost';
    if (!loopback && process.env.NODE_ENV === 'production' && process.env.TRUST_PROXY !== '1') {
      console.warn('  CẢNH BÁO: mở ra mạng mà chưa bật TRUST_PROXY/HTTPS — cookie an toàn sẽ không được đặt, đăng nhập sẽ bị chặn.');
    }
  });
}

startServer();
