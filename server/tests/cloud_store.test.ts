import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { EventRecord } from '../types.ts';
import type { CloudAdapter, RemoteSnapshot } from '../services/cloud_store.ts';

// Kho test phải nằm ngoài thư mục mã nguồn: không được đụng tới app_store.json / seed_store.json thật.
// Hai dòng dưới phải chạy TRƯỚC khi module store/cloud đánh giá, nên mới nạp bằng import() động.
process.env.APP_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-sync-test-'));
process.env.NODE_ENV = 'test';
delete process.env.FIREBASE_PROJECT_ID;
delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

const cloud = await import('../services/cloud_store.ts');
const store = await import('../store.ts');

function ev(over: Partial<EventRecord> = {}): EventRecord {
  return {
    id: 'e1', source_id: null, source_document: '', source_page: null, source_paragraph: null,
    event_date: '2026-11-02', start_time: '08:00', end_time: '09:30',
    title: 'Họp giao ban', content: 'Đánh giá công tác tuần', chair: 'Chủ tịch UBND Nguyễn Văn An',
    participants: 'Các ngành', participant_group: '', location: 'Phòng họp Trụ sở UBND phường',
    organizer: '', preparation: '', documents_required: '', contact_person: '',
    priority_score: 60, confidence: 0.9, status: 'APPROVED', missing_data_fields: [],
    leaders: [], also_from: [], tasks: [], series_id: null,
    created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-20T00:00:00.000Z',
    ...over,
  } as EventRecord;
}

function localState(over: Record<string, any> = {}): Record<string, any> {
  return {
    schema_version: store.SCHEMA_VERSION,
    events: [ev({ id: 'local-1' })],
    users: [{ id: 'u1', username: 'admin', role: 'admin', password_hash: 'scrypt$xxx', display_name: 'Quản trị' }],
    sessions: [{ id: 'se1', user_id: 'u1', token: 'token-bi-mat', created_at: '2026-11-01T00:00:00.000Z' }],
    audit_log: [{ id: 'a1', at: '2026-11-01T00:00:00.000Z', action: 'login', entity: 'user', entity_id: 'u1', detail: '', ip: '10.0.0.5' }],
    settings: { unit_name: 'Đảng ủy Phường Thủ Dầu Một' },
    ...over,
  };
}

