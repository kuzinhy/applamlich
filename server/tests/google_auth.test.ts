import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { googleLoginConfig, verifyGoogleIdToken } from '../services/google_auth.ts';

const CLIENT_ID = '1234567890.apps.googleusercontent.com';

interface FakeGoogle {
  kid: string;
  jwks: unknown;
  sign: (claims: Record<string, unknown>, opts?: { kid?: string; alg?: string }) => string;
}

/** Trình ký giả: phát hành JWT RS256 đúng cấu trúc ID token của Google. */
function makeIssuer(): FakeGoogle {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const kid = crypto.randomBytes(8).toString('hex');
  const jwk = publicKey.export({ format: 'jwk' }) as Record<string, unknown>;
  const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return {
    kid,
    jwks: { keys: [{ ...jwk, kid, use: 'sig', alg: 'RS256' }] },
    sign(claims, opts = {}) {
      const header = { alg: opts.alg ?? 'RS256', typ: 'JWT', kid: opts.kid ?? kid };
      const input = `${b64(header)}.${b64(claims)}`;
      const signature = crypto.sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url');
      return `${input}.${signature}`;
    },
  };
}

function baseClaims(over: Record<string, unknown> = {}): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    sub: '11223344556677889900',
    email: 'chuyengia@example.com',
    email_verified: true,
    name: 'Nguyễn Chuyên Gia',
    picture: 'https://lh3.googleusercontent.com/a/photo',
    iat: now,
    exp: now + 3600,
    ...over,
  };
}

const options = (issuer: FakeGoogle) => ({
  clientId: CLIENT_ID,
  fetchJwks: async () => issuer.jwks,
});

test('ID token Google hợp lệ trả đủ danh tính', async () => {
  const issuer = makeIssuer();
  const result = await verifyGoogleIdToken(issuer.sign(baseClaims()), options(issuer));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.identity.email, 'chuyengia@example.com');
  assert.equal(result.identity.sub, '11223344556677889900');
  assert.equal(result.identity.name, 'Nguyễn Chuyên Gia');
});

test('Email lấy từ token luôn viết thường để tra tài khoản', async () => {
  const issuer = makeIssuer();
  const result = await verifyGoogleIdToken(
    issuer.sign(baseClaims({ email: '  ChuyenGia@Example.COM ' })),
    options(issuer),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.identity.email, 'chuyengia@example.com');
});

