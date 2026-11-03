import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { EventRecord } from '../types.ts';
import type { SheetTransport } from '../services/sheet_store.ts';

// Kho test nằm ngoài thư mục mã nguồn: không được đụng app_store.json / seed_store.json thật.
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sheet-sync-test-'));
process.env.APP_DATA_DIR = TMP_DIR;
process.env.NODE_ENV = 'test';
delete process.env.FIREBASE_PROJECT_ID;
delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
delete process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON;

const sheet = await import('../services/sheet_store.ts');
const cloud = await import('../services/cloud_store.ts');
const store = await import('../store.ts');
const { DEFAULT_SETTINGS } = await import('../types.ts');

let seq = 0;
function freshSheetCache(): void {
  seq += 1;
  sheet.setSheetBaselineFile(path.join(TMP_DIR, `sync-cache-${seq}.json`));
}

function ev(over: Partial<EventRecord> = {}): EventRecord {
  return {
    id: 'e1', source_id: null, source_document: 'TB-1', source_page: null, source_paragraph: null,
    event_date: '2026-11-02', start_time: '08:00', end_time: '09:30', title: 'Họp giao ban',
    content: '', chair: 'Chủ tịch Nguyễn Văn An', participants: 'Các ngành', participant_group: '',
    location: 'Phòng họp 1', organizer: '', preparation: '', documents_required: '', contact_person: '',
    priority_score: 60, confidence: 0.9, status: 'APPROVED', missing_data_fields: [],
    leaders: [], also_from: [], tasks: [], series_id: null,
    created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-20T00:00:00.000Z',
    ...over,
  } as EventRecord;
}

function syncSettings(over: Record<string, any> = {}): Record<string, any> {
  return {
    enabled: true,
    spreadsheet_id: '1eAm1ed1MyV8IXXfJ8wl4KYq1SpnvOdnQHrpLqon83hw',
    gid: 0,
    write_policy: 'APPROVED_PUBLISHED',
    last_pushed_at: '',
    last_pulled_at: '',
    ...over,
  };
}

function localState(events: EventRecord[], sheetSync: Record<string, any> = syncSettings()): Record<string, any> {
  return {
    schema_version: store.SCHEMA_VERSION,
    events,
    sources: [],
    conflicts: [],
    publications: [],
    users: [{ id: 'u1', username: 'admin', role: 'admin', password_hash: 'scrypt$x', display_name: 'Quản trị' }],
    sessions: [{ id: 'se1', user_id: 'u1', token: 'token-bi-mat', created_at: '2026-11-01T00:00:00.000Z' }],
    audit_log: [],
    settings: { ...DEFAULT_SETTINGS, sheet_sync: sheetSync },
  };
}