/** Bộ giả Firestore giữ document trong RAM để đo đúng hành vi revision. */
function fakeCloud(initial: RemoteSnapshot | null = null) {
  let doc: RemoteSnapshot | null = initial ? structuredClone(initial) : null;
  let conflictBudget = 0;
  const commits: Array<{ base: number; keys: string[] }> = [];
  const listeners = new Set<(snap: RemoteSnapshot | null) => void>();

  const adapter: CloudAdapter = {
    async fetch() {
      return doc ? structuredClone(doc) : null;
    },
    async commit(_docKey, payload, baseRevision) {
      commits.push({ base: baseRevision, keys: Object.keys(payload) });
      const current = doc ? doc.revision : 0;
      if (current !== baseRevision || conflictBudget > 0) {
        if (conflictBudget > 0) conflictBudget -= 1;
        // transaction thật chỉ đọc, không ghi: từ chối là phải giữ nguyên document
        return { ok: false, reason: 'conflict', remote: structuredClone(doc!) };
      }
      doc = {
        revision: current + 1,
        updated_at: new Date().toISOString(),
        payload: structuredClone(payload),
      };
      for (const cb of [...listeners]) cb(structuredClone(doc));
      return { ok: true, revision: doc.revision };
    },
    watch(_docKey, onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
  };

  return {
    adapter,
    doc: () => (doc ? structuredClone(doc) : null),
    commits,
    /** Mô phỏng một instance khác ghi thẳng lên cloud mà máy này chưa kịp thấy qua watch. */
    externalWrite(payload: Record<string, any>, notify = false): void {
      const revision = (doc?.revision ?? 0) + 1;
      doc = { revision, updated_at: new Date().toISOString(), payload };
      if (notify) for (const cb of [...listeners]) cb(structuredClone(doc));
    },
    forceConflicts(n: number): void {
      conflictBudget = n;
    },
  };
}

/** Dựng kịch bản: state local + cloud, không để lượt trước rò sang lượt sau. */
function scenario(initialDoc: RemoteSnapshot | null, local: Record<string, any>) {
  store.stopCloudWatch();
  cloud.setCloudAdapter(null);
  store.replaceState(local);
  const fake = fakeCloud(initialDoc);
  cloud.setCloudAdapter(fake.adapter);
  return fake;
}

// ---------------------------------------------------------------- tách dữ liệu lên cloud

test('buildCloudPayload cắt phiên đăng nhập và nhật ký có IP, giữ toàn bộ nghiệp vụ', () => {
  const state = localState();
  const payload = cloud.buildCloudPayload(state);

  for (const field of cloud.LOCAL_ONLY_FIELDS) {
    assert.ok(!(field in payload), `${field} không được đi lên cloud`);
  }
  assert.equal(payload.events.length, 1, 'lịch phải được đồng bộ');
  assert.equal(payload.settings.unit_name, 'Đảng ủy Phường Thủ Dầu Một');
  assert.equal(payload.users[0].password_hash, 'scrypt$xxx', 'mật khẩu dự phòng phải theo để máy khác đăng nhập được');
  assert.ok(!('sessions' in payload), 'token phiên không được rời khỏi máy');
  assert.equal(state.sessions.length, 1, 'state local vẫn giữ phiên của chính máy này');
});

test('cloudEnabled tắt khi chưa cấu hình project, và bật khi có adapter khác', async () => {
  cloud.setCloudAdapter(null);
  assert.equal(cloud.cloudEnabled(), false, 'chưa có FIREBASE_PROJECT_ID thì chưa đồng bộ');
  assert.deepEqual(await store.bootstrapCloud(), { mode: 'off' }, 'bootstrap không được gọi Firestore khi chưa bật');

  const fake = scenario(null, localState());
  assert.equal(cloud.cloudEnabled(), true);
  const res = await store.bootstrapCloud();
  assert.equal(res.mode, 'seeded');
  assert.ok(fake.doc(), 'có adapter thì dữ liệu được đẩy lên');
});

// ---------------------------------------------------------------- gộp theo id

test('mergeById giữ dòng của cả hai máy, bản mới hơn thắng khi trùng id', () => {
  const local = [
    { id: 'a', title: 'máy này', updated_at: '2026-11-02T09:00:00.000Z' },
    { id: 'b', title: 'cũ ở máy này', updated_at: '2026-11-01T09:00:00.000Z' },
    { id: 'c', title: 'chỉ máy này có' },
  ];
  const remote = [
    { id: 'b', title: 'cloud sửa', updated_at: '2026-11-02T09:00:00.000Z' },
    { id: 'd', title: 'máy khác thêm' },
  ];
  const merged = cloud.mergeById(local, remote);
  const byId = new Map(merged.map((r) => [String(r.id), r]));

  assert.equal(merged.length, 4, 'không được mất id nào');
  assert.equal(byId.get('a')?.title, 'máy này');
  assert.equal(byId.get('b')?.title, 'cloud sửa', 'bằng thời gian thì cloud thắng vì cloud là nguồn chuẩn');
  assert.equal(byId.get('c')?.title, 'chỉ máy này có');
  assert.equal(byId.get('d')?.title, 'máy khác thêm');
});

test('mergeById giữ dòng local mới hơn và dòng chưa có id của cả hai bên', () => {
  const merged = cloud.mergeById(
    [{ id: 'a', updated_at: '2026-11-05T00:00:00.000Z', title: 'local mới' }, { note: 'không id local' }],
    [{ id: 'a', updated_at: '2026-11-02T00:00:00.000Z', title: 'cloud cũ' }, { note: 'không id cloud' }],
  );

  assert.equal(merged.length, 3, 'một dòng trùng id được gộp, còn hai dòng chưa có id phải ở lại cả hai');
  assert.equal(merged.find((r) => r.id === 'a')?.title, 'local mới');
  assert.deepEqual(merged.filter((r) => !r.id).map((r) => r.note), ['không id local', 'không id cloud']);
});

test('mergeById giữ mảng chuỗi như sent_reminders và không nhân đôi khi kéo lại chính dòng vừa đẩy', () => {
  const push = cloud.mergeById(['2026-11-02T07:00:00|e1'], []);
  const pull = cloud.mergeById(push, push);

  assert.deepEqual(push, ['2026-11-02T07:00:00|e1']);
  assert.deepEqual(pull, ['2026-11-02T07:00:00|e1'], 'đẩy lên rồi kéo về không được tạo bản sao thứ hai');

  const haiMay = cloud.mergeById(['hoa-don-a'], ['hoa-don-b']);
  assert.deepEqual(haiMay, ['hoa-don-a', 'hoa-don-b'], 'mỗi máy nhắc một việc thì cả hai phải còn');

  const keyless = cloud.mergeById([{ note: 'không id local' }], [{ note: 'không id cloud' }, { note: 'không id local' }]);
  assert.deepEqual(keyless.map((r) => r.note), ['không id local', 'không id cloud']);
});

test('mergeCloudState gộp mảng theo id, không cho giá trị rỗng của cloud xoá dữ liệu máy này', () => {
  const local = localState({ events: [ev({ id: 'local-1' })], last_digest_date: '2026-11-01' });
  const remotePayload = {
    events: [ev({ id: 'remote-1' })],
    settings: { travel_buffers: { sameWard: 15 } },
    unit_note: '',
    last_digest_date: '2026-11-02',
    sessions: [{ id: 'seX', token: 'token-máy-khác' }],
  };
  const merged = cloud.mergeCloudState(local, remotePayload);

  assert.deepEqual(merged.events.map((e: any) => e.id).sort(), ['local-1', 'remote-1']);
  assert.equal(merged.settings.unit_name, 'Đảng ủy Phường Thủ Dầu Một', 'nội dung local không bị mất khi cloud gửi object thiếu khoá');
  assert.equal(merged.settings.travel_buffers.sameWard, 15);
  assert.equal(merged.unit_note, undefined, 'chuỗi rỗng từ cloud không được tạo khoá rác');
  assert.equal(merged.last_digest_date, '2026-11-02');
  assert.equal(merged.sessions, local.sessions, 'trường local-only phải bị chặn ngay cả khi cloud gửi lên');
});

// ---------------------------------------------------------------- vòng đẩy/kéo thật

test('bootstrapCloud: cloud trống thì đẩy dữ liệu máy này lên để mọi máy thấy chung', async () => {
  const fake = scenario(null, localState());
  const res = await store.bootstrapCloud();

  assert.equal(res.mode, 'seeded');
  const doc = fake.doc()!;
  assert.equal(doc.revision, 1);
  assert.equal(doc.payload.events.length, 1);
  assert.equal(store.cloudStatus().base_revision, 1);
  assert.equal(store.cloudStatus().watching, true, 'phải mở theo dõi để thấy máy khác ghi');
  assert.ok(!('sessions' in doc.payload), 'lần đẩy đầu cũng không được đưa token phiên lên cloud');
  store.stopCloudWatch();
});

test('bootstrapCloud: cloud đã có dữ liệu thì cloud là nguồn chuẩn, phần đang làm dở ở máy này vẫn còn', async () => {
  const remote: RemoteSnapshot = {
    revision: 7,
    updated_at: '2026-11-02T00:00:00.000Z',
    payload: { events: [ev({ id: 'remote-1', title: 'Máy khác đã soạn' })] },
  };
  const fake = scenario(remote, localState());
  const res = await store.bootstrapCloud();

  assert.equal(res.mode, 'pulled');
  assert.equal(res.detail, 'revision 7');
  const ids = store.getState().events.map((e) => e.id).sort();
  assert.deepEqual(ids, ['local-1', 'remote-1'], 'kéo cloud không được xoá lịch chưa lên của máy này');
  assert.equal(store.cloudStatus().base_revision, 7);
  assert.equal(fake.doc()!.revision, 7, 'bootstrap chỉ đọc, không ghi đè cloud');
  store.stopCloudWatch();
});

test('flushCloudPush: máy khác sửa trước thì gộp theo id rồi ghi lại một lần, không mất cả hai', async () => {
  const fake = scenario(null, localState());
  await store.bootstrapCloud();

  // máy B vừa thêm lịch và ghi lên cloud (máy A chưa qua watch thấy)
  fake.externalWrite({ events: [ev({ id: 'remote-1', title: 'Máy B thêm' })] });

  const s = store.getState();
  s.events.push(ev({ id: 'local-2', title: 'Máy A thêm', updated_at: new Date().toISOString() }));
  await store.flushCloudPush();

  const doc = fake.doc()!;
  assert.equal(doc.revision, 3, 'một lần xung đột + một lần ghi lại');
  assert.equal(store.cloudStatus().last_error, '');
  const ids = (doc.payload.events as any[]).map((e) => e.id).sort();
  assert.deepEqual(ids, ['local-1', 'local-2', 'remote-1'], 'nội dung hai máy phải cùng nằm trong một document');
  assert.equal(fake.commits.length, 3, 'một lần đẩy đầu + một lần xung đột + một lần ghi lại');
  assert.deepEqual(fake.commits.map((c) => c.base), [0, 1, 2], 'lần retry bám theo revision vừa đọc của cloud');
  store.stopCloudWatch();
});

test('watch: lịch máy B vừa ban hành tự xuất hiện trong bộ nhớ máy A', async () => {
  const fake = scenario(null, localState());
  await store.bootstrapCloud();

  let thôngBáo = 0;
  const boThongBao = store.onCloudUpdate(() => { thôngBáo += 1; });

  fake.externalWrite({ events: [ev({ id: 'remote-9', title: 'Họp Ban Thường vụ' })] }, true);

  assert.deepEqual(store.getState().events.map((e) => e.id).sort(), ['local-1', 'remote-9']);
  assert.equal(store.cloudStatus().base_revision, 2);
  assert.equal(thôngBáo, 1, 'giao diện cần được báo để vẽ lại');
  boThongBao();
  store.stopCloudWatch();
});

test('xung đột kéo dài: báo lỗi rõ ràng, tuyệt đối không ghi đè im lặng', async () => {
  const fake = scenario(null, localState());
  await store.bootstrapCloud();
  const truoc = fake.doc()!.payload.events.length;
  fake.forceConflicts(2);

  await store.flushCloudPush();

  assert.match(store.cloudStatus().last_error, /Vẫn xung đột sau một lần gộp/);
  assert.equal(fake.doc()!.payload.events.length, truoc, 'cloud chưa bị bản của máy này đè lên');
  fake.forceConflicts(0);
  store.stopCloudWatch();
});

test('tắt đồng bộ thì không còn theo dõi document', async () => {
  const fake = scenario(null, localState());
  await store.bootstrapCloud();
  assert.equal(store.cloudStatus().watching, true);

  store.stopCloudWatch();
  assert.equal(store.cloudStatus().watching, false);

  fake.externalWrite({ events: [ev({ id: 'remote-9' })] }, true);
  assert.deepEqual(store.getState().events.map((e) => e.id), ['local-1'], 'đã ngừng nghe thì không nhận bản mới');
});
