import express from 'express';
import { router } from './routes.ts';
import { getState, bootstrapAuth, bootstrapCloud } from './store.ts';
import { cloudEnabled } from './services/cloud_store.ts';

try {
  getState();
  bootstrapAuth();
} catch (e) {
  console.warn('Init state error:', e);
}

const app = express();
const MAX_UPLOAD_MB = Math.max(1, Number(process.env.MAX_UPLOAD_MB) || 20);

process.env.TRUST_PROXY = process.env.TRUST_PROXY || '1';
app.set('trust proxy', 1);

// Tệp gửi dạng base64 nên thân yêu cầu phình ~4/3; các đường nạp tệp cần hạn mức riêng.
const bigJson = express.json({ limit: `${MAX_UPLOAD_MB + 5}mb` });
app.use(['/api/sources/upload', '/api/sources/ingest-dir', '/api/agency/analyze-file'], bigJson);
app.use(express.json({ limit: '10mb' }));

/**
 * Mỗi tiến trình (kể cả instance serverless mới tinh) phải kéo kho từ cloud về
 * trước khi trả dữ liệu, nếu không trình duyệt sẽ thấy nội dung cũ của /tmp.
 * Chờ tối đa CLOUD_BOOTSTRAP_TIMEOUT_MS rồi nhường đường — mất mạng vẫn dùng được cache máy.
 */
let cloudReady: Promise<unknown> | null = null;
app.use(async (_req, _res, next) => {
  if (!cloudEnabled()) return next();
  try {
    const waitMs = Math.max(0, Number(process.env.CLOUD_BOOTSTRAP_TIMEOUT_MS ?? 2500));
    cloudReady ??= Promise.race([
      bootstrapCloud(),
      new Promise((resolve) => setTimeout(() => resolve('timeout'), waitMs)),
    ]);
    await cloudReady;
  } catch {
    // Cache địa phương là nguồn tạm; lỗi cloud sẽ hiện ở /api/sync/status
  }
  return next();
});

// Hỗ trợ cả trường hợp giữ tiền tố /api và trường hợp rewrite trực tiếp
app.use('/api', router);
// Bản mount không tiền tố chỉ dành cho client cũ. Yêu cầu từ thanh địa chỉ trình
// duyệt (Accept: text/html) phải rơi xuống SPA, nếu không mở sâu /conflicts sẽ ra JSON.
app.use((req, res, next) => (
  String(req.headers.accept || '').includes('text/html') ? next() : router(req, res, next)
));

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Body không phải JSON hợp lệ' });
    return;
  }
  console.error('Unhandled API error:', err);
  res.status(500).json({ error: 'Lỗi server', message: err?.message || 'Không xác định' });
});

export default app;