function fakeSheet(initial: string[][] = []) {
  let values = initial.map((r) => [...r]);
  let writes = 0;
  const transport: SheetTransport = {
    async resolveTab() { return 'Lịch công tác'; },
    async read() { return values.map((r) => [...r]); },
    async write(_id, _tab, next) { writes += 1; values = next.map((r) => [...r]); },
  };
  return {
    transport,
    rows: () => values.map((r) => [...r]),
    writes: () => writes,
    edit(mutate: (rows: string[][]) => string[][]): void { values = mutate(values.map((r) => [...r])); },
  };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Dựng kịch bản mới hoàn toàn: state + fake sheet + cache mốc riêng. */
function scenario(events: EventRecord[], sheetSync?: Record<string, any>) {
  store.stopCloudWatch();
  store.stopSheetPullPolling();
  freshSheetCache();
  const fake = fakeSheet();
  sheet.setSheetTransport(fake.transport);
  store.replaceState(localState(events, sheetSync));
  return fake;
}

test('persist() chỉ gom một lượt đẩy sheet khi đồng bộ đang bật', async () => {
  const fake = scenario([ev({ id: 'e1' })]);
  store.queueSheetPush(20);
  await wait(250);

  const rows = fake.rows();
  assert.deepEqual(rows[0], [...sheet.SHEET_COLUMNS], 'lần đẩy đầu phải tự ghi dòng tiêu đề');
  assert.deepEqual(rows.slice(1).map((r) => r[0]), ['e1']);
  assert.equal(store.sheetStatus().last_error, '');
  assert.ok(store.sheetStatus().last_push_at, 'phải ghi nhận mốc thời gian vừa đẩy');
  store.stopSheetPullPolling();
});

test('đẩy lên sheet không kéo theo việc đưa lịch vào vòng lặp ghi', async () => {
  const fake = scenario([ev({ id: 'e1' })]);
  await store.flushSheetPush();
  const writes = fake.writes();
  // rememberSheetStamp() gọi persist(): nếu không chặn thì một lần đẩy sẽ tự kích lượt đẩy kế tiếp.
  await wait(300);
  assert.equal(fake.writes(), writes, 'lưu mốc đồng bộ không được kích hoạt thêm một lần ghi sheet');
  store.stopSheetPullPolling();
});

test('kéo sửa đổi trên sheet vào bộ nhớ: đúng mục đổi, không mất mục nào', async () => {
  const events = [ev({ id: 'e1' }), ev({ id: 'e2', title: 'Thẩm định quy hoạch', status: 'PUBLISHED' })];
  const fake = scenario(events);
  await store.flushSheetPush();

  fake.edit((rows) => rows.map((r) => (r[0] !== 'e1' ? r
    : r.map((v, i) => (sheet.SHEET_COLUMNS[i] === 'participants' ? 'Thường trực Đảng ủy' : v)))));

  const report = await store.pullSheetNow();
  assert.equal(report!.ok, true, report!.error);
  assert.deepEqual(report!.updates.map((u) => u.event_id), ['e1']);

  const s = store.getState();
  assert.equal(s.events.length, 2, 'kéo sheet không được làm giảm số mục lịch');
  assert.equal(s.events.find((e) => e.id === 'e1')?.participants, 'Thường trực Đảng ủy');
  assert.equal(s.events.find((e) => e.id === 'e2')?.participants, 'Các ngành', 'mục khác giữ nguyên');
  assert.ok(s.events.find((e) => e.id === 'e1')?.updated_at > events[0].updated_at, 'mục nhận nội dung phải được đóng dấu đã sửa');
  assert.equal(store.sheetStatus().last_conflicts, 0);
  store.stopSheetPullPolling();
});

test('dòng bị xoá trên sheet không xoá sự kiện trong kho', async () => {
  const events = [ev({ id: 'e1' }), ev({ id: 'e2', status: 'PUBLISHED' })];
  const fake = scenario(events);
  await store.flushSheetPush();
  fake.edit((rows) => rows.filter((r) => r[0] !== 'e2'));

  const report = await store.pullSheetNow();
  assert.equal(report!.ok, true, report!.error);
  assert.deepEqual(report!.updates, []);
  assert.equal(store.getState().events.length, 2, 'app không được xoá hộ thao tác xoá dòng trên sheet');
  store.stopSheetPullPolling();
});

test('tắt đồng bộ thì không có yêu cầu nào đi tới sheet', async () => {
  const fake = scenario([ev({ id: 'e1' })], syncSettings({ enabled: false }));
  store.queueSheetPush(20);
  await wait(150);

  assert.equal(fake.writes(), 0, 'chưa bật thì sheet của cơ quan còn nguyên');
  assert.equal(await store.flushSheetPush(), null);
  assert.equal(await store.pullSheetNow(), null);
  assert.equal(store.sheetSyncEnabled(), false);
  assert.match(store.sheetStatus().hint, /đang tắt/);
  store.stopSheetPullPolling();
});

test('khoá service account không có đường nào đi vào store rồi bị nhân bản ra payload cloud', () => {
  scenario([ev({ id: 'e1' })], syncSettings({ enabled: false }));
  const payload = cloud.buildCloudPayload(store.getState() as Record<string, any>);
  assert.equal(JSON.stringify(payload).includes('PRIVATE KEY'), false, 'dù chỉ có id + gid trong store cũng không được chứa nội dung khoá');
  assert.ok(payload.settings.sheet_sync, 'cấu hình sheet (id + gid) là nội dung nghiệp vụ, được phép đi kèm');
  assert.equal(payload.settings.sheet_sync.spreadsheet_id, '1eAm1ed1MyV8IXXfJ8wl4KYq1SpnvOdnQHrpLqon83hw');
  store.stopSheetPullPolling();
});
