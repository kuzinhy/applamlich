import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  buildWebhookPayload,
  generateWebhookSecret,
  publicWebhookConfig,
  redactTarget,
  signWebhookBody,
  signedTargetUrl,
  verifyWebhookSignature,
  webhookUrlError,
} from '../services/webhook.ts';
import { migrateState, SCHEMA_VERSION } from '../store.ts';
import { DEFAULT_WEBHOOK_CONFIG, type WebhookConfig } from '../types.ts';

const SECRET = 'diem-khop-demo-khong-dung-that';

function config(over: Partial<WebhookConfig> = {}): WebhookConfig {
  return { ...DEFAULT_WEBHOOK_CONFIG, include_details: false, ...over };
}

test('generateWebhookSecret cho chuỗi dài và khác nhau mỗi lần', () => {
  const a = generateWebhookSecret();
  assert.ok(a.length >= 32);
  assert.notEqual(a, generateWebhookSecret());
});

test('signWebhookBody khớp với HMAC tính độc lập và không lộ secret', () => {
  const body = JSON.stringify({ event: 'week.published', counts: { published: 10 } });
  const header = signWebhookBody(SECRET, body);
  const expected = `sha256=${crypto.createHmac('sha256', SECRET).update(body, 'utf8').digest('hex')}`;
  assert.equal(header, expected);
  assert.ok(!header.includes(SECRET));
  assert.equal(verifyWebhookSignature(SECRET, body, header), true);
});

test('verifyWebhookSignature từ chối khi body bị sửa hoặc sai khoá', () => {
  const body = '{"a":1}';
  const header = signWebhookBody(SECRET, body);
  assert.equal(verifyWebhookSignature(SECRET, '{"a":2}', header), false);
  assert.equal(verifyWebhookSignature('kho-khac', body, header), false);
  assert.equal(verifyWebhookSignature(SECRET, body, ''), false);
  assert.equal(verifyWebhookSignature(SECRET, body, 'sha256=' + '0'.repeat(64)), false);
});

test('webhookUrlError chặn scheme không phải http/https', () => {
  assert.equal(webhookUrlError(''), 'Chưa nhập URL webhook');
  assert.match(webhookUrlError('khong-phai-url') ?? '', /không hợp lệ/);
  assert.match(webhookUrlError('file:///C:/Windows/win.ini') ?? '', /chấp nhận http hoặc https/);
  assert.match(webhookUrlError('javascript:alert(1)') ?? '', /chấp nhận http hoặc https/);
  assert.match(webhookUrlError('https://user:pass@script.google.com/macros/s/X/exec') ?? '', /không nhúng tài khoản/i);
  assert.equal(webhookUrlError('https://script.google.com/macros/s/AKfycbx/exec'), null);
  assert.equal(webhookUrlError('http://192.168.1.20:5678/webhook/tuyen-giao'), null);
});

test('redactTarget bỏ query string vì nhiều dịch vụ nhúng token ở đó', () => {
  assert.equal(
    redactTarget('https://n8n.example.com:5678/webhook/abc?token=supersecret'),
    'https://n8n.example.com:5678/webhook/abc',
  );
  assert.ok(!redactTarget('https://hook.example.dev/path?api_key=supersecret').includes('supersecret'));
  assert.equal(redactTarget('khong-phai-url'), '');
});

test('payload mặc định redact: không có tên lãnh đạo, địa điểm hay nội dung', () => {
  const ctx = {
    unit_name: 'UBND Phường An Bình',
    week_number: 44,
    year: 2026,
    counts: { published: 3 },
    items: [
      { date: '2026-10-27', start_time: '08:00', title: 'Họp Ban Thường vụ', location: 'Phòng họp A', chair: 'Đ/c Bí thư Nguyễn Văn A' },
    ],
  };
  const json = JSON.stringify(buildWebhookPayload(config({ include_details: false }), 'week.published', ctx));
  assert.equal(json.includes('Nguyễn Văn A'), false);
  assert.equal(json.includes('Phòng họp A'), false);
  assert.equal(json.includes('Họp Ban Thường vụ'), false);
  assert.equal(JSON.parse(json).redacted, true);
  assert.equal(JSON.parse(json).counts.published, 3);
  assert.equal(JSON.parse(json).unit_name, 'UBND Phường An Bình');
});

test('payload khi bật include_details mới gửi đầy đủ mốc lịch', () => {
  const ctx = {
    items: [{ date: '2026-10-27', start_time: '08:00', title: 'Họp Ban Thường vụ', location: 'Phòng họp A', chair: 'Đ/c Bí thư' }],
  };
  const out = buildWebhookPayload(config({ include_details: true }), 'event.moved', ctx) as {
    redacted: boolean;
    items: unknown[];
    event: string;
  };
  assert.equal(out.redacted, false);
  assert.equal(out.items.length, 1);
  assert.equal(out.event, 'event.moved');
});