test('Chưa cấu hình client ID thì từ chối, không gọi mạng', async () => {
  const issuer = makeIssuer();
  let fetched = false;
  const result = await verifyGoogleIdToken(issuer.sign(baseClaims()), {
    clientId: '',
    fetchJwks: async () => {
      fetched = true;
      return issuer.jwks;
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'GOOGLE_NOT_CONFIGURED');
  assert.equal(fetched, false);
});

test('Chữ ký không thuộc khoá của Google bị chặn', async () => {
  const issuer = makeIssuer();
  const attacker = makeIssuer();
  const forged = attacker.sign(baseClaims(), { kid: issuer.kid });
  const result = await verifyGoogleIdToken(forged, options(issuer));
  assert.equal(result.ok, false);
  assert.equal(result.code, 'BAD_SIGNATURE');
});

test('Token ký bằng thuật toán khác (alg none) bị chặn', async () => {
  const issuer = makeIssuer();
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT', kid: issuer.kid })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(baseClaims())).toString('base64url');
  const result = await verifyGoogleIdToken(`${header}.${payload}.`, options(issuer));
  assert.equal(result.ok, false);
  assert.equal(result.code, 'BAD_TOKEN');
});

test('Đúng chữ ký nhưng sai aud vẫn từ chối', async () => {
  const issuer = makeIssuer();
  const result = await verifyGoogleIdToken(
    issuer.sign(baseClaims({ aud: 'app-khac.apps.googleusercontent.com' })),
    options(issuer),
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, 'BAD_AUDIENCE');
});

test('Nhà cấp phát giả mạo bị chặn', async () => {
  const issuer = makeIssuer();
  const result = await verifyGoogleIdToken(
    issuer.sign(baseClaims({ iss: 'https://accounts.google.com.evil.example' })),
    options(issuer),
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, 'BAD_ISSUER');
});

test('Token hết hạn và token chưa tới hạn dùng đều bị chặn', async () => {
  const issuer = makeIssuer();
  const now = Math.floor(Date.now() / 1000);
  const expired = await verifyGoogleIdToken(
    issuer.sign(baseClaims({ iat: now - 7200, exp: now - 3600 })),
    options(issuer),
  );
  assert.equal(expired.ok, false);
  assert.equal(expired.code, 'TOKEN_EXPIRED');

  const notYetValid = await verifyGoogleIdToken(
    issuer.sign(baseClaims({ iat: now + 3600, exp: now + 7200 })),
    { ...options(issuer), now: now * 1000 },
  );
  assert.equal(notYetValid.ok, false);
  assert.equal(notYetValid.code, 'TOKEN_EXPIRED');
});

test('Còn trong dung sai 60 giây thì chấp nhận', async () => {
  const issuer = makeIssuer();
  const now = Math.floor(Date.now() / 1000);
  const result = await verifyGoogleIdToken(issuer.sign(baseClaims({ exp: now - 30 })), options(issuer));
  assert.equal(result.ok, true);
});

test('Email chưa xác minh hoặc thiếu sub thì không cho vào', async () => {
  const issuer = makeIssuer();
  const unverified = await verifyGoogleIdToken(
    issuer.sign(baseClaims({ email_verified: false })),
    options(issuer),
  );
  assert.equal(unverified.ok, false);
  assert.equal(unverified.code, 'EMAIL_UNVERIFIED');

  const noSub = await verifyGoogleIdToken(issuer.sign(baseClaims({ sub: '' })), options(issuer));
  assert.equal(noSub.ok, false);
  assert.equal(noSub.code, 'BAD_TOKEN');
});

test('Giới hạn miền Google Workspace chặn tài khoản Gmail ngoài cơ quan', async () => {
  const issuer = makeIssuer();
  const blocked = await verifyGoogleIdToken(issuer.sign(baseClaims()), {
    ...options(issuer),
    allowedHostedDomains: ['phuongthudauone.hochiminh.gov.vn'],
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, 'DOMAIN_BLOCKED');

  const inside = await verifyGoogleIdToken(
    issuer.sign(baseClaims({ hd: 'phuongthudauone.hochiminh.gov.vn' })),
    { ...options(issuer), allowedHostedDomains: ['PhuongThuDauOne.hochiminh.gov.vn'] },
  );
  assert.equal(inside.ok, true);
});

test('Chuỗi không phải JWT và máy chủ JWKS lỗi trả mã rõ ràng', async () => {
  const issuer = makeIssuer();
  const bad = await verifyGoogleIdToken('not-a-token', options(issuer));
  assert.equal(bad.ok, false);
  assert.equal(bad.code, 'BAD_TOKEN');

  const offline = await verifyGoogleIdToken(issuer.sign(baseClaims({ sub: 'khac-han' })), {
    clientId: CLIENT_ID,
    fetchJwks: async () => {
      throw new Error('offline');
    },
  });
  assert.equal(offline.ok, false);
  assert.equal(offline.code, 'JWKS_UNAVAILABLE');
});

test('Cấu hình đăng nhập Google đọc từ biến môi trường', () => {
  const saved = {
    id: process.env.GOOGLE_CLIENT_ID,
    domains: process.env.GOOGLE_ALLOWED_DOMAINS,
  };
  try {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_ALLOWED_DOMAINS;
    assert.deepEqual(googleLoginConfig(), { enabled: false, client_id: '', allowed_domains: [] });

    process.env.GOOGLE_CLIENT_ID = ' abc.apps.googleusercontent.com ';
    process.env.GOOGLE_ALLOWED_DOMAINS = 'a.gov.vn, b.gov.vn,,';
    assert.deepEqual(googleLoginConfig(), {
      enabled: true,
      client_id: 'abc.apps.googleusercontent.com',
      allowed_domains: ['a.gov.vn', 'b.gov.vn'],
    });
  } finally {
    if (saved.id === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = saved.id;
    if (saved.domains === undefined) delete process.env.GOOGLE_ALLOWED_DOMAINS;
    else process.env.GOOGLE_ALLOWED_DOMAINS = saved.domains;
  }
});
