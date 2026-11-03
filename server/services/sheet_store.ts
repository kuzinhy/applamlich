/**
 * Kho chung Google Sheet: mỗi mục lịch được chọn là MỘT dòng trong một tab.
 * Sheet thay vai trò "nơi cả cơ quan cùng nhìn" của thư mục Drive; Drive vẫn chỉ là
 * chỗ chứa văn bản nguồn, không còn là kho dữ liệu của app.
 *
 * Ba nguyên tắc sống còn (theo yêu cầu "không được làm mất dữ liệu"):
 * 1) Khoá service account CHỈ đọc từ biến môi trường/tệp, không bao giờ nằm trong store,
 *    vì store được nhân bản ra data/seed_store.json đang công khai trên Git.
 * 2) Dòng bị xoá tay trên sheet KHÔNG xoá sự kiện trong app; app không bao giờ xoá hộ.
 * 3) Cùng một dòng bị sửa ở cả hai bên thì đóng băng cả hai và báo lại cho cán bộ quyết,
 *    không bên nào đè im lặng lên bên nào.
 *
 * Module này cố ý không import store.ts (tránh phụ thuộc vòng): nó chỉ nhận mảng sự kiện
 * thuần và trả báo cáo, store.ts quyết định lúc nào đẩy/kéo.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import type { EventRecord } from '../types.ts';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

/**
 * Hai đường override CHỈ dành cho kiểm thử: test dựng máy chủ giả Google để đo thật định dạng
 * JWT + lời gọi REST. Để trống thì luôn là endpoint thật của Google — không có nhánh nào khác.
 */
function tokenUrl(): string {
  return String(process.env.GOOGLE_SHEETS_TOKEN_URL || '').trim() || TOKEN_URL;
}

function sheetsApiBase(): string {
  return String(process.env.GOOGLE_SHEETS_API_BASE || '').trim().replace(/\/+$/, '') || SHEETS_API;
}
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

/** Tiêu đề các cột do app sinh ra. Thứ tự này là hợp đồng với người sửa trên sheet. */
export const SHEET_COLUMNS = [
  'event_id', 'event_date', 'start_time', 'end_time', 'title', 'content',
  'chair', 'participants', 'location', 'preparation', 'priority_score',
  'status', 'source_document', 'updated_at',
] as const;

/** Những cột cán bộ sửa từ sheet và đi ngược lại được vào app. */
const PULL_FIELDS = [
  'event_date', 'start_time', 'end_time', 'title', 'content', 'chair',
  'participants', 'location', 'preparation', 'priority_score', 'status',
] as const;

const EVENT_STATUSES = ['DRAFT', 'PROPOSED', 'APPROVED', 'PUBLISHED', 'REJECTED'];

export interface SheetSyncSettings {
  enabled: boolean;
  spreadsheet_id: string;
  /** sheetId trong URL (#gid=...). 0 là tab đầu tiên. */
  gid: number;
  /** APPROVED_PUBLISHED = chỉ mục đã duyệt và đã ban hành (mặc định); ALL = mọi mục chưa bị từ chối. */
  write_policy: 'APPROVED_PUBLISHED' | 'ALL';
  last_pushed_at: string;
  last_pulled_at: string;
}

export const DEFAULT_SHEET_SYNC_SETTINGS: SheetSyncSettings = {
  enabled: false,
  spreadsheet_id: '',
  gid: 0,
  write_policy: 'APPROVED_PUBLISHED',
  last_pushed_at: '',
  last_pulled_at: '',
};

export function normalizeSheetSync(raw: any): SheetSyncSettings {
  const id = String(raw?.spreadsheet_id || '').trim();
  const gid = Number(raw?.gid);
  return {
    enabled: Boolean(raw?.enabled) && Boolean(id),
    spreadsheet_id: id,
    gid: Number.isFinite(gid) ? Math.trunc(gid) : 0,
    write_policy: raw?.write_policy === 'ALL' ? 'ALL' : 'APPROVED_PUBLISHED',
    last_pushed_at: String(raw?.last_pushed_at || ''),
    last_pulled_at: String(raw?.last_pulled_at || ''),
  };
}

