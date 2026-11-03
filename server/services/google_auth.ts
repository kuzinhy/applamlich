/**
 * Xác minh ID token của Google Identity Services ở phía server.
 * App chỉ cần OAuth client ID (công khai), không cần client secret: token JWT tự mang
 * chữ ký RS256 do Google cấp, kiểm tra qua JWKS. Không lưu token lâu hơn một phiên đăng nhập.
 */
import crypto from 'node:crypto';

const JWKS_URI = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);
const CLOCK_SKEW_SECONDS = 60;
const JWKS_TTL_MS = 60 * 60 * 1000;

export interface GoogleIdentity {
  sub: string;
  email: string;
  name: string;
  picture: string;
  /** Google Workspace domain khi đăng nhập bằng tài khoản cơ quan; trống với Gmail thường. */
  hd: string;
}

export interface VerifyOptions {
  clientId: string;
  allowedHostedDomains?: string[];
  fetchJwks?: () => Promise<unknown>;
  now?: number;
}

/**
 * Kết quả xác minh. Dùng một interface có trường tuỳ chọn thay vì union phân biệt
 * vì tsconfig tắt strictNullChecks — union boolean không thu hẹp được khi truy cập trường.
 */
export interface VerifyResult {
  ok: boolean;
  identity?: GoogleIdentity;
  error?: string;
  code?: string;
}

function decodeJsonSegment(segment: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

async function defaultFetchJwks(): Promise<unknown> {
  const res = await fetch(JWKS_URI, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Google trả ${res.status}`);
  return res.json();
}

let keyCache: { keys: Map<string, crypto.KeyObject>; at: number } = { keys: new Map(), at: 0 };

/** Khoá công khai theo kid; lấy lại JWKS khi hết hạn hoặc chưa từng thấy kid này. */
async function publicKeyOf(kid: string, fetchJwks: () => Promise<unknown>): Promise<crypto.KeyObject | null> {
  const fresh = keyCache.at && Date.now() - keyCache.at < JWKS_TTL_MS;
  if (fresh && keyCache.keys.has(kid)) return keyCache.keys.get(kid) ?? null;
  const payload = await fetchJwks().catch(() => null) as { keys?: Array<Record<string, unknown>> } | null;
  const jwks = payload?.keys;
  if (!Array.isArray(jwks) || !jwks.length) return null;
  const keys = new Map<string, crypto.KeyObject>();
  for (const jwk of jwks) {
    if (jwk.kty !== 'RSA' || typeof jwk.kid !== 'string') continue;
    try {
      keys.set(jwk.kid, crypto.createPublicKey({ key: jwk as crypto.JsonWebKey, format: 'jwk' }));
    } catch {
      // bỏ qua khoá lạ dạng, tiếp tục với khoá còn lại
    }
  }
  keyCache = { keys, at: Date.now() };
  return keys.get(kid) ?? null;
}

function readString(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  return typeof value === 'string' ? value : '';
}

export async function verifyGoogleIdToken(
  credential: string,
  options: VerifyOptions,
): Promise<VerifyResult> {
  const { clientId, fetchJwks = defaultFetchJwks, now = Date.now() } = options;
  if (!clientId) {
    return { ok: false, code: 'GOOGLE_NOT_CONFIGURED', error: 'Chưa cấu hình GOOGLE_CLIENT_ID nên không xác minh được tài khoản Google.' };
  }
  const parts = String(credential ?? '').split('.');
  if (parts.length !== 3) {
    return { ok: false, code: 'BAD_TOKEN', error: 'Token Google không đúng dạng.' };
  }
  const [headerB64, payloadB64, signatureB64] = parts;
  const header = decodeJsonSegment(headerB64);
  const claims = decodeJsonSegment(payloadB64);
  if (!header || !claims) {
    return { ok: false, code: 'BAD_TOKEN', error: 'Token Google không đọc được.' };
  }
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') {
    return { ok: false, code: 'BAD_TOKEN', error: 'Token Google không dùng chữ ký RS256.' };
  }

  let publicKey: crypto.KeyObject | null;
  try {
    publicKey = await publicKeyOf(header.kid, fetchJwks);
  } catch {
    publicKey = null;
  }
  if (!publicKey) {
    return {
      ok: false,
      code: 'JWKS_UNAVAILABLE',
      error: 'Không lấy được khoá công khai của Google (máy chủ không truy cập được googleapis.com?).',
    };
  }

  const signingInput = Buffer.from(`${headerB64}.${payloadB64}`, 'utf8');
  const signature = Buffer.from(signatureB64, 'base64url');
  if (!crypto.verify('RSA-SHA256', signingInput, publicKey, signature)) {
    return { ok: false, code: 'BAD_SIGNATURE', error: 'Chữ ký token Google không hợp lệ.' };
  }

  if (!ISSUERS.has(readString(claims, 'iss'))) {
    return { ok: false, code: 'BAD_ISSUER', error: 'Token không do Google cấp.' };
  }
  if (claims.aud !== clientId) {
    return { ok: false, code: 'BAD_AUDIENCE', error: 'Token không dành cho ứng dụng này.' };
  }
  const expiresAt = Number(claims.exp);
  const notBefore = Number(claims.nbf) || Number(claims.iat) || 0;
  if (!Number.isFinite(expiresAt) || expiresAt * 1000 + CLOCK_SKEW_SECONDS * 1000 < now) {
    return { ok: false, code: 'TOKEN_EXPIRED', error: 'Token Google đã hết hạn, đăng nhập lại nhé.' };
  }
  if (notBefore && notBefore * 1000 - CLOCK_SKEW_SECONDS * 1000 > now) {
    return { ok: false, code: 'TOKEN_EXPIRED', error: 'Token Google chưa có hiệu lực (đồng hồ máy lệch giờ).' };
  }

  const email = readString(claims, 'email').trim().toLowerCase();
  const sub = readString(claims, 'sub');
  if (!sub || !email) {
    return { ok: false, code: 'BAD_TOKEN', error: 'Token Google thiếu danh tính hoặc email.' };
  }
  if (claims.email_verified !== true) {
    return { ok: false, code: 'EMAIL_UNVERIFIED', error: 'Email Google này chưa được xác minh.' };
  }
  const hd = readString(claims, 'hd').toLowerCase();
  const allow = (options.allowedHostedDomains ?? []).map((d) => String(d).trim().toLowerCase()).filter(Boolean);
  if (allow.length && (!hd || !allow.includes(hd))) {
    return {
      ok: false,
      code: 'DOMAIN_BLOCKED',
      error: `Chỉ nhận tài khoản thuộc các miền: ${allow.join(', ')}.`,
    };
  }

  return {
    ok: true,
    identity: {
      sub,
      email,
      name: readString(claims, 'name').slice(0, 80),
      picture: readString(claims, 'picture').slice(0, 500),
      hd,
    },
  };
}

/** Client ID công khai + miền được phép, đọc từ môi trường. */
export function googleLoginConfig(): { enabled: boolean; client_id: string; allowed_domains: string[] } {
  const clientId = String(process.env.GOOGLE_CLIENT_ID ?? '').trim();
  const domains = String(process.env.GOOGLE_ALLOWED_DOMAINS ?? '')
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean);
  return { enabled: Boolean(clientId), client_id: clientId, allowed_domains: domains };
}
