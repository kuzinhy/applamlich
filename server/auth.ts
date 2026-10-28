/**
 * Đăng nhập cho ứng dụng lịch công tác: băm mật khẩu bằng scrypt, phiên là mã ngẫu nhiên
 * lưu ở store (revocation được), phân quyền ba mức admin / editor / viewer.
 * Mọi hàm ở đây thuần (nhận dữ liệu qua tham số) để unit test không cần khởi động server.
 */
import crypto from 'node:crypto';
import type { SessionRecord, UserRecord, UserRole } from './types.ts';

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const SALT_BYTES = 16;
let dummyHash: string | null = null;
/** Hash mồi để khi tên đăng nhập không tồn tại vẫn tốn đúng một lần băm (chống dò tên). */
function timingEqualizerHash(): string {
  if (!dummyHash) dummyHash = hashPassword('tg-timing-equalizer-not-a-real-secret');
  return dummyHash;
}

export const MAX_PASSWORD_LENGTH = 200;
export const MAX_USERNAME_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(SALT_BYTES);
  const derived = crypto.scryptSync(normalizePasswordInput(password), salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
  });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

function normalizePasswordInput(password: string): string {
  return String(password ?? '').slice(0, MAX_PASSWORD_LENGTH);
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = String(stored ?? '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(hashB64, 'base64');
  if (!salt.length || !expected.length) return false;
  const derived = crypto.scryptSync(normalizePasswordInput(password), salt, expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return crypto.timingSafeEqual(derived, expected);
}

/** Gợi ý cụ thể thay vì chỉ "mật khẩu yếu"; không áp mẫu hình sự hoá bắt buộc. */
export function passwordIssues(password: string, username = ''): string[] {
  const value = String(password ?? '');
  const issues: string[] = [];
  const min = minPasswordLength();
  if (value.length < min) issues.push(`Cần tối thiểu ${min} ký tự`);
  if (value.length > MAX_PASSWORD_LENGTH) issues.push(`Tối đa ${MAX_PASSWORD_LENGTH} ký tự`);
  if (!/[a-zA-ZÀ-ỹĐđ]/.test(value)) issues.push('Cần có chữ cái');
  if (!/[0-9]/.test(value)) issues.push('Cần có chữ số');
  if (username && value.toLowerCase() === username.toLowerCase()) issues.push('Không được trùng tên đăng nhập');
  else if (username.length >= 4 && value.toLowerCase().includes(username.toLowerCase())) {
    issues.push('Không được chứa tên đăng nhập');
  }
  if (/(123456|password|admin123|anbinh|abcd1234)/i.test(value)) issues.push('Quá phổ biến, dễ bị đoán');
  return issues;
}

export function minPasswordLength(): number {
  return Math.max(8, Number(process.env.PASSWORD_MIN_LENGTH) || 10);
}

export function normalizeUsername(raw: unknown): string {
  return String(raw ?? '').trim().toLowerCase();
}

export function usernameIssues(username: string): string[] {
  const issues: string[] = [];
  if (username.length < 3) issues.push('Tên đăng nhập cần tối thiểu 3 ký tự');
  if (username.length > MAX_USERNAME_LENGTH) issues.push('Tên đăng nhập quá dài');
  if (!/^[a-z0-9._-]+$/.test(username)) issues.push('Chỉ dùng chữ thường, số, dấu chấm, gạch dưới, gạch nối');
  return issues;
}

/**
 * Đối chiếu đăng nhập. Luôn băm một lần kể cả khi tên không tồn tại, và không tiết lộ
 * tên sai hay mật khẩu sai khác nhau — chống dò tài khoản.
 */
export function verifyLoginAttempt(
  users: UserRecord[],
  username: string,
  password: string,
): { ok: false } | { ok: true; user: UserRecord } {
  const wanted = normalizeUsername(username);
  const user = users.find((u) => u.username === wanted);
  const matched = verifyPassword(password, user ? user.password_hash : timingEqualizerHash());
  if (!user || !matched) return { ok: false };
  if (!user.is_active) return { ok: false };
  return { ok: true, user };
}

export type Permission =
  | 'read'
  | 'events:write'
  | 'proposals:review'
  | 'sources:write'
  | 'agency:write'
  | 'ai:run'
  | 'publish'
  | 'settings:write'
  | 'drive:write'
  | 'users:manage'
  | 'audit:read'
  | 'backup';

const ROLE_PERMISSIONS: Record<UserRole, Permission[] | '*'> = {
  admin: '*',
  editor: ['read', 'events:write', 'proposals:review', 'sources:write', 'agency:write', 'ai:run', 'publish'],
  viewer: ['read'],
};

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Quản trị',
  editor: 'Biên tập',
  viewer: 'Chỉ xem',
};

export function isUserRole(value: unknown): value is UserRole {
  return value === 'admin' || value === 'editor' || value === 'viewer';
}

export function can(role: UserRole | undefined | null, perm: Permission): boolean {
  if (!role) return false;
  const granted = ROLE_PERMISSIONS[role];
  return granted === '*' || granted.includes(perm);
}

export const ALL_PERMISSIONS: Permission[] = [
  'read', 'events:write', 'proposals:review', 'sources:write', 'agency:write',
  'ai:run', 'publish', 'settings:write', 'drive:write', 'users:manage', 'audit:read', 'backup',
];

export function permissionsOf(role: UserRole): Permission[] {
  const granted = ROLE_PERMISSIONS[role];
  return granted === '*' ? ALL_PERMISSIONS.slice() : granted.slice();
}

/** Bản sao an toàn để trả về client: bỏ hẳn mật khẩu và salt. */
export function publicUser(user: UserRecord) {
  return {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    role: user.role,
    role_label: ROLE_LABELS[user.role],
    is_active: user.is_active,
    created_at: user.created_at,
    last_login_at: user.last_login_at,
    auth_provider: user.auth_provider,
    email: user.email,
    drive_setup: user.drive_setup,
    permissions: permissionsOf(user.role),
  };
}

export function sessionTtlDays(): number {
  return Math.min(30, Math.max(1, Number(process.env.SESSION_TTL_DAYS) || 7));
}

export function createSession(
  user: UserRecord,
  meta: { userAgent?: string; ip?: string; now?: Date } = {},
): SessionRecord {
  const now = meta.now ?? new Date();
  return {
    id: crypto.randomBytes(24).toString('base64url'),
    user_id: user.id,
    role: user.role,
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + sessionTtlDays() * 86400000).toISOString(),
    last_seen_at: now.toISOString(),
    user_agent: String(meta.userAgent ?? '').slice(0, 200),
    ip: String(meta.ip ?? '').slice(0, 60),
  };
}