/**
 * Nhận diện cả hai kiểu link:
 *   /spreadsheets/d/<id>/edit?gid=123#gid=123   và   chính string id trần.
 * Link thư mục Drive không phải sheet: trả null để màn hình báo đúng lỗi.
 */
export function parseSheetUrl(input: string): { spreadsheet_id: string; gid: number } | null {
  const text = String(input || '').trim();
  if (!text) return null;
  const found = text.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/);
  const id = found ? found[1] : (/^[A-Za-z0-9_-]{20,}$/.test(text) ? text : '');
  if (!id) return null;
  const gidMatch = text.match(/[&#?]gid=(\d+)/);
  return { spreadsheet_id: id, gid: gidMatch ? Number(gidMatch[1]) : 0 };
}

// ---------------------------------------------------------------- khoá service account

export type SheetCredential = { client_email: string; private_key: string; source: string };

/**
 * Ưu tiên khoá riêng cho Sheets, rồi dùng lại đúng khoá Firebase đang bật đồng bộ cloud —
 * một cơ quan chỉ cần tạo service account MỘT lần.
 */
function credentialSource(): { raw: string; label: string } | null {
  const inline = String(process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON || '').trim();
  if (inline) return { raw: inline, label: 'GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON' };
  const fbInline = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  if (fbInline.startsWith('{')) return { raw: fbInline, label: 'FIREBASE_SERVICE_ACCOUNT_JSON' };
  const file = String(process.env.GOOGLE_SHEETS_CREDENTIALS || process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim();
  if (file && !file.startsWith('{') && fs.existsSync(file)) {
    return { raw: fs.readFileSync(file, 'utf8'), label: file };
  }
  return null;
}

let cachedCredential: SheetCredential | null | undefined;

/** Trả về null khi chưa có khoá — không ném, để màn hình còn hiển thị hướng dẫn. */
export function sheetCredential(): SheetCredential | null {
  if (cachedCredential !== undefined) return cachedCredential;
  const src = credentialSource();
  if (!src) {
    cachedCredential = null;
    return cachedCredential;
  }
  try {
    const parsed = JSON.parse(src.raw);
    const email = String(parsed.client_email || '');
    let key = String(parsed.private_key || '');
    // Khoá dán vào .env thường bị xuống dòng thành chuỗi "\n" literal.
    if (key && !key.includes('\n')) key = key.replace(/\\n/g, '\n');
    cachedCredential = email && key.includes('PRIVATE KEY')
      ? { client_email: email, private_key: key, source: src.label }
      : null;
  } catch {
    cachedCredential = null;
  }
  return cachedCredential;
}

/** Cho test đổi hướng khoá; truyền null để đọc lại từ môi trường. */
export function resetSheetCredentialCache(): void {
  cachedCredential = undefined;
  tokenCache = null;
}

/** Chỉ lộ email và tên nguồn khoá, không bao giờ lộ private_key ra log hay ra màn hình. */
export function sheetCredentialStatus(): { available: boolean; client_email: string; source: string } {
  const cred = sheetCredential();
  return {
    available: Boolean(cred),
    client_email: cred ? cred.client_email : '',
    source: cred ? cred.source : '',
  };
}

// ---------------------------------------------------------------- vận chuyển (transport)

export interface SheetTransport {
  /** Tên tab thật của gid, hoặc tab đầu tiên nếu không thấy gid đó. */
  resolveTab(spreadsheetId: string, gid: number): Promise<string>;
  /** Giá trị thô cả vùng A1 trở đi, gồm cả dòng tiêu đề. */
  read(spreadsheetId: string, tab: string): Promise<string[][]>;
  write(spreadsheetId: string, tab: string, values: string[][]): Promise<void>;
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

let tokenCache: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt - 60_000 > Date.now()) return tokenCache.value;
  const cred = sheetCredential();
  if (!cred) throw new Error('Chưa có khoá service account cho Google Sheet.');
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({
    iss: cred.client_email,
    scope: SHEETS_SCOPE,
    aud: tokenUrl(),
    iat: now,
    exp: now + 3600,
  }))}`;
  const signature = crypto.createSign('RSA-SHA256').update(body).sign(cred.private_key);
  const assertion = `${body}.${b64url(signature)}`;

  const res = await fetch(tokenUrl(), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${assertion}`,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Xin token Google Sheet thất bại (HTTP ${res.status}). ${authHint(res.status, detail)}`);
  }
  const json = await res.json() as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error('Google không trả access_token cho Sheets.');
  tokenCache = { value: json.access_token, expiresAt: Date.now() + (json.expires_in || 3600) * 1000 };
  return tokenCache.value;
}

/** Google trả 403/404 khi sheet chưa được chia sẻ cho service account — cán bộ cần câu chữ, không cần JSON lỗi. */
function authHint(status: number, detail: string): string {
  if (status === 403) return 'Phải chia sẻ sheet cho email service account với quyền "Editor" rồi mới đồng bộ được.';
  if (status === 404) return 'Không tìm thấy sheet. Kiểm tra lại đường dẫn đã dán và tab gid tương ứng.';
  return String(detail || '').slice(0, 200);
}

/** Tên tab có dấu cách hoặc tiếng Việt ("Lịch công tác") phải bọc nháy đơn theo A1 notation, nháy lồng nhân đôi. */
function a1Tab(tab: string): string {
  return /[^A-Za-z0-9_.\-]/.test(tab) ? `'${tab.replace(/'/g, "''")}'` : tab;
}

