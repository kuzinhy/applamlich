import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestAccessToken } from '../../src/services/google.js';
import * as google from '../../src/services/google.js';

const writableFolder = {
  id: 'folder-123',
  name: 'ICTCLich',
  mimeType: 'application/vnd.google-apps.folder',
  trashed: false,
  capabilities: { canAddChildren: true },
};

test('Drive folder lookup reads the exact ID and returns Google metadata', async (t) => {
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://www.googleapis.com');
    assert.equal(url.pathname, '/drive/v3/files/folder-123');
    assert.equal(url.searchParams.get('supportsAllDrives'), 'true');
    assert.match(url.searchParams.get('fields') || '', /mimeType/);
    assert.match(url.searchParams.get('fields') || '', /canAddChildren/);
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-token');
    return Response.json(writableFolder);
  });
  assert.deepEqual(await google.getWorkFolder('test-token', 'folder-123'), writableFolder);
});

for (const status of [401, 403, 404]) {
  test(`Drive folder lookup rejects HTTP ${status} instead of inventing a folder`, async (t) => {
    t.mock.method(globalThis, 'fetch', async () => Response.json({ error: { message: 'Google denied access' } }, { status }));
    await assert.rejects(google.getWorkFolder('test-token', 'folder-123'), /cấp quyền|truy cập/i);
  });
}

for (const [label, fields, error] of [
  ['a regular file', { mimeType: 'application/pdf' }, /không phải thư mục/],
  ['a trashed folder', { trashed: true }, /thùng rác/],
  ['a read-only folder', { capabilities: { canAddChildren: false } }, /ghi/],
  ['missing write capability', { capabilities: {} }, /ghi/],
] as const) {
  test(`Drive folder lookup rejects ${label}`, async (t) => {
    t.mock.method(globalThis, 'fetch', async () => Response.json({ ...writableFolder, ...fields }));
    await assert.rejects(google.getWorkFolder('test-token', 'folder-123'), error);
  });
}

test('Google Drive popup errors and success settle without leaving timers', async () => {
  const originalWindow = (globalThis as any).window;
  let options: any;
  let pending = 0;
  let reply: (options: any) => void;
  (globalThis as any).window = {
    google: { accounts: { id: {}, oauth2: {
      initTokenClient(config: any) {
        options = config;
        return { requestAccessToken() { reply(options); } };
      },
    } } },
    setTimeout() { pending += 1; return 1; },
    clearTimeout() { pending -= 1; },
  };
  try {
    reply = (config) => config.error_callback({ type: 'popup_closed' });
    await assert.rejects(requestAccessToken('test-client'), /đóng cửa sổ/);
    assert.equal(pending, 0);
    reply = (config) => config.callback({ error: 'access_denied' });
    await assert.rejects(requestAccessToken('test-client'), /access_denied/);
    assert.equal(pending, 0);
    reply = (config) => config.callback({ access_token: 'test-token', expires_in: 120 });
    assert.deepEqual(await requestAccessToken('test-client'), { access_token: 'test-token', expires_in: 120 });
    assert.equal(pending, 0);
    reply = () => { throw new Error('popup unavailable'); };
    await assert.rejects(requestAccessToken('test-client'), /popup unavailable/);
    assert.equal(pending, 0);
  } finally {
    if (originalWindow === undefined) delete (globalThis as any).window;
    else (globalThis as any).window = originalWindow;
  }
});
