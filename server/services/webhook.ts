/**
 * Webhook xuất: gửi sự kiện lịch sang Google Apps Script / n8n / Zapier.
 * Body được ký HMAC-SHA256 để bên nhận xác thực được nguồn gửi.
 * Mặc định TẮT và không gửi tên lãnh đạo/địa điểm — chỉ gửi mốc thời gian cho tới khi
 * người dùng bật "include_details" trong trang Cài đặt.
 */
import crypto from 'node:crypto';
import { getState, persist, rememberWebhookDelivery } from '../store.ts';
import type { WebhookConfig, WebhookEvent } from '../types.ts';

export const WEBHOOK_SIGNATURE_HEADER = 'X-TG-Signature';
export const WEBHOOK_TIMESTAMP_HEADER = 'X-TG-Timestamp';
export const WEBHOOK_EVENT_HEADER = 'X-TG-Event';

export function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/** HMAC.hex — hai phía chỉ cần tính HMAC trên đúng chuỗi body là khớp. */
export function signWebhookBody(secret: string, body: string): string {
  return `sha256=${crypto.createHmac('sha256', String(secret ?? '')).update(body, 'utf8').digest('hex')}`;
}

export function verifyWebhookSignature(secret: string, body: string, header: string): boolean {
  const expected = signWebhookBody(secret, body);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(header ?? ''), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Chỉ cho http/https; chặn scheme khác để tránh mở đường đọc file nội bộ. */
export function webhookUrlError(url: string): string | null {
  const value = String(url ?? '').trim();
  if (!value) return 'Chưa nhập URL webhook';
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return 'URL webhook không hợp lệ';
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return 'URL webhook chỉ chấp nhận http hoặc https';
  }
  if (!parsed.hostname) return 'URL webhook thiếu tên miền';
  if (parsed.username || parsed.password) return 'Không nhúng tài khoản vào URL webhook';
  return null;
}

export interface WebhookContext {
  unit_name?: string;
  week_number?: number;
  year?: number;
  week_start?: string;
  week_end?: string;
  document_number?: string;
  counts?: Record<string, number>;
  items?: Array<{ date: string; start_time: string | null; title: string; location?: string; chair?: string }>;
}

/**
 * Gói payload. Khi include_details = false chỉ còn ngày/giờ/số lượng:
 * đủ để đồng bộ bảng tính nhưng không lộ tên cán bộ hay địa điểm.
 */
export function buildWebhookPayload(config: WebhookConfig, event: WebhookEvent, ctx: WebhookContext = {}) {
  const base = {
    event,
    occurred_at: new Date().toISOString(),
    unit_name: ctx.unit_name || '',
    week: {
      number: ctx.week_number ?? null,
      year: ctx.year ?? null,
      start: ctx.week_start ?? null,
      end: ctx.week_end ?? null,
      document_number: ctx.document_number ?? null,
    },
    counts: ctx.counts ?? {},
  };
  if (!config.include_details) return { ...base, items: undefined, redacted: true };
  return { ...base, items: ctx.items ?? [], redacted: false };
}

export function webhookTimeoutMs(): number {
  return Math.min(20000, Math.max(1000, Number(process.env.WEBHOOK_TIMEOUT_MS) || 6000));
}

function backoffMs(attempt: number): number {
  return [0, 1000, 3000][Math.min(attempt, 2)];
}

/**
 * Đích hiển thị trong nhật ký: bỏ query string vì nhiều dịch vụ nhúng token ở đó.
 */
export function redactTarget(url: string): string {
  try {
    const parsed = new URL(String(url));
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return '';
  }
}

/**
 * Google Apps Script không cho hàm doPost đọc header, nên ngoài X-TG-Signature
 * chữ ký còn được gửi ở tham số `sig` của URL. Bên nhận so khớp e.parameter.sig.
 */
export function signedTargetUrl(url: string, signature: string): string {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}sig=${encodeURIComponent(signature)}`;
}

/** Một lần gọi tới bên nhận; trả về kết quả thay vì ném lỗi để nơi gọi tự ghi nhật ký. */
export async function sendWebhookOnce(
  config: { url: string; secret: string },
  event: string,
  body: string,
): Promise<{ ok: boolean; status: number | null; error: string }> {
  const signature = signWebhookBody(config.secret, body);
  try {
    const res = await fetch(signedTargetUrl(config.url, signature), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'TuyenGiaoCalendarAI/1 webhook',
        [WEBHOOK_EVENT_HEADER]: event,
        [WEBHOOK_TIMESTAMP_HEADER]: String(Math.floor(Date.now() / 1000)),
        [WEBHOOK_SIGNATURE_HEADER]: signature,
      },
      body,
      signal: AbortSignal.timeout(webhookTimeoutMs()),
    });
    return { ok: res.ok, status: res.status, error: res.ok ? '' : `HTTP ${res.status}` };
  } catch (err: any) {
    const message = String(err?.name === 'TimeoutError' ? 'Hết thời gian chờ' : err?.message || err);
    return { ok: false, status: null, error: message.slice(0, 200) };
  }
}

/**
 * Gửi không đồng bộ, không làm chậm request của người dùng.
 * Trả về Promise để test chờ được; route call-site dùng `void`.
 */
export function dispatchWebhook(event: WebhookEvent, ctx: WebhookContext): Promise<void> {
  const config = getState().webhook_config;
  if (!config.enabled) return Promise.resolve();
  if (!config.events.includes(event)) return Promise.resolve();
  const urlError = webhookUrlError(config.url);
  const body = JSON.stringify(buildWebhookPayload(config, event, ctx));
  if (urlError) {
    rememberWebhookDelivery({
      at: new Date().toISOString(),
      event,
      target: '',
      status: 'skipped',
      http_status: null,
      attempts: 0,
      error: urlError,
    });
    persist();
    return Promise.resolve();
  }
  return sendWithRetry(config, event, body);
}

async function sendWithRetry(config: WebhookConfig, event: WebhookEvent, body: string): Promise<void> {
  const maxAttempts = 3;
  let lastError = '';
  let httpStatus: number | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt) await new Promise((resolve) => setTimeout(resolve, backoffMs(attempt)));
    const outcome = await sendWebhookOnce(config, event, body);
    httpStatus = outcome.status ?? httpStatus;
    if (outcome.ok) {
      rememberWebhookDelivery({
        at: new Date().toISOString(), event, target: redactTarget(config.url),
        status: 'sent', http_status: outcome.status, attempts: attempt + 1, error: '',
      });
      persist();
      return;
    }
    lastError = outcome.error;
  }
  rememberWebhookDelivery({
    at: new Date().toISOString(),
    event,
    target: redactTarget(config.url),
    status: 'failed',
    http_status: httpStatus,
    attempts: maxAttempts,
    error: lastError,
  });
  persist();
}

/** Cấu hình an toàn trả về client: secret chỉ hiện một lần khi tạo lại. */
export function publicWebhookConfig(config: WebhookConfig, showSecret: boolean) {
  return {
    enabled: config.enabled,
    url: config.url,
    events: config.events,
    include_details: config.include_details,
    secret: showSecret ? config.secret : config.secret ? '••••đã cấu hình••••' : '',
    has_secret: Boolean(config.secret),
  };
}