async function apiFetch(url: string, init: RequestInit): Promise<Response> {
  const token = await accessToken();
  return fetch(url, {
    ...init,
    headers: { ...(init.headers || {}), authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  });
}

async function errorText(res: Response): Promise<string> {
  return authHint(res.status, await res.text().catch(() => ''));
}

const googleTransport: SheetTransport = {
  async resolveTab(spreadsheetId, gid) {
    const res = await apiFetch(`${sheetsApiBase()}/${spreadsheetId}?fields=sheets.properties`, { method: 'GET' });
    if (!res.ok) throw new Error(`Không đọc được cấu trúc sheet (HTTP ${res.status}). ${await errorText(res)}`);
    const data = await res.json() as { sheets?: Array<{ properties?: { sheetId?: number; title?: string } }> };
    const tabs = (data.sheets || []).map((s) => s.properties || {});
    const hit = tabs.find((t) => Number(t.sheetId) === Number(gid));
    const title = String((hit || tabs[0])?.title || '');
    if (!title) throw new Error('Sheet chưa có tab nào để ghi lịch.');
    return title;
  },
  async read(spreadsheetId, tab) {
    const range = encodeURIComponent(`${a1Tab(tab)}!A1:ZZ`);
    const res = await apiFetch(`${sheetsApiBase()}/${spreadsheetId}/values/${range}`, { method: 'GET' });
    if (!res.ok) throw new Error(`Không đọc được dòng lịch (HTTP ${res.status}). ${await errorText(res)}`);
    const data = await res.json() as { values?: string[][] };
    return (data.values || []).map((row) => row.map((cellValue) => String(cellValue ?? '')));
  },
  async write(spreadsheetId, tab, values) {
    const a1 = `${a1Tab(tab)}!A1`;
    const res = await apiFetch(`${sheetsApiBase()}/${spreadsheetId}/values/${encodeURIComponent(a1)}?valueInputOption=RAW`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ range: a1, majorDimension: 'ROWS', values }),
    });
    if (!res.ok) throw new Error(`Không ghi được sheet (HTTP ${res.status}). ${await errorText(res)}`);
  },
};

let activeTransport: SheetTransport | null = null;

