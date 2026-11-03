import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Kho tạm trống => store phải khởi động từ data/seed_store.json (bản nằm trong repo công khai).
process.env.APP_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-boot-test-'));
process.env.NODE_ENV = 'test';

const store = await import('../store.ts');

const seedRaw = fs.readFileSync(path.resolve('data/seed_store.json'), 'utf8');
const seed = JSON.parse(seedRaw) as Record<string, any>;

test('bản seed công khai không được cấp phiên đăng nhập còn hiệu lực khi khởi động', () => {
  assert.ok(Array.isArray(seed.events) && seed.events.length > 0, 'seed phải có lịch thật của phường');

  const s = store.getState();
  assert.equal(s.events.length, seed.events.length, 'nội dung nghiệp vụ phải về đủ');
  assert.equal(s.sessions.length, 0, 'token phiên trong seed là khoá đã lộ, không được coi còn hiệu lực');
  assert.equal(s.audit_log.length, 0, 'nhật ký chứa IP của máy khác không được theo seed');
  assert.equal(s.ics_token, '', 'khoá feed ICS không được phát tán qua repo');
  assert.equal((s.push_subscriptions || []).length, 0);
  assert.equal(s.users.length, 0, 'tài khoản mang theo hash mật khẩu, không được lên repo công khai');
  assert.ok(s.publications.every((p) => !p.share_token && !p.share_pin), 'm LINK chia sẻ lịch cũng là khoá');
});

test('bản seed nằm trên đĩa không còn hash mật khẩu, mã setup hay ID thư mục Drive', () => {
  assert.ok(!seedRaw.includes('scrypt'), 'hash mật khẩu dạng scrypt không được nằm trong seed');
  assert.ok(!/"password_hash"\s*:\s*"[^"]+"/.test(seedRaw), 'không được có password_hash đã điền giá trị');
  assert.equal(seed.auth?.setup_code ?? '', '', 'mã setup đang chờ là một bí mật');
  assert.equal(seed.drive_config?.folder_id ?? '', '', 'ID thư mục Drive là đường tới dữ liệu thật của phường');
  assert.equal(seed.drive_config?.folder_url ?? '', '');
  assert.equal(seed.drive_config?.connected ?? false, false, 'seed không được mô tả kết nối đang bật');
});

test('seed trắng tài khoản vẫn mở được đường cài đặt, không kẹt vĩnh viễn', () => {
  // bootstrapAuth chính là cửa duy nhất tạo tài khoản quản trị đầu tiên.
  const setupCode = store.bootstrapAuth();
  if (process.env.GOOGLE_CLIENT_ID?.trim()) {
    assert.equal(setupCode, null, 'đã bật SSO thì đi theo đường đăng nhập Google');
  } else {
    assert.match(String(setupCode), /^[0-9a-f]{8}$/, 'phải in ra mã khởi tạo để người trực tiếp vận hành đọc');
  }
});

test('bộ lọc khi ghi seed cắt khoá nhưng không sửa bản đang chạy trong bộ nhớ', () => {
  const s = store.getState();
  s.ics_token = 'abcdef0123456789abcdef0123456789';
  s.users.push({
    id: 'us_live', email: 'cb@phuong.local', display_name: 'Cán bộ A', role: 'admin',
    password_hash: 'scrypt$abc:def', created_at: new Date().toISOString(),
  } as any);
  s.sessions.push({
    id: 'se_live', user_id: 'us_live', token: 'token-dang-con-hieu-luc', role: 'admin',
    created_at: new Date().toISOString(), expires_at: '2099-01-01T00:00:00.000Z',
    last_seen_at: new Date().toISOString(), user_agent: 'test', ip: '127.0.0.1',
  } as any);
  s.publications.push({ id: 'pb1', week_number: 45, year: 2026, share_token: 'keychia_se', share_pin: '1234' } as any);
  s.auth = { setup_code: '123456', setup_code_created_at: new Date().toISOString() };
  s.drive_config = {
    folder_id: '1AbCdEfGhIjKlMnOpQrStUvWxYz', folder_url: 'https://drive.google.com/drive/folders/1AbCdEfGhIjKl',
    folder_name: 'Bộ não tri thức Lịch công tác', connected: true,
  };

  const banGhiSeed = store.stripSeedSecrets(s as unknown as Record<string, any>);

  assert.equal(banGhiSeed.ics_token, '', 'khoá feed không được đi theo seed');
  assert.deepEqual(banGhiSeed.sessions, [], 'token phiên không được lên repo công khai');
  assert.deepEqual(banGhiSeed.users, [], 'hash mật khẩu không được lên repo công khai');
  const cuaMinh = banGhiSeed.publications.find((p: any) => p.id === 'pb1');
  assert.equal(cuaMinh.share_token, '', 'link chia sẻ trong phiên cũng là khoá phải cắt');
  assert.equal(cuaMinh.share_pin, '');
  assert.equal(banGhiSeed.events.length, s.events.length, 'lịch thật của phường vẫn phải đủ');
  assert.equal(banGhiSeed.auth.setup_code, '');
  assert.equal(banGhiSeed.drive_config.folder_id, '', 'ID Drive chỉ là chuỗi ký tự nhưng mở ra cả kho dữ liệu thật');
  assert.equal(banGhiSeed.drive_config.folder_url, '');
  assert.equal(banGhiSeed.drive_config.connected, false);

  assert.equal(s.ics_token, 'abcdef0123456789abcdef0123456789', 'bản trong bộ nhớ phải còn nguyên để máy này tiếp tục dùng');
  assert.equal(s.sessions.length, 1);
  assert.equal(s.users.length, 1);
  assert.equal(s.users[0].password_hash, 'scrypt$abc:def', 'tài khoản thật của máy này vẫn phải đăng nhập được');
  assert.equal(s.publications[s.publications.length - 1].share_token, 'keychia_se');
  assert.equal(s.drive_config.folder_id, '1AbCdEfGhIjKlMnOpQrStUvWxYz');
});
