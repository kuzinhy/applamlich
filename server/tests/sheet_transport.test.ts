import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { EventRecord } from '../types.ts';

// Lượt này đo ĐƯỜNG DÂY THẬT: ký JWT bằng private_key, xin token, gọi REST v4 bằng fetch.
// Vì không được gửi lên Google thật từ test, ba biến môi trường định hướng dưới đây trỏ toàn bộ
// luồng sang máy chủ Google giả trong quá trình — nhờ vậy khối ký token/encoding A1 vẫn được kiểm chứng.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sheet-transport-test-'));
process.env.APP_DATA_DIR = TMP;
process.env.NODE_ENV = 'test';
delete process.env.FIREBASE_PROJECT_ID;
delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
delete process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON;

const keys = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const SA_EMAIL = 'lich-cong-tac@tdm-calendar.iam.gserviceaccount.com';
const SID = '1eAm1ed1MyV8IXXfJ8wl4KYq1SpnvOdnQHrpLqon83hw';
const ACCESS = 'fake-access-token';
const TAB_CHINH = 'Lịch công tác';
const TAB_PHU = 'Theo dõi riêng';

// Khoá dán vào .env thường xuống dòng thành chuỗi "\n" literal; để nguyên dạng như vậy
// thì vận chuyển vẫn phải ký được — đó là lỗi hay gặp nhất khi cấu hình service account.
const credPath = path.join(TMP, 'service-account.json');
fs.writeFileSync(
  credPath,
  JSON.stringify({
    type: 'service_account',
    project_id: 'tdm-calendar',
    private_key_id: 'key-1',
    private_key: keys.privateKey.replace(/\n/g, '\\n'),
    client_email: SA_EMAIL,
    token_uri: 'https://oauth2.googleapis.com/token',
  }),
  'utf8',
);

type Gui = {
  tokenBodies: string[];
  chuKyDung: boolean;
  claims: any;
  grantType: string;
  tuChoiToken: number;
  goiApi: Array<{ method: string; duongDanTho: string; phamVi: string; authorization: string; noiDung: any }>;
  tuChoi: number;
  tab: Record<string, string[][]>;
};

const gui: Gui = {
  tokenBodies: [], chuKyDung: false, claims: null, grantType: '', tuChoiToken: 0,
  goiApi: [], tuChoi: 0, tab: { [TAB_CHINH]: [], [TAB_PHU]: [] },
};

function resetGui(): void {
  gui.tokenBodies = [];
  gui.chuKyDung = false;
  gui.claims = null;
  gui.grantType = '';
  gui.tuChoiToken = 0;
  gui.goiApi = [];
  gui.tuChoi = 0;
  gui.tab = { [TAB_CHINH]: [], [TAB_PHU]: [] };
}

const mayChu = http.createServer((req, res) => {
  const duongDanTho = req.url || '';
  const [duongDan, truyVan] = duongDanTho.split('?');
  let body = '';
  req.setEncoding('utf8');
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    if (duongDan === '/token') {
      gui.tokenBodies.push(body);
      const thamSo = new URLSearchParams(body);
      gui.grantType = thamSo.get('grant_type') || '';
      const assertion = thamSo.get('assertion') || '';
      const [dau, nguoiDung, chuKy] = assertion.split('.');
      gui.chuKyDung = Boolean(dau) && Boolean(nguoiDung) && Boolean(chuKy)
        && crypto.createVerify('RSA-SHA256').update(`${dau}.${nguoiDung}`).verify(keys.publicKey, Buffer.from(chuKy, 'base64url'));
      gui.claims = gui.chuKyDung ? JSON.parse(Buffer.from(nguoiDung, 'base64url').toString('utf8')) : null;
      if (gui.tuChoiToken) {
        res.writeHead(gui.tuChoiToken, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_grant' }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ access_token: ACCESS, expires_in: 3600, token_type: 'Bearer' }));
      return;
    }

    const khop = /^\/v4\/spreadsheets\/([^/?]+)(\/values\/(.+))?$/.exec(duongDan);
    if (!khop || khop[1] !== SID) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'not found' } }));
      return;
    }
    const phamVi = khop[3] ? decodeURIComponent(khop[3]) : '';
    gui.goiApi.push({
      method: String(req.method || '').toUpperCase(), duongDanTho, phamVi,
      authorization: String(req.headers.authorization || ''),
      noiDung: body ? JSON.parse(body) : null,
    });
    if (gui.tuChoi) {
      res.writeHead(gui.tuChoi, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'The user has no permissions' } }));
      return;
    }
    if (String(req.headers.authorization || '') !== `Bearer ${ACCESS}`) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'missing bearer token' } }));
      return;
    }

    if (!khop[3]) {
      // fields=sheets.properties: app chỉ cần danh sách tab
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        sheets: [
          { properties: { sheetId: 0, title: TAB_CHINH } },
          { properties: { sheetId: 777, title: TAB_PHU } },
          { properties: { sheetId: 999, title: 'Sheet1' } },
        ],
      }));
      return;
    }
    const tenTab = phamVi.split('!')[0].replace(/^'|'$/g, '');
    if (req.method === 'PUT') {
      gui.tab[tenTab] = JSON.parse(body).values;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ spreadsheetId: SID, updatedRange: phamVi, updatedRows: gui.tab[tenTab].length }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ range: phamVi, values: gui.tab[tenTab] || [] }));
  });
});