/** Nạp vận chuyển giả cho test; truyền null để quay lại Google Sheets thật. */
export function setSheetTransport(transport: SheetTransport | null): void {
  activeTransport = transport;
  tokenCache = null;
}

function transport(): SheetTransport {
  return activeTransport || googleTransport;
}

// ---------------------------------------------------------------- sự kiện <-> dòng

const cell = (value: unknown): string => String(value ?? '').replace(/[\r\n]+/g, ' ').trim();

/** Một mục lịch = một dòng, thứ tự đúng theo SHEET_COLUMNS. */
export function eventToRow(ev: EventRecord): string[] {
  return [
    cell(ev.id), cell(ev.event_date), cell(ev.start_time), cell(ev.end_time), cell(ev.title),
    cell(ev.content), cell(ev.chair), cell(ev.participants), cell(ev.location), cell(ev.preparation),
    cell(ev.priority_score), cell(ev.status), cell(ev.source_document), cell(ev.updated_at),
  ];
}

function signatureOf(row: string[]): string {
  return crypto.createHash('sha1').update(JSON.stringify(row)).digest('hex');
}

/**
 * Dòng sheet -> phần sửa cho sự kiện. Ô trống được BỎ QUA (không xoá dữ liệu trong app),
 * status chỉ nhận 5 giá trị hợp lệ, priority_score chỉ nhận số.
 */
export function rowToEventPatch(row: string[], index: Map<string, number>): Partial<EventRecord> & { event_id: string } {
  const at = (field: string) => {
    const i = index.get(field);
    return i === undefined ? '' : String(row[i] ?? '').trim();
  };
  const patch: Partial<EventRecord> & { event_id: string } = { event_id: at('event_id') };
  const assign = (key: typeof PULL_FIELDS[number], value: string) => {
    if (value) (patch as Record<string, any>)[key] = value;
  };
  for (const field of PULL_FIELDS) {
    const value = at(field);
    if (!value) continue;
    if (field === 'priority_score') {
      const n = Number(value);
      if (Number.isFinite(n)) (patch as Record<string, any>).priority_score = Math.round(n);
    } else if (field === 'status') {
      const upper = value.toUpperCase();
      if (EVENT_STATUSES.includes(upper)) (patch as Record<string, any>).status = upper;
    } else {
      assign(field, value);
    }
  }
  return patch;
}

/** Chỉ báo sự kiện được lên sheet theo chính sách đã chọn. */
export function isSyncableEvent(ev: EventRecord, policy: SheetSyncSettings['write_policy']): boolean {
  const status = String(ev.status || '').toUpperCase();
  if (status === 'REJECTED') return false;
  return policy === 'ALL' ? true : status === 'APPROVED' || status === 'PUBLISHED';
}

export function selectSyncEvents(events: EventRecord[], policy: SheetSyncSettings['write_policy']): EventRecord[] {
  return events.filter((ev) => isSyncableEvent(ev, policy));
}

// ---------------------------------------------------------------- bản nền (baseline)

export type SheetBaseline = Record<string, string>;

/**
 * "Lần trước ta để lại dòng gì" — cần thiết để biết bên nào thật sự sửa.
 * Tách khỏi settings vì cache này lớn theo số sự kiện và chỉ có giá trị trên máy này.
 */
let baselineOverride: SheetBaseline | null = null;
let baselinePath = '';

export function setSheetBaselineFile(filePath: string): void {
  baselinePath = filePath;
  baselineOverride = null;
}

function readBaseline(): SheetBaseline {
  if (baselineOverride) return baselineOverride;
  if (!baselinePath || !fs.existsSync(baselinePath)) return (baselineOverride = {});
  try {
    const parsed = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    baselineOverride = parsed && typeof parsed === 'object' ? parsed as SheetBaseline : {};
  } catch {
    baselineOverride = {};
  }
  return baselineOverride;
}