export function isSessionExpired(session: SessionRecord, now = new Date()): boolean {
  return new Date(session.expires_at).getTime() <= now.getTime();
}

export function findActiveSession(
  sessions: SessionRecord[],
  users: UserRecord[],
  sessionId: string | undefined,
  now = new Date(),
): { session: SessionRecord; user: UserRecord } | null {
  if (!sessionId) return null;
  const session = sessions.find((s) => s.id === sessionId);
  if (!session || isSessionExpired(session, now)) return null;
  const user = users.find((u) => u.id === session.user_id);
  if (!user || !user.is_active) return null;
  return { session, user };
}

// ---------------------------------------------------------------- khoá tạm khi đăng nhập sai

interface ThrottleBucket {
  fails: number;
  lastAt: number;
  lockedUntil: number;
}

const buckets = new Map<string, ThrottleBucket>();

function maxFailures(): number {
  return Math.max(3, Number(process.env.LOGIN_MAX_FAILURES) || 8);
}

function lockMinutes(): number {
  return Math.max(1, Number(process.env.LOGIN_LOCKOUT_MINUTES) || 15);
}

/** Càng sai nhiều thì khoá càng lâu (gấp đôi mỗi lần vượt ngưỡng), chặn sạch từ ngoài. */
export function checkLoginThrottle(ip: string, username: string, now = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
  for (const key of throttleKeys(ip, username)) {
    const bucket = buckets.get(key);
    if (bucket && bucket.lockedUntil > now) {
      return { allowed: false, retryAfterSeconds: Math.ceil((bucket.lockedUntil - now) / 1000) };
    }
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export function noteLoginFailure(ip: string, username: string, now = Date.now()): void {
  prune(now);
  for (const key of throttleKeys(ip, username)) {
    const bucket = buckets.get(key) ?? { fails: 0, lastAt: now, lockedUntil: 0 };
    bucket.fails += 1;
    bucket.lastAt = now;
    if (bucket.fails >= maxFailures()) {
      const rounds = Math.floor(bucket.fails / maxFailures());
      bucket.lockedUntil = now + lockMinutes() * 60000 * Math.min(32, 2 ** (rounds - 1));
    }
    buckets.set(key, bucket);
  }
}

export function noteLoginSuccess(ip: string, username: string): void {
  for (const key of throttleKeys(ip, username)) buckets.delete(key);
}

export function resetLoginThrottle(): void {
  buckets.clear();
}

function throttleKeys(ip: string, username: string): string[] {
  return [`ip:${ip}`, `acct:${normalizeUsername(username)}`];
}

function prune(now: number): void {
  if (buckets.size < 2000) return;
  for (const [key, bucket] of buckets) {
    if (now - bucket.lastAt > 86400000 && bucket.lockedUntil < now) buckets.delete(key);
  }
}

// ---------------------------------------------------------------- cookie & địa chỉ thật

export const SESSION_COOKIE = 'tg_session';

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of String(header ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    const name = part.slice(0, index).trim();
    if (name !== SESSION_COOKIE) continue;
    out[name] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return out;
}

export function serializeSessionCookie(
  sessionId: string,
  expiresAt: Date,
  opts: { secure: boolean; production?: boolean },
): string {
  const sameSite = opts.production ? 'None' : 'Strict';
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}`,
    'Path=/',
    'HttpOnly',
    `SameSite=${sameSite}`,
    `Expires=${expiresAt.toUTCString()}`,
    opts.secure ? 'Secure' : '',
  ].filter(Boolean).join('; ');
}

export function clearedSessionCookie(secure: boolean): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=${secure ? 'None' : 'Strict'}; Max-Age=0${secure ? '; Secure' : ''}`;
}

/**
 * Chỉ tin X-Forwarded-For khi tự declares đặt TRUST_PROXY=1 (sau reverse proxy có TLS).
 * Nếu không, header này do client gửi lên và sẽ làm giả được toàn bộ chống dò mật khẩu.
 */
export function clientIp(req: {
  ip?: string;
  socket?: { remoteAddress?: string };
  headers?: Record<string, string | string[] | undefined>;
}): string {
  if (process.env.TRUST_PROXY === '1') {
    const raw = req.headers?.['x-forwarded-for'];
    const first = String(Array.isArray(raw) ? raw[0] : raw ?? '').split(',')[0].trim();
    if (first) return first.slice(0, 60);
  }
  return String(req.socket?.remoteAddress ?? req.ip ?? 'unknown').replace(/^::ffff:/, '').slice(0, 60);
}

export function isHttpsRequest(req: {
  secure?: boolean;
  headers?: Record<string, string | string[] | undefined>;
}): boolean {
  const mode = process.env.COOKIE_SECURE || 'auto';
  if (mode === 'always') return true;
  if (mode === 'never') return false;
  if (req.secure) return true;
  if (process.env.TRUST_PROXY !== '1') return false;
  const proto = req.headers?.['x-forwarded-proto'];
  return String(Array.isArray(proto) ? proto[0] : proto ?? '').split(',')[0].trim().toLowerCase() === 'https';
}

// ---------------------------------------------------------------- mã khởi tạo tài khoản đầu

export function newSetupCode(): string {
  return crypto.randomBytes(4).toString('hex');
}

export function setupCodeMatches(expected: string, provided: string): boolean {
  const a = Buffer.from(String(expected ?? ''), 'utf8');
  const b = Buffer.from(String(provided ?? ''), 'utf8');
  if (a.length !== b.length) {
    crypto.timingSafeEqual(Buffer.alloc(32), Buffer.alloc(32));
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

/** Mật khẩu cũ phải được xác minh trước khi đổi, kể cả với tài khoản đang đăng nhập. */
export function canChangePassword(user: UserRecord, currentPassword: string): boolean {
  return verifyPassword(currentPassword, user.password_hash);
}
