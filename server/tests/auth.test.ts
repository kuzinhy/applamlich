import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_PASSWORD_LENGTH,
  SESSION_COOKIE,
  can,
  checkLoginThrottle,
  clearedSessionCookie,
  clientIp,
  createSession,
  findActiveSession,
  hashPassword,
  isSessionExpired,
  newSetupCode,
  normalizeUsername,
  noteLoginFailure,
  noteLoginSuccess,
  parseCookies,
  passwordIssues,
  permissionsOf,
  publicUser,
  resetLoginThrottle,
  serializeSessionCookie,
  setupCodeMatches,
  usernameIssues,
  verifyLoginAttempt,
  verifyPassword,
} from '../auth.ts';
import type { SessionRecord, UserRecord } from '../types.ts';
import { DEFAULT_DRIVE_SETUP } from '../types.ts';

function user(over: Partial<UserRecord> = {}): UserRecord {
  const base: UserRecord = {
    id: 'u1',
    username: 'vanphong',
    display_name: 'Văn phòng Đảng ủy',
    role: 'editor',
    password_hash: hashPassword('LichCongTac2026'),
    is_active: true,
    created_at: '2026-10-01T08:00:00.000Z',
    last_login_at: null,
    auth_provider: 'local',
    email: '',
    google_sub: '',
    drive_setup: { ...DEFAULT_DRIVE_SETUP },
  };
  return { ...base, ...over };
}

// ---------------------------------------------------------------- băm mật khẩu