function writeBaseline(map: SheetBaseline): void {
  baselineOverride = map;
  if (!baselinePath) return;
  try {
    fs.writeFileSync(baselinePath, JSON.stringify(map), 'utf8');
  } catch {
    // Cache hỏng thì lần sau tính lại, tuyệt đối không được chặn luồng nghiệp vụ.
  }
}

export function sheetBaselineSize(): number {
  return Object.keys(readBaseline()).length;
}

// ---------------------------------------------------------------- ĐẨY lên sheet

export type PushReport = {
  ok: boolean;
  tab: string;
  written: number;
  unchanged: number;
  conflicts: Array<{ event_id: string; title: string; sheet_row: number }>;
  foreign_header: boolean;
  error: string;
};

function emptyPushReport(tab = ''): PushReport {
  return { ok: false, tab, written: 0, unchanged: 0, conflicts: [], foreign_header: false, error: '' };
}

/**
 * Đẩy lịch lên sheet: đọc nguyên tab, giữ y mọi dòng không thuộc app (kể cả dòng của mục đã
 * bị từ chối nên thôi đồng bộ), chỉ thay dòng của chính sự kiện đang xét rồi ghi lại một khối.
 * Xung đột (hai bên cùng sửa từ lần đẩy trước) được đóng băng và báo về, không ghi đè.
 */
export async function pushEventsToSheet(
  settings: SheetSyncSettings,
  events: EventRecord[],
  options: { force?: boolean } = {},
): Promise<PushReport> {
  const report = emptyPushReport();
  const cfg = normalizeSheetSync(settings);
  if (!cfg.enabled || !cfg.spreadsheet_id) {
    report.error = 'Chưa bật đồng bộ Google Sheet hoặc chưa dán đường dẫn sheet.';
    return report;
  }
  try {
    const tab = await transport().resolveTab(cfg.spreadsheet_id, cfg.gid);
    report.tab = tab;
    const rows = await transport().read(cfg.spreadsheet_id, tab);
    const header = rows[0] ? rows[0].map((v) => String(v ?? '').trim()) : [];
    const hasForeignHeader = header.length > 0 && !headerMatches(header);
    if (hasForeignHeader) {
      report.foreign_header = true;
      report.error = `Dòng tiêu đề sheet khác với cột của app (${SHEET_COLUMNS.join(', ')}). Hãy dùng một tab trắng.`;
      return report;
    }

    const baseline = readBaseline();
    const synced = selectSyncEvents(events, cfg.write_policy);
    const byId = new Map(synced.map((ev) => [String(ev.id), ev]));
    // Dòng của app là dòng có event_id đã biết; id lạ/do người khác ghi thì để nguyên.
    const body: string[][] = [];
    const usedIds = new Set<string>();

    for (let i = 1; i < rows.length; i += 1) {
      const raw = rows[i].map((v) => String(v ?? ''));
      if (!raw.some((v) => v.trim())) continue;
      const id = (raw[0] || '').trim();
      if (!id || !byId.has(id)) {
        body.push(padded(raw));
        continue;
      }
      usedIds.add(id);
      const ours = eventToRow(byId.get(id)!);
      const before = baseline[id];
      const sheetChanged = before !== undefined && signatureOf(raw) !== before;
      const localChanged = signatureOf(ours) !== before;
      if (sheetChanged && localChanged && !options.force) {
        report.conflicts.push({ event_id: id, title: byId.get(id)!.title, sheet_row: body.length + 2 });
        body.push(padded(raw));
        continue;
      }
      if (signatureOf(raw) === signatureOf(ours)) report.unchanged += 1;
      else report.written += 1;
      body.push(ours);
    }

    for (const ev of synced) {
      if (usedIds.has(String(ev.id))) continue;
      report.written += 1;
      body.push(eventToRow(ev));
    }

    const values = [header.length ? header : [...SHEET_COLUMNS], ...body];
    await transport().write(cfg.spreadsheet_id, tab, values);

    const nextBaseline: SheetBaseline = {};
    for (const ev of synced) {
      const id = String(ev.id);
      // Dòng đang xung đột giữ lại mốc cũ: lần đẩy sau vẫn thấy "hai bên cùng sửa" cho tới khi
      // cán bộ quyết một bên thắng. Cập nhật mốc ở đây là xoá mất cảnh báo và che lệch.
      if (report.conflicts.some((c) => c.event_id === id)) {
        nextBaseline[id] = baseline[id];
        continue;
      }
      const row = values.find((r) => String(r[0]).trim() === id);
      if (row) nextBaseline[id] = signatureOf(row);
    }
    writeBaseline(nextBaseline);
    report.ok = true;
    return report;
  } catch (err) {
    report.error = String((err as Error)?.message || err);
    return report;
  }
}

