import express from 'express';
import { join } from 'node:path';
import { createServer as createViteServer } from 'vite';
import app from './server/app.ts';
import { getState, bootstrapAuth, cloudStatus, flushCloudPush, sheetStatus, sheetSyncEnabled, startSheetPullPolling, flushSheetPush } from './server/store.ts';
import { cloudEnabled } from './server/services/cloud_store.ts';
import { hasApiKey, aiModel, probeProviders } from './server/engines/llm.ts';
import { startNotificationScheduler } from './server/services/notify.ts';

const PORT = Number(process.env.PORT) || 3000;
// Mặc định chỉ nghe trên máy này. Đặt HOST=0.0.0.0 nếu cố ý cho mạng nội bộ dùng chung.
const HOST = process.env.HOST || '127.0.0.1';

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        // Chạy nhiều bản thử nghiệm trên cùng máy: đặt HMR_PORT riêng cho từng cổng.
        hmr: { host: HOST, port: Number(process.env.HMR_PORT) || 24678 },
        // Kho JSON nằm trong thư mục dự án nên mỗi lần ghi lịch là Vite thấy "file đổi"
        // và nạp lại trình duyệt. Màn TV gọi API liên tục → vòng lặp nạp trang bất tận.
        // Bỏ theo dõi các đường dữ liệu để HMR chỉ phản ứng với mã nguồn.
        watch: { ignored: ['**/data/**', '**/backups/**', '**/.scratch/**', '**/node_modules/**'] },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    // Deep link (/conflicts, /settings…) phải trả vỏ SPA khi tự chạy máy chủ ở địa phương,
    // nếu không người dùng mở đường dẫn cũ sẽ gặp 404 thay vì màn hình làm việc.
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      if (!String(req.headers.accept || '').includes('text/html')) return next();
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(join(process.cwd(), 'dist', 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    const s = getState();
    console.log(`Lịch công tác phường đang chạy: http://${HOST}:${PORT}`);
    console.log(`  Dữ liệu: ${(s.events || []).length} sự kiện, ${(s.sources || []).length} văn bản nguồn, ${(s.conflicts || []).filter((c) => c.status === 'OPEN').length} xung đột mở`);
    console.log(`  AI: ${hasApiKey() ? `đã sẵn sàng (${aiModel()})` : 'đang dùng bộ bóc tách thông minh nội hàm'}`);
    console.log(`  Đăng nhập: ${(s.users || []).length} tài khoản (${(s.sessions || []).length} phiên đang mở)`);
    const c = cloudStatus();
    console.log(c.enabled
      ? `  Đồng bộ: cloud Firestore · doc ${c.doc_key} · revision ${c.base_revision}${c.watching ? ' · đang theo dõi máy khác ghi' : ''}`
      : '  Đồng bộ: file địa phương (chưa đặt FIREBASE_PROJECT_ID + service account)');
    console.log(`  Nhắc việc: ${s.notifications?.enabled ? 'đang bật' : 'đang tắt'} · bản tin ${s.notifications?.daily_digest_time} · nhắc trước ${(s.notifications?.reminder_before_hours || []).join('/')}h`);

    const sheet = sheetStatus();
    console.log(sheet.enabled
      ? `  Google Sheet: ${sheet.spreadsheet_id.slice(0, 12)}… · gid ${sheet.sheet_gid} · ${sheet.syncable_events} mục đủ điều kiện · ${sheet.credential_available ? `khoá ${sheet.service_account_email}` : 'CHƯA có service account'}`
      : `  Google Sheet: ${sheet.hint}`);
    if (sheetSyncEnabled()) startSheetPullPolling();

    startNotificationScheduler();
    void probeProviders().then((providers) => {
      const ready = providers.filter((p) => p.available).map((p) => `${p.provider}${p.model ? ` (${p.model})` : ''}`);
      console.log(`  Nhà cung cấp AI khả dụng: ${ready.length ? ready.join(', ') : 'bộ bóc tách thông minh nội hàm'}`);
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

/** Trước khi tắt tiến trình, ghi nốt phần còn chờ lên cloud/sheet để không mất sửa đổi cuối cùng. */
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    const pending: Promise<unknown>[] = [];
    if (cloudEnabled()) pending.push(flushCloudPush());
    if (sheetSyncEnabled()) pending.push(flushSheetPush());
    if (!pending.length) process.exit(0);
    const killTimer = setTimeout(() => process.exit(0), 5000);
    void Promise.allSettled(pending).finally(() => {
      clearTimeout(killTimer);
      process.exit(0);
    });
  });
}