test('publicWebhookConfig che secret khi không yêu cầu hiện', () => {
  const hidden = publicWebhookConfig(config({ secret: 'abcdefghij', url: 'https://a.test' }), false);
  assert.equal(hidden.secret.includes('abcdefghij'), false);
  assert.equal(hidden.has_secret, true);
  const shown = publicWebhookConfig(config({ secret: 'abcdefghij' }), true);
  assert.equal(shown.secret, 'abcdefghij');
  assert.equal(publicWebhookConfig(config({ secret: '' }), false).has_secret, false);
});

// ---------------------------------------------------------------- schema v5

test('store cũ v4 được nâng lên v5 với users/sessions/webhook trống, dữ liệu lịch giữ nguyên', () => {
  const v4 = {
    schema_version: 4,
    events: [{ id: 'ev1', event_date: '2026-10-27', start_time: '08:00', end_time: '09:30', title: 'Họp Ban Thường vụ' }],
    settings: { unit_name: 'UBND Phường An Bình', travel_buffers: { sameBuilding: 5, sameWard: 15, sameCity: 30, outsideArea: 60 } },
    audit_log: [{ id: 'log1', at: '2026-10-27T01:00:00.000Z', action: 'publish', entity: 'week', entity_id: '2026-10-26', detail: '10 sự kiện' }],
  };
  const s = migrateState(v4);
  assert.equal(s.schema_version, SCHEMA_VERSION);
  assert.equal(s.events.length, 1);
  assert.equal(s.users.length, 0);
  assert.equal(s.sessions.length, 0);
  assert.deepEqual(s.auth, { setup_code: '', setup_code_created_at: null });
  assert.equal(s.webhook_config.enabled, false);
  assert.equal(s.webhook_config.include_details, false);
  // Dòng nhật ký cũ không có actor vẫn giữ được, chỉ thêm trường trống.
  assert.equal(s.audit_log[0].actor, null);
  assert.equal(s.audit_log[0].action, 'publish');
});

test('normalize giữ đúng vai trò hợp lệ và mặc định editor cho giá trị lạ', () => {
  const s = migrateState({
    events: [],
    users: [
      { username: 'Admin', role: 'admin', password_hash: 'x' },
      { username: 'lan', role: 'sieu-nhan', password_hash: 'y' },
      { username: 'view', role: 'viewer', password_hash: 'z' },
    ],
  });
  assert.deepEqual(s.users.map((u) => u.role), ['admin', 'editor', 'viewer']);
  assert.equal(s.users[0].username, 'admin', 'tên đăng nhập luôn được hạ chữ hoa');
  assert.equal(s.users[0].is_active, true);
});

test('webhook_config cũ thiếu trường được điền mặc định và lọc sự kiện lạ', () => {
  const s = migrateState({
    events: [],
    webhook_config: { enabled: true, url: 'https://n8n.local/webhook', events: ['week.published', 'khong-phai-loai', 'event.moved'] },
  });
  assert.equal(s.webhook_config.enabled, true);
  assert.deepEqual(s.webhook_config.events, ['week.published', 'event.moved']);
  assert.equal(s.webhook_config.secret, '');
  assert.equal(s.webhook_config.include_details, false);
});

test('webhook_config hỏng hoàn toàn vẫn trở về mặc định tắt', () => {
  for (const bad of [undefined, null, 'chuỗi', 42, {}]) {
    const s = migrateState({ events: [], webhook_config: bad });
    assert.equal(s.webhook_config.enabled, false, `với giá trị ${JSON.stringify(bad)}`);
    assert.ok(s.webhook_config.events.length > 0);
  }
});

test('signedTargetUrl gửi thêm chữ ký ở query để Apps Script đọc được, vẫn giữ tham số có sẵn', () => {
  assert.equal(
    signedTargetUrl('https://n8n.local/hook', 'sha256=ab'),
    'https://n8n.local/hook?sig=sha256%3Dab',
  );
  const withToken = signedTargetUrl('https://script.google.com/macros/s/X/exec?token=1', 'sha256=cd');
  assert.ok(withToken.startsWith('https://script.google.com/macros/s/X/exec?token=1&sig=sha256%3D'));
  // nhật ký gửi vẫn ẩn toàn bộ query, kể cả sig vừa thêm
  assert.equal(redactTarget(withToken), 'https://script.google.com/macros/s/X/exec');
});