function headerMatches(header: string[]): boolean {
  if (header.length > SHEET_COLUMNS.length) return false;
  return SHEET_COLUMNS.slice(0, header.length).every((name, i) => String(header[i] || '').trim().toLowerCase() === name);
}

function padded(row: string[]): string[] {
  const out = row.slice(0, SHEET_COLUMNS.length);
  while (out.length < SHEET_COLUMNS.length) out.push('');
  return out;
}

/** Đọc sheet thành {header index, dòng thân} — dùng chung cho cả đẩy và kéo. */
async function loadTab(cfg: SheetSyncSettings): Promise<{ tab: string; header: string[]; index: Map<string, number>; rows: string[][] }> {
  const tab = await transport().resolveTab(cfg.spreadsheet_id, cfg.gid);
  const all = await transport().read(cfg.spreadsheet_id, tab);
  const header = (all[0] || []).map((v) => String(v ?? '').trim().toLowerCase());
  const index = new Map<string, number>();
  header.forEach((name, i) => { if (name) index.set(name, i); });
  const rows = all.slice(1).map((row) => row.map((v) => String(v ?? '')));
  return { tab, header, index, rows };
}

// ---------------------------------------------------------------- KÉO từ sheet

export type PullUpdate = {
  event_id: string;
  title: string;
  changed: string[];
  patch: Partial<EventRecord>;
};

export type PullReport = {
  ok: boolean;
  tab: string;
  updates: PullUpdate[];
  foreign_rows: number;
  blank_rows: number;
  error: string;
};

/**
 * Đọc sheet và trả phần sửa theo từng event_id đã có trong app. Dòng lạ thì báo lại chứ không tự
 * dựng sự kiện mới: một dòng viết tay trên sheet chưa chắc đã qua bước duyệt của app.
 * Dòng bị xoá trên sheet không xuất hiện ở đây nên sự kiện trong app vẫn còn nguyên — đó là
 * nguyên tắc "xoá trên sheet không được làm mất lịch".
 */
export async function pullEventsFromSheet(
  settings: SheetSyncSettings,
  events: EventRecord[],
): Promise<PullReport> {
  const report: PullReport = { ok: false, tab: '', updates: [], foreign_rows: 0, blank_rows: 0, error: '' };
  const cfg = normalizeSheetSync(settings);
  if (!cfg.enabled || !cfg.spreadsheet_id) {
    report.error = 'Chưa bật đồng bộ Google Sheet hoặc chưa dán đường dẫn sheet.';
    return report;
  }
  try {
    const { tab, index, rows } = await loadTab(cfg);
    report.tab = tab;
    const idCol = index.get('event_id');
    if (idCol === undefined) {
      report.error = 'Sheet không có cột event_id nên không đối chiếu được mục lịch.';
      return report;
    }
    const local = new Map(events.map((ev) => [String(ev.id), ev]));
    const baseline = readBaseline();
    for (const raw of rows) {
      if (!raw.some((v) => v.trim())) {
        report.blank_rows += 1;
        continue;
      }
      const id = String(raw[idCol] || '').trim();
      const ev = local.get(id);
      if (!ev) {
        if (id) report.foreign_rows += 1;
        continue;
      }
      const before = baseline[id];
      // Chưa từng đẩy dòng này lên thì không có căn cứ biết ai sửa: bỏ qua để không đè lịch trong app.
      if (before === undefined || signatureOf(raw) === before) continue;
      const patch = rowToEventPatch(raw, index);
      const changed: string[] = [];
      for (const field of PULL_FIELDS) {
        const value = (patch as Record<string, any>)[field];
        if (value === undefined) continue;
        if (String((ev as Record<string, any>)[field]) !== String(value)) changed.push(field);
      }
      if (!changed.length) {
        baseline[id] = signatureOf(raw);
        continue;
      }
      delete (patch as Record<string, any>).event_id;
      report.updates.push({ event_id: id, title: ev.title, changed, patch });
      // App vừa chấp nhận nội dung sheet thì mốc mới là chính dòng đó: nếu không, lượt đẩy sau
      // sẽ thấy "hai bên cùng sửa" giả và đóng băng dòng vĩnh viễn.
      baseline[id] = signatureOf(raw);
    }
    writeBaseline(baseline);
    report.ok = true;
    return report;
  } catch (err) {
    report.error = String((err as Error)?.message || err);
    return report;
  }
}

