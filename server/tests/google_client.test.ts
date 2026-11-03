import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestAccessToken } from '../../src/services/google.js';

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
