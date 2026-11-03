import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { EventRecord } from '../types.ts';
import type { SheetTransport } from '../services/sheet_store.ts';

// Cache dòng nằm trong APP_DATA_DIR: phải trỏ ra ngoài thư mục mã nguồn để không đụng dữ liệu thật.
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sheet-store-test-'));
process.env.APP_DATA_DIR = TMP_DIR;
process.env.NODE_ENV = 'test';
delete process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON;
delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
delete process.env.GOOGLE_SHEETS_CREDENTIALS;

const sheet = await import('../services/sheet_store.ts');

let cacheSeq = 0;
/** Mỗi lượt một file mốc riêng, không cho kết quả lượt trước rò sang lượt sau. */
function freshCache(): void {
  cacheSeq += 1;
  sheet.setSheetBaselineFile(path.join(TMP_DIR, `cache-${cacheSeq}.json`));
}

function config(over: Record<string, any> = {}): any {
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

function ev(over: Partial<EventRecord> = {}): EventRecord {
  return {
    id: 'e1', source_id: null, source_document: 'TB-12', source_page: null, source_paragraph: null,
    event_date: '2026-11-02', start_time: '08:00', end_time: '09:30',
    title: 'Họp giao ban', content: 'Đánh giá công tác tuần', chair: 'Chủ tịch Nguyễn Văn An',
    participants: 'Các ngành', participant_group: '', location: 'Phòng họp 1',
    organizer: '', preparation: 'Văn phòng chuẩn bị phòng', documents_required: '', contact_person: '',
    priority_score: 60, confidence: 0.9, status: 'APPROVED', missing_data_fields: [],
    leaders: [], also_from: [], tasks: [], series_id: null,
    created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-20T00:00:00.000Z',
    ...over,
  } as EventRecord;
}

/** Sheet giả trong RAM: đúng ba thao tác mà Google Sheets API cung cấp cho module này. */
function fakeSheet(initial: string[][] = [], tabs: Array<{ sheetId: number; title: string }> = [{ sheetId: 0, title: 'Lịch công tác' }]) {
  let values = initial.map((r) => [...r]);
  let writes = 0;
  const transport: SheetTransport = {
    async resolveTab(_id, gid) {
      const hit = tabs.find((t) => t.sheetId === Number(gid)) || tabs[0];
      return hit ? hit.title : '';
    },
    async read() {
      return values.map((r) => [...r]);
    },
    async write(_id, _tab, next) {
      writes += 1;
      values = next.map((r) => [...r]);
    },
  };
  return {
    transport,
    rows: () => values.map((r) => [...r]),
    writes: () => writes,
    /** Mô phỏng cán bộ sửa/xoá ngay trên sheet mà app chưa biết. */
    edit(mutate: (rows: string[][]) => string[][]): void {
      values = mutate(values.map((r) => [...r]));
    },
  };
}

function useFake(fake: ReturnType<typeof fakeSheet>): void {
  sheet.setSheetTransport(fake.transport);
}

// ---------------------------------------------------------------- nhận dạng đường dẫn & khoá

test('parseSheetUrl lấy đúng spreadsheet id và gid từ hai kiểu link, bác link thư mục Drive', () => {
  const url = 'https://docs.google.com/spreadsheets/d/1eAm1ed1MyV8IXXfJ8wl4KYq1SpnvOdnQHrpLqon83hw/edit?gid=123456#gid=123456';
  assert.deepEqual(sheet.parseSheetUrl(url), {
    spreadsheet_id: '1eAm1ed1MyV8IXXfJ8wl4KYq1SpnvOdnQHrpLqon83hw',
    gid: 123456,
  });
  assert.equal(sheet.parseSheetUrl('https://docs.google.com/spreadsheets/d/1eAm1ed1MyV8IXXfJ8wl4KYq1SpnvOdnQHrpLqon83hw/edit').gid, 0);
  assert.equal(sheet.parseSheetUrl('https://drive.google.com/drive/folders/1C7iaZI9vATK64FwXMLN3f9S4x_NonE5v'), null);
  assert.equal(sheet.parseSheetUrl(''), null);
});

test('khoá service account chỉ đọc từ môi trường và không bao giờ lộ private key ra trạng thái', () => {
  sheet.resetSheetCredentialCache();
  assert.deepEqual(sheet.sheetCredentialStatus(), { available: false, client_email: '', source: '' });
  assert.equal(sheet.sheetCredential(), null, 'chưa có khoá thì phải trả null, không được ném');

  process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON = JSON.stringify({
    client_email: 'sheet-sync@appp.iam.gserviceaccount.com',
    // Khoá dán vào .env bị xuống dòng thành chuỗi "\n" literal — module phải quy về lại.
    private_key: '-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----\\n',
  });
  sheet.resetSheetCredentialCache();
  const status = sheet.sheetCredentialStatus();
  assert.equal(status.available, true);
  assert.equal(status.client_email, 'sheet-sync@appp.iam.gserviceaccount.com');
  assert.ok(!JSON.stringify(status).includes('PRIVATE KEY'), 'trạng thái không được chứa nội dung khoá');
  assert.ok(String(sheet.sheetCredential()?.private_key).includes('\n'), 'dấu xuống dòng phải được khôi phục');

  delete process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON;
  sheet.resetSheetCredentialCache();
  assert.equal(sheet.sheetCredentialStatus().available, false);
});

test('sheetSyncHint nói rõ đang thiếu gì, không báo thành công giả', () => {
  sheet.resetSheetCredentialCache();
  assert.match(sheet.sheetSyncHint(config({ spreadsheet_id: '' })), /Chưa dán đường dẫn/);
  assert.match(sheet.sheetSyncHint(config()), /chưa thấy khoá service account/);
  assert.match(sheet.sheetSyncHint(config({ enabled: false })), /đang tắt/);
});

// ---------------------------------------------------------------- chuyển đổi dòng

test('eventToRow theo đúng thứ tự cột đã công bố', () => {
  const row = sheet.eventToRow(ev());
  assert.equal(row.length, sheet.SHEET_COLUMNS.length);
  assert.deepEqual(row.slice(0, 5), ['e1', '2026-11-02', '08:00', '09:30', 'Họp giao ban']);
  assert.equal(row[sheet.SHEET_COLUMNS.indexOf('status')], 'APPROVED');
});

test('rowToEventPatch bỏ qua ô trống, không nhận status lạ và không biến số thành chữ', () => {
  const index = new Map(sheet.SHEET_COLUMNS.map((name, i) => [name, i]));
  const row = sheet.eventToRow(ev()).map((v, i) => (i === 4 || i === 8 ? '' : v));
  row[index.get('status')!] = 'KO_BIT_DAU_NAY';
  const patch = sheet.rowToEventPatch(row, index) as Record<string, any>;
  assert.equal(patch.title, undefined, 'ô trống không được xoá tiêu đề trong app');
  assert.equal(patch.location, undefined);
  assert.equal(patch.status, undefined, 'giá trị status lạ phải bị chặn, không ghi bừa vào lịch');
  assert.equal(patch.priority_score, 60);
  assert.equal(typeof patch.priority_score, 'number');
});

test('chính sách đẩy chỉ nhận mục đã duyệt và đã ban hành', () => {
  const events = [ev({ id: 'a', status: 'DRAFT' }), ev({ id: 'b', status: 'PROPOSED' }), ev({ id: 'c', status: 'APPROVED' }), ev({ id: 'd', status: 'PUBLISHED' }), ev({ id: 'e', status: 'REJECTED' })];
  assert.deepEqual(sheet.selectSyncEvents(events, 'APPROVED_PUBLISHED').map((e) => e.id), ['c', 'd']);
  assert.deepEqual(sheet.selectSyncEvents(events, 'ALL').map((e) => e.id), ['a', 'b', 'c', 'd'], 'mục bị từ chối không bao giờ lên sheet');
});

// ---------------------------------------------------------------- ĐẨY

test('push lần đầu: tự ghi dòng tiêu đề và chỉ đưa mục đã duyệt/ban hành lên sheet', async () => {
  freshCache();
  const fake = fakeSheet();
  useFake(fake);
  const report = await sheet.pushEventsToSheet(config(), [
    ev({ id: 'e1', status: 'APPROVED' }),
    ev({ id: 'e2', status: 'PUBLISHED', title: 'Chào cờ đầu tháng' }),
    ev({ id: 'e3', status: 'DRAFT' }),
    ev({ id: 'e4', status: 'REJECTED' }),
  ]);

  assert.equal(report.ok, true, report.error);
  const rows = fake.rows();
  assert.deepEqual(rows[0], [...sheet.SHEET_COLUMNS]);
  assert.equal(rows.length, 3, 'hai mục được duyệt + đã ban hành, hai mục khác không lên sheet');
  assert.deepEqual(rows.slice(1).map((r) => r[0]), ['e1', 'e2']);
  assert.equal(report.written, 2);
});

test('push lặp lại không nhân đôi dòng và lần hai gần như không phải ghi gì', async () => {
  freshCache();
  const fake = fakeSheet();
  useFake(fake);
  const events = [ev({ id: 'e1' }), ev({ id: 'e2', status: 'PUBLISHED' })];
  await sheet.pushEventsToSheet(config(), events);
  const first = fake.writes();
  const second = await sheet.pushEventsToSheet(config(), events);

  assert.equal(second.ok, true, second.error);
  assert.equal(second.written, 0, 'nội dung không đổi thì không được tính là đã ghi');
  assert.equal(fake.rows().length, 3, 'đẩy hai lần vẫn phải là hai dòng lịch');
  assert.equal(fake.writes(), first + 1);
});

test('push giữ nguyên dòng do người khác ghi và dòng của mục đã bị từ chối', async () => {
  freshCache();
  const fake = fakeSheet();
  useFake(fake);
  await sheet.pushEventsToSheet(config(), [ev({ id: 'e1' })]);
  // Dòng của e9 đã nằm trên sheet từ trước (ví dụ mục từng ban hành rồi mới bị từ chối).
  fake.edit((rows) => [
    rows[0],
    ['GHI TAY', '', '', '', 'Khảo sát cơ sở', '', '', '', '', '', '', '', '', ''],
    ...rows.slice(1),
    sheet.eventToRow(ev({ id: 'e9', status: 'REJECTED' })),
  ]);

  const report = await sheet.pushEventsToSheet(config(), [ev({ id: 'e1' })]);
  const rows = fake.rows();
  assert.equal(report.ok, true, report.error);
  assert.equal(rows[1][0], 'GHI TAY', 'app không được xoá nội dung người khác viết trong vùng sheet chung');
  assert.ok(rows.some((r) => r[0] === 'e9'), 'dòng đã lên sheet của mục bị từ chối vẫn phải còn để tra lại');
});

test('xoá dòng trên sheet không làm mất lịch trong app; lần đẩy sau dựng lại dòng', async () => {
  freshCache();
  const fake = fakeSheet();
  useFake(fake);
  const events = [ev({ id: 'e1' }), ev({ id: 'e2', status: 'PUBLISHED' })];
  await sheet.pushEventsToSheet(config(), events);

  fake.edit((rows) => rows.filter((r) => r[0] !== 'e2'));
  const pulled = await sheet.pullEventsFromSheet(config(), events);
  assert.equal(pulled.ok, true, pulled.error);
  assert.deepEqual(pulled.updates, [], 'dòng bị xoá không được sinh ra lệnh xoá sự kiện');
  assert.equal(events.length, 2, 'app vẫn giữ đủ hai mục');

  const pushed = await sheet.pushEventsToSheet(config(), events);
  assert.equal(pushed.ok, true, pushed.error);
  assert.ok(fake.rows().some((r) => r[0] === 'e2'), 'mục đã ban hành phải trở lại lịch chung');
});

// ---------------------------------------------------------------- KÉO

test('pull: cán bộ sửa trên sheet thì lịch trong app nhận đúng các trường thay đổi', async () => {
  freshCache();
  const fake = fakeSheet();
  useFake(fake);
  const events = [ev({ id: 'e1' }), ev({ id: 'e2', status: 'PUBLISHED' })];
  await sheet.pushEventsToSheet(config(), events);

  fake.edit((rows) => rows.map((r) => (r[0] !== 'e1' ? r
    : r.map((v, i) => (sheet.SHEET_COLUMNS[i] === 'location' ? 'Hội trường Ban Xây dựng Đảng' : v)))));

  const pulled = await sheet.pullEventsFromSheet(config(), events);
  assert.equal(pulled.ok, true, pulled.error);
  assert.deepEqual(pulled.updates.map((u) => u.event_id), ['e1']);
  assert.deepEqual(pulled.updates[0].changed, ['location']);

  const merged = sheet.applyPullUpdates(events, pulled.updates);
  assert.equal(merged.applied, 1);
  assert.equal(events.find((e) => e.id === 'e1')?.location, 'Phòng họp 1', 'mảng gốc phải còn nguyên, không sửa tại chỗ');
  assert.equal(merged.events.find((e) => e.id === 'e1')?.location, 'Hội trường Ban Xây dựng Đảng');
  assert.equal(merged.events.length, 2, 'kéo sheet không được làm mất mục khác');
  assert.equal(merged.events.find((e) => e.id === 'e2'), events.find((e) => e.id === 'e2'), 'mục không liên quan phải được giữ nguyên bản');
});

test('pull sau khi áp xong không còn báo cùng một sửa đổi hai lần', async () => {
  freshCache();
  const fake = fakeSheet();
  useFake(fake);
  const events = [ev({ id: 'e1' })];
  await sheet.pushEventsToSheet(config(), events);
  fake.edit((rows) => rows.map((r) => (r[0] !== 'e1' ? r
    : r.map((v, i) => (sheet.SHEET_COLUMNS[i] === 'chair' ? 'Phó Bí thư Trần Thị Bình' : v)))));

  const first = await sheet.pullEventsFromSheet(config(), events);
  assert.equal(first.updates.length, 1);
  const second = await sheet.pullEventsFromSheet(config(), events);
  assert.deepEqual(second.updates, [], 'dòng vừa áp phải được ghi nhận là đã biết, không báo lặp');
});

test('pull: dòng lạ và dòng chưa từng đẩy chỉ được đếm, không tự dựng sự kiện mới', async () => {
  freshCache();
  const fake = fakeSheet([
    [...sheet.SHEET_COLUMNS],
    ['e1', '2026-11-02', '08:00', '09:30', 'Do app đẩy lên', '', '', '', '', '', '', '60', 'APPROVED', '', ''],
    ['xyz', '2026-11-05', '', 'Viết tay trên sheet', '', '', '', '', '', '', '', 'APPROVED', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
  ]);
  useFake(fake);
  const events = [ev({ id: 'e1' }), ev({ id: 'e2', title: 'Mục chưa lên sheet' })];
  const pulled = await sheet.pullEventsFromSheet(config(), events);

  assert.equal(pulled.ok, true, pulled.error);
  assert.deepEqual(pulled.updates, [], 'chưa có mốc thì không có căn cứ biết bên nào sửa: tuyệt đối không đè lịch trong app');
  assert.equal(pulled.foreign_rows, 1);
  assert.equal(pulled.blank_rows, 1);
});

// ---------------------------------------------------------------- xung đột hai chiều

test('hai bên cùng sửa một dòng: sheet bị đóng băng, báo về cho cán bộ quyết, không bên nào đè', async () => {
  freshCache();
  const fake = fakeSheet();
  useFake(fake);
  const before = [ev({ id: 'e1' })];
  await sheet.pushEventsToSheet(config(), before);

  fake.edit((rows) => rows.map((r) => (r[0] !== 'e1' ? r
    : r.map((v, i) => (sheet.SHEET_COLUMNS[i] === 'title' ? 'Họp giao ban (sheet sửa)' : v)))));
  const after = [ev({ id: 'e1', title: 'Họp giao ban (app sửa)' })];

  const report = await sheet.pushEventsToSheet(config(), after);
  assert.equal(report.ok, true, report.error);
  assert.equal(report.conflicts.length, 1);
  assert.equal(report.conflicts[0].event_id, 'e1');
  assert.equal(fake.rows()[1][sheet.SHEET_COLUMNS.indexOf('title')], 'Họp giao ban (sheet sửa)', 'nội dung cán bộ gõ trên sheet chưa được quyền xóa đi');

  const again = await sheet.pushEventsToSheet(config(), after);
  assert.equal(again.conflicts.length, 1, 'xung đột còn nguyên cho tới khi người dùng quyết, không im lặng tự hết');
});

test('push force: cán bộ chọn app thắng thì dòng trên sheet được ghi lại', async () => {
  freshCache();
  const fake = fakeSheet();
  useFake(fake);
  await sheet.pushEventsToSheet(config(), [ev({ id: 'e1' })]);
  fake.edit((rows) => rows.map((r) => (r[0] !== 'e1' ? r
    : r.map((v, i) => (sheet.SHEET_COLUMNS[i] === 'title' ? 'Bản sheet' : v)))));

  const report = await sheet.pushEventsToSheet(config(), [ev({ id: 'e1', title: 'Bản app' })], { force: true });
  assert.equal(report.conflicts.length, 0);
  assert.equal(fake.rows()[1][sheet.SHEET_COLUMNS.indexOf('title')], 'Bản app');
});

// ---------------------------------------------------------------- an toàn cấu hình

test('sheet có dòng tiêu đề khác cột của app: báo lỗi rõ và không ghi đè lên bảng của người khác', async () => {
  freshCache();
  const fake = fakeSheet([['Ngày', 'Nội dung', 'Người chủ trì'], ['02/11', 'Họp', 'Chủ tịch']]);
  useFake(fake);
  const report = await sheet.pushEventsToSheet(config(), [ev({ id: 'e1' })]);

  assert.equal(report.ok, false);
  assert.equal(report.foreign_header, true);
  assert.match(report.error, /tab trắng/);
  assert.equal(fake.writes(), 0, 'chưa hiểu cột thì cấm ghi');
});

test('gid chọn đúng tab trong file nhiều tab', async () => {
  freshCache();
  const fake = fakeSheet([], [{ sheetId: 0, title: 'Lịch tuần' }, { sheetId: 77, title: 'Nguồn văn bản' }]);
  useFake(fake);
  const report = await sheet.pushEventsToSheet(config({ gid: 77 }), [ev({ id: 'e1' })]);
  assert.equal(report.ok, true, report.error);
  assert.equal(report.tab, 'Nguồn văn bản');
  assert.equal(fake.rows()[1][0], 'e1');
});