test('hashPassword lưu scrypt kèm salt và không chứa mật khẩu gốc', () => {
  const hash = hashPassword('LichCongTac2026');
  assert.match(hash, /^scrypt\$16384\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  assert.ok(!hash.includes('LichCongTac2026'));
});

test('hai lần băm cùng mật khẩu cho chuỗi khác nhau vì salt ngẫu nhiên', () => {
  assert.notEqual(hashPassword('LichCongTac2026'), hashPassword('LichCongTac2026'));
});

test('verifyPassword đúng sai và chịu được hash hỏng', () => {
  const hash = hashPassword('LichCongTac2026');
  assert.equal(verifyPassword('LichCongTac2026', hash), true);
  assert.equal(verifyPassword('lichcongtac2026', hash), false);
  assert.equal(verifyPassword('', hash), false);
  for (const broken of ['', 'scrypt$1$2$3$4', 'md5$abc', 'khong-phai-hash']) {
    assert.equal(verifyPassword('LichCongTac2026', broken), false, `phải trả false cho "${broken}"`);
  }
});

// ---------------------------------------------------------------- mật khẩu & tên đăng nhập

test('passwordIssues nêu lý do cụ thể, mật khẩu tốt thì rỗng', () => {
  assert.deepEqual(passwordIssues('LichCongTac2026', 'vanphong'), []);
  assert.match(passwordIssues('abc', 'vanphong').join(' '), /tối thiểu 10 ký tự/);
  assert.match(passwordIssues('khongcoso', 'vanphong').join(' '), /chữ số/);
  assert.match(passwordIssues('vanphong', 'vanphong').join(' '), /trùng tên đăng nhập/);
  assert.match(passwordIssues('vanphong123', 'vanphong').join(' '), /chứa tên đăng nhập/);
  assert.deepEqual(passwordIssues('Lich-Cong-Tac-44', 'vanphong'), []);
  assert.match(passwordIssues('password123456', 'vanphong').join(' '), /Quá phổ biến/);
  assert.ok(passwordIssues('x'.repeat(MAX_PASSWORD_LENGTH + 10), 'vanphong').includes(`Tối đa ${MAX_PASSWORD_LENGTH} ký tự`));
});

test('usernameIssues chặn dấu cách và hoa', () => {
  assert.deepEqual(usernameIssues('vanphong'), []);
  assert.deepEqual(usernameIssues('bt_tuyen'), []);
  assert.match(usernameIssues('Van Phong').join(' '), /chữ thường/);
  assert.match(usernameIssues('ab').join(' '), /tối thiểu 3/);
});

test('normalizeUsername cắt khoảng trắng và hạ chữ hoa', () => {
  assert.equal(normalizeUsername('  BíThư '), 'bíthư');
  assert.equal(normalizeUsername(undefined), '');
});

// ---------------------------------------------------------------- đối chiếu đăng nhập

test('verifyLoginAttempt chấp nhận đúng cặp, từ mọi kiểu sai', () => {
  const u = user();
  assert.equal(verifyLoginAttempt([u], 'vanphong', 'LichCongTac2026').ok, true);
  assert.equal(verifyLoginAttempt([u], 'VANPHONG', 'LichCongTac2026').ok, true, 'tên đăng nhập không phân biệt hoa thường');
  assert.equal(verifyLoginAttempt([u], 'vanphong', 'SaiRoiNhe').ok, false);
  assert.equal(verifyLoginAttempt([u], 'anhvandem', 'LichCongTac2026').ok, false);
  assert.equal(verifyLoginAttempt([], 'vanphong', 'LichCongTac2026').ok, false);
});

test('tài khoản bị vô hiệu hoá không đăng nhập được dù đúng mật khẩu', () => {
  const u = user({ is_active: false });
  assert.equal(verifyLoginAttempt([u], 'vanphong', 'LichCongTac2026').ok, false);
});

// ---------------------------------------------------------------- phân quyền

test('viewer chỉ đọc, editor sửa lịch nhưng không đụng cài đặt, admin là hết', () => {
  assert.equal(can('viewer', 'read'), true);
  assert.equal(can('viewer', 'events:write'), false);
  assert.equal(can('editor', 'events:write'), true);
  assert.equal(can('editor', 'publish'), true);
  assert.equal(can('editor', 'settings:write'), false);
  assert.equal(can('editor', 'users:manage'), false);
  assert.equal(can('admin', 'users:manage'), true);
  assert.equal(can(undefined, 'read'), false);
  assert.equal(permissionsOf('viewer').length, 1);
  assert.equal(permissionsOf('editor').includes('backup'), false);
});

test('publicUser không bao giờ lộ password_hash', () => {
  const u = user();
  const json = JSON.stringify(publicUser(u));
  assert.ok(!json.includes('password_hash'));
  assert.ok(!json.includes(u.password_hash.slice(0, 20)));
  assert.equal(publicUser(u).role_label, 'Biên tập');
});

// ---------------------------------------------------------------- phiên

test('findActiveSession trả về user khi còn hạn và loại khi hết hạn', () => {
  const u = user();
  const now = new Date('2026-10-27T09:00:00.000Z');
  const session = createSession(u, { now, ip: '127.0.0.1', userAgent: 'node-test' });
  assert.equal(session.user_id, u.id);
  assert.equal(findActiveSession([session], [u], session.id, now)?.user.id, u.id);

  const later = new Date(new Date(session.expires_at).getTime() + 1000);
  assert.equal(isSessionExpired(session, later), true);
  assert.equal(findActiveSession([session], [u], session.id, later), null);
  assert.equal(findActiveSession([session], [u], 'khong-phai-session', now), null);
  assert.equal(findActiveSession([session], [u], undefined, now), null);
});

test('phiên của tài khoản đã vô hiệu hoá hoặc bị xoá không còn hiệu lực', () => {
  const u = user();
  const now = new Date('2026-10-27T09:00:00.000Z');
  const session = createSession(u, { now });
  assert.equal(findActiveSession([session], [{ ...u, is_active: false }], session.id, now), null);
  assert.equal(findActiveSession([session], [], session.id, now), null);
});

test('danh sách phiên lưu id ngẫu nhiên đủ dài để không đoán được', () => {
  const ids = new Set<string>();
  for (let i = 0; i < 5; i++) ids.add(createSession(user(), { now: new Date() }).id);
  assert.equal(ids.size, 5);
  for (const id of ids) assert.ok(id.length >= 20, `id quá ngắn: ${id}`);
});

// ---------------------------------------------------------------- cookie

test('serializeSessionCookie đặt HttpOnly và Secure chỉ khi có HTTPS', () => {
  const expires = new Date('2026-11-03T09:00:00.000Z');
  const plain = serializeSessionCookie('abc123', expires, { secure: false, production: false });
  assert.match(plain, /^tg_session=abc123;/);
  assert.match(plain, /HttpOnly/);
  assert.match(plain, /SameSite=Strict/);
  assert.ok(!plain.includes('Secure'));

  const secure = serializeSessionCookie('abc123', expires, { secure: true, production: true });
  assert.match(secure, /SameSite=None/);
  assert.match(secure, /Secure/);
});

test('parseCookies chỉ lấy cookie phiên, bỏ cookie khác', () => {
  const parsed = parseCookies(`theme=dark; ${SESSION_COOKIE}=xyz%3D%3D; csrf=abc`);
  assert.deepEqual(Object.keys(parsed), [SESSION_COOKIE]);
  assert.equal(parsed[SESSION_COOKIE], 'xyz==');
  assert.deepEqual(parseCookies(undefined), {});
});

test('clearedSessionCookie xoá phiên bằng Max-Age=0', () => {
  assert.match(clearedSessionCookie(false), /Max-Age=0/);
  assert.match(clearedSessionCookie(true), /Max-Age=0; Secure/);
});

// ---------------------------------------------------------------- địa chỉ client

test('không tin X-Forwarded-For khi chưa bật TRUST_PROXY', () => {
  const prev = process.env.TRUST_PROXY;
  delete process.env.TRUST_PROXY;
  const req = { socket: { remoteAddress: '10.0.0.5' }, headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.5' } };
  assert.equal(clientIp(req), '10.0.0.5');
  process.env.TRUST_PROXY = '1';
  assert.equal(clientIp(req), '203.0.113.9');
  if (prev === undefined) delete process.env.TRUST_PROXY;
  else process.env.TRUST_PROXY = prev;
});

test('clientIp gỡ tiền tố ::ffff: của IPv4 mapped', () => {
  const prev = process.env.TRUST_PROXY;
  delete process.env.TRUST_PROXY;
  assert.equal(clientIp({ socket: { remoteAddress: '::ffff:127.0.0.1' }, headers: {} }), '127.0.0.1');
  if (prev === undefined) delete process.env.TRUST_PROXY;
  else process.env.TRUST_PROXY = prev;
});

// ---------------------------------------------------------------- khoá khi đăng nhập sai

test('khoá tạm sau nhiều lần sai và mở lại khi thành công', () => {
  resetLoginThrottle();
  const now = Date.UTC(2026, 10, 27, 9);
  for (let i = 0; i < 8; i++) noteLoginFailure('10.1.1.1', 'vanphong', now);
  const blocked = checkLoginThrottle('10.1.1.1', 'vanphong', now);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds > 0);

  noteLoginSuccess('10.1.1.1', 'vanphong');
  assert.equal(checkLoginThrottle('10.1.1.1', 'vanphong', now).allowed, true);
  resetLoginThrottle();
});

test('chưa vượt ngưỡng thì vẫn cho thử tiếp', () => {
  resetLoginThrottle();
  const now = Date.UTC(2026, 10, 27, 9);
  for (let i = 0; i < 5; i++) noteLoginFailure('10.1.1.2', 'vanphong', now);
  assert.equal(checkLoginThrottle('10.1.1.2', 'vanphong', now).allowed, true);
  resetLoginThrottle();
});

test('khoá theo IP chặn cả việc đổi tên đăng nhập, thời gian khoá tăng dần', () => {
  resetLoginThrottle();
  const now = Date.UTC(2026, 10, 27, 9);
  for (let i = 0; i < 8; i++) noteLoginFailure('10.1.1.3', 'motai', now);
  assert.equal(checkLoginThrottle('10.1.1.3', 'khacai', now).allowed, false);
  const first = checkLoginThrottle('10.1.1.3', 'khacai', now).retryAfterSeconds;
  for (let i = 0; i < 8; i++) noteLoginFailure('10.1.1.3', 'motai', now + 1);
  assert.ok(checkLoginThrottle('10.1.1.3', 'motai', now + 1).retryAfterSeconds > first);
  resetLoginThrottle();
});

// ---------------------------------------------------------------- mã khởi tạo

test('setupCodeMatches so sánh đúng và không lộ qua kiểu chuỗi con', () => {
  const code = newSetupCode();
  assert.match(code, /^[0-9a-f]{8}$/);
  assert.equal(setupCodeMatches(code, code), true);
  assert.equal(setupCodeMatches(code, code.toUpperCase()), false);
  assert.equal(setupCodeMatches(code, ''), false);
  assert.equal(setupCodeMatches('', code), false);
  assert.equal(setupCodeMatches(code, code.slice(0, 4)), false);
});

/** Phiên bản dẫn xuất của SessionRecord để dùng trực tiếp khi kiểm tra kiểu. */
const _sessionShape: SessionRecord = {
  id: 'x', user_id: 'u', role: 'viewer', created_at: '', expires_at: '', last_seen_at: '', user_agent: '', ip: '',
};
test('kiểu SessionRecord khớp với createSession', () => {
  const built = createSession(user({ role: 'viewer' }));
  assert.deepEqual(Object.keys(built).sort(), Object.keys(_sessionShape).sort());
});