await new Promise<void>((resolve, reject) => {
  mayChu.once('error', reject);
  mayChu.listen(0, '127.0.0.1', () => resolve());
});
const goc = `http://127.0.0.1:${(mayChu.address() as any).port}`;
process.env.GOOGLE_SHEETS_TOKEN_URL = `${goc}/token`;
process.env.GOOGLE_SHEETS_API_BASE = `${goc}/v4/spreadsheets`;
process.env.GOOGLE_SHEETS_CREDENTIALS = credPath;

const sheet = await import('../services/sheet_store.ts');
sheet.setSheetTransport(null);
sheet.resetSheetCredentialCache();

after(() => {
  mayChu.close();
  sheet.setSheetBaselineFile('');
});

let soTuan = 0;
function freshCache(): void {
  soTuan += 1;
  sheet.setSheetBaselineFile(path.join(TMP, `moc-${soTuan}.json`));
  sheet.resetSheetCredentialCache();
}

function config(over: Record<string, any> = {}): any {
  return {
    enabled: true, spreadsheet_id: SID, gid: 0, write_policy: 'APPROVED_PUBLISHED',
    last_pushed_at: '', last_pulled_at: '', ...over,
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

// ---------------------------------------------------------------- ký JWT và xin token

test('khoá file có "\\n" literal vẫn ký được JWT RS256 và đổi token hợp lệ', async () => {
  resetGui();
  freshCache();

  const report = await sheet.pushEventsToSheet(config(), [ev()]);

  assert.equal(report.ok, true, report.error);
  assert.equal(gui.tokenBodies.length, 1, 'một lượt đồng bộ phải xin token đúng một lần');
  assert.equal(gui.grantType, 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  assert.equal(gui.chuKyDung, true, 'chữ ký RS256 phải thẩm tra được bằng public key của service account');
  assert.equal(gui.claims.iss, SA_EMAIL);
  assert.equal(gui.claims.scope, 'https://www.googleapis.com/auth/spreadsheets');
  assert.equal(gui.claims.aud, `${goc}/token`, 'aud phải đúng endpoint xin token');
  assert.ok(gui.claims.exp - gui.claims.iat >= 3600, 'hạn token không được dài hơn một giờ');
  assert.ok(!gui.tokenBodies[0].includes('PRIVATE KEY'), 'private_key tuyệt đối không được đi trong yêu cầu');
});

test('token được cache nên hai lần đẩy chỉ xin một lần', async () => {
  resetGui();
  freshCache();
  const mot = ev({ id: 'e1' });
  const hai = ev({ id: 'e2', title: 'Tiếp công dân' });

  assert.equal((await sheet.pushEventsToSheet(config(), [mot])).ok, true);
  assert.equal((await sheet.pushEventsToSheet(config(), [mot, hai])).ok, true);

  assert.equal(gui.tokenBodies.length, 1, 'token còn hạn thì phải dùng lại');
  assert.equal(gui.goiApi.length, 6, 'mỗi lượt đẩy là ba calls: đọc cấu trúc tab, đọc vùng A1, ghi một khối');
});

test('Google từ chối cấp token thì báo rõ không xin được token, không ném', async () => {
  resetGui();
  freshCache();
  gui.tuChoiToken = 400;

  const report = await sheet.pushEventsToSheet(config(), [ev()]);

  assert.equal(report.ok, false);
  assert.match(report.error, /Xin token Google Sheet thất bại \(HTTP 400\)/);
});

// ---------------------------------------------------------------- A1 notation

test('tên tab tiếng Việt có dấu cách được bọc nháy đơn trong phạm vi A1', async () => {
  resetGui();
  freshCache();

  const report = await sheet.pushEventsToSheet(config(), [ev()]);
  assert.equal(report.ok, true, report.error);
  assert.equal(report.tab, TAB_CHINH);

  const docGhi = gui.goiApi.find((g) => g.method === 'PUT')!;
  assert.equal(docGhi.phamVi, `'${TAB_CHINH}'!A1`);
  assert.equal(docGhi.noiDung.range, `'${TAB_CHINH}'!A1`, 'thân PUT cũng phải mang phạm vi đã bọc nháy');
  // Dấu nháy đơn là ký tự hợp lệ trong đường dẫn nên để nguyên (giống client chính thức của Google),
  // còn dấu cách và tiếng Việt bắt buộc phải escape, nếu không URL hỏng.
  assert.ok(!/[^\x20-\x7E]/.test(docGhi.duongDanTho), 'URL gửi đi không được còn ký tự ngoài ASCII');
  assert.ok(docGhi.duongDanTho.includes('%20'), 'dấu cách trong tên tab phải thành %20');
  assert.ok(!docGhi.duongDanTho.includes(' '), 'URL không được còn dấu cách trần');

  const docDoc = gui.goiApi.find((g) => g.method === 'GET' && g.phamVi.includes('!'))!;
  assert.equal(docDoc.phamVi, `'${TAB_CHINH}'!A1:ZZ`);
});

test('gid chọn đúng tab trong cùng một file sheet', async () => {
  resetGui();
  freshCache();

  const report = await sheet.pushEventsToSheet(config({ gid: 777 }), [ev()]);

  assert.equal(report.ok, true, report.error);
  assert.equal(report.tab, TAB_PHU);
  assert.ok(gui.goiApi.some((g) => g.phamVi === `'${TAB_PHU}'!A1`));
  assert.deepEqual(gui.tab[TAB_CHINH], [], 'tab phụ không được nhận dữ liệu của tab chính');
});

test('tab tên ASCII thuần thì không bị bọc nháy thừa', async () => {
  resetGui();
  freshCache();

  const report = await sheet.pushEventsToSheet(config({ gid: 999 }), [ev()]);

  assert.equal(report.ok, true, report.error);
  assert.equal(gui.goiApi.find((g) => g.method === 'PUT')!.phamVi, 'Sheet1!A1');
});

test('nội dung ghi theo đúng cột, giá trị tiếng Việt đi nguyên qua HTTP', async () => {
  resetGui();
  freshCache();

  await sheet.pushEventsToSheet(config(), [ev()]);
  const dongGhi = gui.tab[TAB_CHINH];

  assert.deepEqual(dongGhi[0], [...sheet.SHEET_COLUMNS]);
  assert.equal(dongGhi[1][4], 'Họp giao ban');
  assert.equal(dongGhi[1][6], 'Chủ tịch Nguyễn Văn An');
  assert.equal(dongGhi[1][9], 'Văn phòng chuẩn bị phòng');
  assert.equal(dongGhi[1][11], 'APPROVED');
});

// ---------------------------------------------------------------- hai chiều qua đường dây

test('cán bộ sửa trên sheet thật thì lượt kéo đọc qua REST và trả bản sửa', async () => {
  resetGui();
  freshCache();
  const local = ev();
  await sheet.pushEventsToSheet(config(), [local]);

  // cán bộ đổi người chủ trì ngay trên sheet
  gui.tab[TAB_CHINH][1][6] = 'Phó Chủ tịch Trần Thị Hòa';

  const report = await sheet.pullEventsFromSheet(config(), [local]);

  assert.equal(report.ok, true, report.error);
  assert.deepEqual(report.updates.map((u) => u.changed), [['chair']]);
  const { events, applied } = sheet.applyPullUpdates([local], report.updates);
  assert.equal(applied, 1);
  assert.equal(events[0].chair, 'Phó Chủ tịch Trần Thị Hòa');
});

// ---------------------------------------------------------------- lỗi quyền truy cập

test('403 vì chưa chia sẻ sheet cho service account: báo câu chữ "Editor", không ném', async () => {
  resetGui();
  freshCache();
  gui.tuChoi = 403;

  const report = await sheet.pushEventsToSheet(config(), [ev()]);

  assert.equal(report.ok, false);
  assert.match(report.error, /HTTP 403/);
  assert.match(report.error, /chia sẻ sheet cho email service account với quyền "Editor"/);
});

test('404 vì dán sai đường dẫn: báo kiểm tra lại đường dẫn', async () => {
  resetGui();
  freshCache();
  gui.tuChoi = 404;

  const report = await sheet.pullEventsFromSheet(config(), [ev()]);

  assert.equal(report.ok, false);
  assert.match(report.error, /Không tìm thấy sheet/);
});

// ---------------------------------------------------------------- không rò khoá

test('trạng thái khoá chỉ lộ email và nguồn, không lộ private_key', () => {
  const trangThai = sheet.sheetCredentialStatus();

  assert.equal(trangThai.available, true);
  assert.equal(trangThai.client_email, SA_EMAIL);
  assert.equal(trangThai.source, credPath);
  assert.ok(!JSON.stringify(trangThai).includes('PRIVATE KEY'));
});