/**
 * Áp các bản sửa vừa kéo vào mảng sự kiện; bất biến và không xoá bản nào.
 * Trả số mục thực đổi để caller khỏi ghi store khi sheet không có gì mới.
 */
export function applyPullUpdates(events: EventRecord[], updates: PullUpdate[]): { events: EventRecord[]; applied: number } {
  if (!updates.length) return { events, applied: 0 };
  const positions = new Map(events.map((ev, i) => [String(ev.id), i]));
  const next = events.slice();
  let applied = 0;
  for (const update of updates) {
    const pos = positions.get(update.event_id);
    if (pos === undefined) continue;
    next[pos] = { ...next[pos], ...update.patch, updated_at: new Date().toISOString() } as EventRecord;
    applied += 1;
  }
  return { events: next, applied };
}

// ---------------------------------------------------------------- trạng thái cho màn Cài đặt

/** Một lượt đọc nhanh: tab nào, bao nhiêu dòng thuộc app, cột tiêu đề đúng chưa. Không ghi gì. */
export async function inspectSheet(settings: SheetSyncSettings): Promise<{
  ok: boolean;
  tab: string;
  rows: number;
  header_ok: boolean;
  credential: { available: boolean; client_email: string; source: string };
  error: string;
}> {
  const credential = sheetCredentialStatus();
  const cfg = normalizeSheetSync(settings);
  const out = { ok: false, tab: '', rows: 0, header_ok: false, credential, error: '' };
  if (!cfg.spreadsheet_id) {
    out.error = 'Chưa dán đường dẫn Google Sheet.';
    return out;
  }
  try {
    const { tab, header, rows } = await loadTab(cfg);
    out.tab = tab;
    out.rows = rows.filter((r) => r.some((v) => v.trim())).length;
    out.header_ok = header.length === 0 || headerMatches(header);
    if (!out.header_ok) out.error = `Dòng tiêu đề sheet khác cột của app. Hãy dùng một tab trắng để app tự ghi tiêu đề.`;
    else out.ok = true;
    return out;
  } catch (err) {
    out.error = String((err as Error)?.message || err);
    return out;
  }
}

export function sheetSyncHint(settings: SheetSyncSettings): string {
  const cfg = normalizeSheetSync(settings);
  if (!cfg.spreadsheet_id) return 'Chưa dán đường dẫn Google Sheet.';
  if (!cfg.enabled) return 'Sheet đã cấu hình nhưng đồng bộ đang tắt.';
  if (!sheetCredentialStatus().available) {
    return 'Đã có sheet nhưng máy chủ chưa thấy khoá service account (đặt GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON hoặc FIREBASE_SERVICE_ACCOUNT_JSON trong .env).';
  }
  return `Đang đồng bộ hai chiều với sheet ${cfg.spreadsheet_id.slice(0, 12)}…`;
}

export { PULL_FIELDS, EVENT_STATUSES };
