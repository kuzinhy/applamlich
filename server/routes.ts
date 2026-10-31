import { Router, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { getState, mutate, newId, persist, recordAudit, storeFileLocation, extractLeaders, DATA_DIR, eventsBetween, rememberLesson, rememberPublication, rememberWebhookDelivery, pruneSessions, findUserByName, normalizeTask, normalizeTasks, newShareToken, noteShareAccess, replaceState, SCHEMA_VERSION, addEventComment, addEventVersion, ensureIcsToken, rotateIcsToken } from './store.ts';
import { upsertEvents } from './services/merge.ts';
import { PARTY_SIGNAL_GROUPS, canonicalPersonName } from './engines/party_signals.ts';
import { learnAssignments, mergeLearnedRules, rosterFromPersonnel, runPartyDetection } from './services/party_detection.ts';
import { analyzeConflicts, durationOf, formatClock, parseClock } from './engines/conflict.ts';
import { scorePriority } from './engines/priority.ts';
import { extractPreparation } from './engines/preparation.ts';
import { buildIcs } from './engines/ics.ts';
import { parseIcsCalendar } from './engines/ics_import.ts';
import { extractEventsFromText, coerceAiEvent } from './engines/extractor.ts';
import { extractTextAsync, contentFingerprint } from './engines/document_text.ts';
import { generateWeekDraft } from './services/week_draft.ts';
import { aiModel, ask, askJson, AIUnavailableError, hasApiKey, probeProviders } from './engines/gemini.ts';
import { runAgent } from './engines/agent.ts';
import { findFreeSlots, workloadByPerson } from './engines/free_slots.ts';
import { planConflictResolutions } from './engines/optimizer.ts';
import { bm25Rank, snippet } from './engines/retrieval.ts';
import { isoWeekNumber, startOfWeek, todayIso, weekDays, addDays, formatDdMmYyyy, fromIso, mondayOfIsoWeek, toIso, WEEKDAY_FULL } from './utils/dates.ts';
import { buildWeekDocx } from './engines/export_docx.ts';
import { buildWeekXlsx } from './engines/export_xlsx.ts';
import { buildWeekPdf } from './engines/export_pdf.ts';
import { buildWeekReport, buildMonthReport } from './services/report_data.ts';
import { officialDocumentHtml } from './engines/official_document.ts';
import { checkDocumentFormat } from './engines/format_check.ts';
import { holidaysInYear, holidaysInRange, LUNAR_NOTICE } from './utils/vn_holidays.ts';
import { agencyHeadLines, advisorUnitName } from './utils/organization.ts';
import type { DriveSetupRecord, EventRecord, EventStatus, EventTask, NotificationConfig, PublicationRecord, SessionRecord, UserRecord, UserRole, WebhookEvent } from './types.ts';
import QRCode from 'qrcode';
import { WEBHOOK_LOG_LIMIT, EVENT_TASK_LIMIT, TRASH_LIMIT, DEFAULT_DRIVE_SETUP, DEFAULT_USER_NOTIFY_PREFS } from './types.ts';

/** Phiên bản ứng dụng đọc một lần từ package.json, dùng cho màn Hỗ trợ. */
const APP_VERSION = (() => {
  try {
    return String(JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '..', 'package.json'), 'utf8')).version || '1.0.0');
  } catch {
    return '1.0.0';
  }
})();
import {
  ALL_PERMISSIONS,
  MAX_PASSWORD_LENGTH,
  SESSION_COOKIE,
  can,
  canChangePassword,
  checkLoginThrottle,
  clearedSessionCookie,
  clientIp,
  createSession,
  findActiveSession,
  hashPassword,
  isHttpsRequest,
  isUserRole,
  minPasswordLength,
  newSetupCode,
  normalizeUsername,
  noteLoginFailure,
  noteLoginSuccess,
  parseCookies,
  passwordIssues,
  publicUser,
  serializeSessionCookie,
  sessionTtlDays,
  setupCodeMatches,
  usernameIssues,
  verifyLoginAttempt,
  verifyPassword,
  type Permission,
} from './auth.ts';
import {
  buildWebhookPayload,
  dispatchWebhook,
  generateWebhookSecret,
  publicWebhookConfig,
  redactTarget,
  sendWebhookOnce,
  webhookUrlError,
  type WebhookContext,
} from './services/webhook.ts';
import { notifyAll, buildDigestText } from './services/notify.ts';
import { googleLoginConfig, verifyGoogleIdToken } from './services/google_auth.ts';

const STATUSES: EventStatus[] = ['DRAFT', 'PROPOSED', 'APPROVED', 'PUBLISHED', 'REJECTED'];
const MAX_PROMPT_CHARS = 12000;

export const router = Router();

function weekParam(req: Request): { start: string; end: string } {
  const weekNumber = Number(req.query.week_number ?? req.body?.week_number ?? NaN);
  if (Number.isFinite(weekNumber) && weekNumber > 0) {
    const year = Number(req.query.year ?? req.body?.year ?? new Date().getFullYear());
    const start = mondayOfIsoWeek(weekNumber, year);
    return { start, end: addDays(start, 6) };
  }
  const raw = String(req.query.week || req.body?.week_start || req.body?.week || todayIso());
  const start = startOfWeek(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : todayIso());
  return { start, end: addDays(start, 6) };
}

function failAi(res: Response, err: unknown): Response {
  if (err instanceof AIUnavailableError) return res.status(503).json({ error: err.message, ai_available: false });
  const message = err instanceof Error ? err.message : String(err);
  return res.status(502).json({ error: `Lỗi khi gọi trợ lý AI: ${message}`, ai_available: false });
}

function findEvent(id: string): EventRecord | undefined {
  return getState().events.find((e) => e.id === id);
}

function refreshConflicts(weekStart?: string, weekEnd?: string): number {
  let count = 0;
  const before = getState().conflicts.filter((c) => c.status === 'OPEN').length;
  mutate((s) => {
    const fresh = analyzeConflicts(s.events, s.settings.travel_buffers);
    const keepResolved = s.conflicts.filter((c) => c.status === 'RESOLVED');
    if (weekStart && weekEnd) {
      const inWeek = new Set(
        fresh.filter((c) => {
          const ev = s.events.find((e) => e.id === c.event_id_1);
          return ev && ev.event_date >= weekStart && ev.event_date <= weekEnd;
        }).map((c) => `${c.event_id_1}-${c.event_id_2}`)
      );
      s.conflicts = [
        ...keepResolved,
        ...fresh.filter((c) => inWeek.has(`${c.event_id_1}-${c.event_id_2}`)),
      ];
    } else {
      s.conflicts = [...keepResolved, ...fresh];
    }
    count = s.conflicts.filter((c) => c.status === 'OPEN').length;
  });
  if (count > before) {
    emit('conflict.opened', {
      week_start: weekStart,
      week_end: weekEnd,
      counts: { open_conflicts: count, newly_open: count - before },
    });
  }
  return count;
}

/** Phát webhook fire-and-forget: không chặn đáp ứng HTTP; lỗi gửi đã có nhật ký riêng. */
function emit(event: WebhookEvent, ctx: WebhookContext): void {
  void dispatchWebhook(event, { unit_name: getState().settings.unit_name || '', ...ctx });
}

function eventItem(ev: EventRecord) {
  return { date: ev.event_date, start_time: ev.start_time || null, title: ev.title, location: ev.location, chair: ev.chair };
}

function recomputePriority(ev: EventRecord): number {
  const src = getState().sources.find((s) => s.id === ev.source_id);
  return scorePriority({
    source_priority: src?.priority_level ?? 50,
    title: ev.title,
    content: ev.content,
    chair: ev.chair,
    participants: ev.participants,
  });
}

/** Chặn nạp trùng: cùng nội dung dưới tên tệp khác vẫn là một văn bản. */
function findDuplicateSource(hash: string) {
  if (!hash) return undefined;
  return getState().sources.find((s) => s.content_hash === hash);
}

/** Bóc tách một nguồn đã lưu thành sự kiện PROPOSED, gộp việc trùng và tính lại xung đột. */
async function runSourceExtraction(sourceId: string, week: { start: string; end: string }, req: Request) {
  const source = getState().sources.find((s) => s.id === sourceId);
  if (!source) throw new Error('Không tìm thấy nguồn');
  const { events, rejected } = await extractEventsFromText(source.raw_text, {
    source_doc: source.file_name,
    source_id: source.id,
    source_priority: source.priority_level,
    week_start: week.start,
  });
  if (!events.length) {
    return { created: 0, merged_into_existing: [] as { event_id: string; title: string; from: string }[], rejected, open_conflicts: refreshConflicts(week.start, week.end), events: [] as EventRecord[] };
  }
  let upsert: { inserted: EventRecord[]; merged: { event_id: string; title: string; from: string }[] } = { inserted: [], merged: [] };
  mutate((s) => {
    upsert = upsertEvents(s, events);
    const target = s.sources.find((x) => x.id === sourceId);
    if (target) target.parse_status = 'DONE';
  });
  audit(
    req,
    'ai_extract',
    'source',
    source.id,
    `${upsert.inserted.length} sự kiện mới, ${upsert.merged.length} việc gộp thêm nguồn từ "${source.file_name}"`
  );
  if (upsert.inserted.length) {
    emit('proposal.created', {
      week_start: week.start,
      week_end: week.end,
      counts: { proposals: upsert.inserted.length },
      items: upsert.inserted.map(eventItem),
    });
  }
  persist();
  const open = refreshConflicts(week.start, week.end);
  return {
    created: upsert.inserted.length,
    merged_into_existing: upsert.merged,
    rejected,
    open_conflicts: open,
    events: upsert.inserted,
  };
}

// ---------------- Phiên làm việc, phân quyền, nhật ký thao tác ----------------

interface AuthContext {
  user: UserRecord;
  session: SessionRecord;
  ip: string;
}

function authOf(req: Request): AuthContext | null {
  return (req as unknown as { auth?: AuthContext }).auth ?? null;
}

function requireAuthOf(req: Request): AuthContext | null {
  return authOf(req);
}

/** Không cần phiên: màn hình đăng nhập, thăm dò tình trạng và trang lịch đã chia sẻ công khai. */
const PUBLIC_ROUTES = [/^\/health$/, /^\/auth\/(status|login|setup|google)$/, /^\/public\/week\//, /^\/ics\/feed\//];
/** Bất kỳ người nào đã đăng nhập cũng dùng được, không xét vai trò. */
const SELF_SERVICE_ROUTES = [/^\/auth\/(me|logout|password|sessions)(\/|$)/];

type RuleTarget = Permission | 'admin';

/**
 * Bảng quyền theo (phương pháp, đường dẫn). Quy tắc cụ thể phải đặt trước quy tắc chung.
 * GET/PATCH/PUT/POST/DELETE có quy tắc thì theo quy tắc; GET không có quy tắc thì cần "read";
 * phương pháp ghi không có quy tắc thì chỉ admin dùng được,
 * để thêm route mới không vô tình mở quyền cho biên tập.
 */
const PERMISSION_RULES: Array<{ method: string; re: RegExp; perm: RuleTarget }> = [
  { method: 'POST', re: /^\/agency\/trace-check$/, perm: 'read' },
  { method: 'POST', re: /^\/signals\/detect$/, perm: 'read' },
  { method: 'POST', re: /^\/signals\/learn$/, perm: 'agency:write' },
  { method: 'PATCH', re: /^\/signals\/config$/, perm: 'settings:write' },
  { method: 'POST', re: /^\/personnel$/, perm: 'agency:write' },
  { method: 'PATCH', re: /^\/personnel/, perm: 'agency:write' },
  { method: 'DELETE', re: /^\/personnel/, perm: 'agency:write' },
  { method: 'POST', re: /^\/agency\/(qc-review|ai-draft|analyze-file)$/, perm: 'ai:run' },
  { method: 'POST', re: /^\/agency/, perm: 'agency:write' },
  { method: 'PATCH', re: /^\/agency/, perm: 'agency:write' },
  { method: 'DELETE', re: /^\/agency/, perm: 'agency:write' },
  { method: 'POST', re: /^\/events\/[^/]+\/comments$/, perm: 'read' },
  { method: 'POST', re: /^\/events\/[^/]+\/status$/, perm: 'proposals:review' },
  { method: 'POST', re: /^\/events/, perm: 'events:write' },
  { method: 'PATCH', re: /^\/events/, perm: 'events:write' },
  { method: 'DELETE', re: /^\/events/, perm: 'events:write' },
  { method: 'POST', re: /^\/sources\/[^/]+\/extract$/, perm: 'events:write' },
  { method: 'POST', re: /^\/sources/, perm: 'sources:write' },
  { method: 'DELETE', re: /^\/sources/, perm: 'sources:write' },
  { method: 'POST', re: /^\/conflicts\/[^/]+\/ai-suggest$/, perm: 'ai:run' },
  { method: 'POST', re: /^\/conflicts/, perm: 'events:write' },
  { method: 'POST', re: /^\/ai\//, perm: 'ai:run' },
  { method: 'POST', re: /^\/brain\/analyze$/, perm: 'ai:run' },
  { method: 'POST', re: /^\/brain/, perm: 'agency:write' },
  { method: 'DELETE', re: /^\/brain/, perm: 'agency:write' },
  { method: 'POST', re: /^\/publish$/, perm: 'publish' },
  { method: 'POST', re: /^\/publications\/[^/]+\/revoke$/, perm: 'publish' },
  { method: 'POST', re: /^\/publications\/[^/]+\/share$/, perm: 'publish' },
  { method: 'DELETE', re: /^\/publications\/[^/]+\/share$/, perm: 'publish' },
  { method: 'POST', re: /^\/ics\/subscription\/rotate$/, perm: 'publish' },
  { method: 'POST', re: /^\/trash/, perm: 'events:write' },
  { method: 'DELETE', re: /^\/trash/, perm: 'events:write' },
  { method: 'POST', re: /^\/import\//, perm: 'sources:write' },
  { method: 'GET', re: /^\/backup\/download$/, perm: 'backup' },
  { method: 'POST', re: /^\/backup\/restore$/, perm: 'admin' },
  { method: 'PUT', re: /^\/settings$/, perm: 'settings:write' },
  { method: 'PUT', re: /^\/drive\/config$/, perm: 'drive:write' },
  { method: 'POST', re: /^\/backup$/, perm: 'backup' },
  { method: 'GET', re: /^\/audit$/, perm: 'audit:read' },
  { method: 'GET', re: /^\/users$/, perm: 'users:manage' },
  { method: 'POST', re: /^\/users/, perm: 'users:manage' },
  { method: 'PATCH', re: /^\/users/, perm: 'users:manage' },
  { method: 'DELETE', re: /^\/users/, perm: 'users:manage' },
  { method: 'GET', re: /^\/webhook(\/|$)/, perm: 'settings:write' },
  { method: 'POST', re: /^\/webhook(\/|$)/, perm: 'settings:write' },
  { method: 'PUT', re: /^\/webhook(\/|$)/, perm: 'settings:write' },
  { method: 'GET', re: /^\/notify(\/|$)/, perm: 'settings:write' },
  { method: 'POST', re: /^\/notify(\/|$)/, perm: 'settings:write' },
  { method: 'PUT', re: /^\/notify(\/|$)/, perm: 'settings:write' },
];

function requiredPermission(method: string, routePath: string): RuleTarget | null {
  for (const rule of PERMISSION_RULES) {
    if (rule.method === method && rule.re.test(routePath)) return rule.perm;
  }
  if (method === 'GET' || method === 'HEAD') return 'read';
  return null;
}

function isPublicRoute(routePath: string): boolean {
  return PUBLIC_ROUTES.some((re) => re.test(routePath));
}

function isSelfServiceRoute(routePath: string): boolean {
  return SELF_SERVICE_ROUTES.some((re) => re.test(routePath));
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Cookie phiên đi kèm mọi request, nên chặn request ghi đến từ Origin khác (CSRF).
    Trình duyệt luôn gửi Origin cho POST/PUT/PATCH/DELETE; công cụ dòng lệnh không gửi thì vẫn cho qua. */
function sameOrigin(req: Request): boolean {
  const host = req.get('host');
  if (!host) return true;
  const candidates = [req.get('origin'), req.get('referer')].filter(Boolean) as string[];
  for (const raw of candidates) {
    try {
      if (new URL(raw).host !== host) return false;
    } catch {
      return false;
    }
  }
  return true;
}

interface RateRule {
  re: RegExp;
  bucket: string;
  limit: number;
  windowMs: number;
}

/** Giới hạn thao tác tốn tài nguyên (AI free tier, đọc tệp) theo từng tài khoản. */
const RATE_RULES: RateRule[] = [
  {
    re: /^\/(sources\/(upload|ingest-dir)$|agency\/analyze-file$)/,
    bucket: 'upload',
    limit: Math.max(1, Number(process.env.RATE_UPLOAD_PER_HOUR) || 120),
    windowMs: 3_600_000,
  },
  {
    re: /^\/(ai\/|brain\/analyze$|agency\/(ai-draft|qc-review)$|conflicts\/[^/]+\/ai-suggest$)/,
    bucket: 'ai',
    limit: Math.max(1, Number(process.env.RATE_AI_PER_MIN) || 30),
    windowMs: 60_000,
  },
];

const rateHits = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string, rule: RateRule, now = Date.now()): { allowed: boolean; retryAfter: number } {
  const hit = rateHits.get(key);
  if (!hit || hit.resetAt <= now) return { allowed: true, retryAfter: 0 };
  if (hit.count < rule.limit) return { allowed: true, retryAfter: 0 };
  return { allowed: false, retryAfter: Math.ceil((hit.resetAt - now) / 1000) };
}

function noteRateHit(key: string, rule: RateRule, now = Date.now()): void {
  const hit = rateHits.get(key);
  if (!hit || hit.resetAt <= now) {
    rateHits.set(key, { count: 1, resetAt: now + rule.windowMs });
  } else {
    hit.count += 1;
  }
  if (rateHits.size > 5000) {
    for (const [k, v] of rateHits) if (v.resetAt <= now) rateHits.delete(k);
    if (rateHits.size > 5000) rateHits.clear();
  }
}

/** Gắn phiên (nếu có cookie hợp lệ) rồi chốt quyền. Chạy trước mọi route. */
router.use((req, res, next) => {
  const s = getState();
  const cookies = parseCookies(req.headers.cookie);
  const found = findActiveSession(s.sessions, s.users, cookies[SESSION_COOKIE]);
  if (found) {
    (req as unknown as { auth?: AuthContext }).auth = { user: found.user, session: found.session, ip: clientIpOf(req) };
    touchSession(found.session);
  }
  if (!SAFE_METHODS.has(req.method) && !sameOrigin(req)) {
    return res.status(403).json({ error: 'Yêu cầu bị chặn vì Origin không khớp máy chủ.', code: 'CSRF_BLOCKED' });
  }
  const routePath = req.path;
  if (isPublicRoute(routePath) || isSelfServiceRoute(routePath)) return next();
  const ctx = authOf(req);
  if (!ctx) {
    return res.status(401).json({ error: 'Cần đăng nhập để xem dữ liệu lịch', code: 'AUTH_REQUIRED' });
  }
  const perm = requiredPermission(req.method, routePath);
  if (perm === null) {
    return res.status(403).json({
      error: `Route ${req.method} ${routePath} chưa được khai báo trong bảng quyền nên chỉ quản trị viên dùng được.`,
      code: 'PERMISSION_UNDECLARED',
    });
  }
  if (perm === 'admin' ? ctx.user.role !== 'admin' : !can(ctx.user.role, perm)) {
    return res.status(403).json({ error: `Tài khoản của bạn (${ctx.user.role}) không có quyền này.`, code: 'FORBIDDEN' });
  }
  const rule = RATE_RULES.find((r) => r.re.test(routePath));
  if (rule) {
    const key = `${rule.bucket}:${ctx.user.id}`;
    const rate = checkRateLimit(key, rule);
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.retryAfter));
      return res.status(429).json({
        error: `Thao tác quá nhanh. Thử lại sau ${rate.retryAfter} giây (giới hạn ${rule.limit} lần/${Math.round(rule.windowMs / 60000)} phút).`,
        code: 'RATE_LIMITED',
        retry_after_seconds: rate.retryAfter,
      });
    }
    noteRateHit(key, rule);
  }
  return next();
});

/** Chỉ ghi lại thời gian dùng gần nhất khi đã lệch hơn 5 phút, tránh ghi file liên tục. */
function touchSession(session: SessionRecord): void {
  const now = Date.now();
  if (now - new Date(session.last_seen_at).getTime() < 300000) return;
  mutate((s) => {
    const target = s.sessions.find((x) => x.id === session.id);
    if (target) target.last_seen_at = new Date(now).toISOString();
  });
}

/** Mọi dòng nhật ký đều gắn tên người đăng nhập và IP thật của request. */
function audit(req: Request, action: string, entity: string, entityId: string, detail: string): void {
  const ctx = authOf(req);
  recordAudit(action, entity, entityId, detail, { username: ctx?.user.username ?? null, ip: ctx?.ip ?? null });
}

router.get('/health', async (_req, res) => {
  const s = getState();
  const ctx = authOf(_req);
  const providers = await probeProviders();
  const base: Record<string, unknown> = {
    status: 'ok',
    version: APP_VERSION,
    uptime_seconds: Math.round(process.uptime()),
    ai_available: providers.some((p) => p.available),
    ai_providers: providers,
    schema_version: s.schema_version,
    auth_required: true,
    needs_setup: s.users.length === 0,
    accounts: s.users.length,
  };
  if (!ctx) return res.json(base);
  res.json({
    ...base,
    ai_model: aiModel(),
    store: storeFileLocation(),
    events: s.events.length,
    sources: s.sources.length,
    users: s.users.length,
    counts: {
      sources: s.sources.length,
      events: s.events.length,
      open_conflicts: s.conflicts.filter((c) => c.status === 'OPEN').length,
      agency_schedules: s.agency_schedules.length,
      personnel: s.personnel.length,
      memory: s.memory.length,
      publications: s.publications.length,
    },
  });
});

// ---------------- Đăng nhập & tài khoản ----------------

interface CookieFlags {
  secure: boolean;
  production: boolean;
}

function cookieFlags(req: Request): CookieFlags {
  return { secure: isHttpsRequest(req), production: process.env.NODE_ENV === 'production' };
}

function issueSessionCookie(res: Response, session: SessionRecord, flags: CookieFlags): void {
  res.setHeader('Set-Cookie', serializeSessionCookie(session.id, new Date(session.expires_at), flags));
}

function clientIpOf(req: Request): string {
  return clientIp(req);
}

function newPasswordProblems(password: string, username: string): string[] {
  return passwordIssues(password, username);
}

/** Các trường danh tính thêm cho tài khoản mới; bản tạo bằng Google sẽ ghi đè sau. */
function newIdentityFields(): Pick<UserRecord, 'auth_provider' | 'email' | 'google_sub' | 'drive_setup' | 'notify_prefs'> {
  return {
    auth_provider: 'local',
    email: '',
    google_sub: '',
    drive_setup: { ...DEFAULT_DRIVE_SETUP },
    notify_prefs: { ...DEFAULT_USER_NOTIFY_PREFS },
  };
}

router.get('/auth/status', (req, res) => {
  const s = getState();
  const ctx = authOf(req);
  res.json({
    authenticated: Boolean(ctx),
    needs_setup: s.users.length === 0,
    user: ctx ? publicUser(ctx.user) : null,
    session_ttl_days: sessionTtlDays(),
    google: googleLoginConfig(),
  });
});

router.post('/auth/login', (req, res) => {
  const ip = clientIpOf(req);
  const username = normalizeUsername(req.body?.username);
  const password = String(req.body?.password ?? '');
  const flags = cookieFlags(req);

  const throttle = checkLoginThrottle(ip, username, Date.now());
  if (!throttle.allowed) {
    return res.status(429).json({
      error: `Nhập sai quá nhiều lần nên đã khoá tạm. Thử lại sau ${Math.ceil(throttle.retryAfterSeconds / 60)} phút.`,
      code: 'LOCKED',
      retry_after_seconds: throttle.retryAfterSeconds,
    });
  }
  if (flags.production && !flags.secure) {
    return res.status(400).json({
      error: 'Bản production bắt buộc truy cập qua HTTPS. Bật TLS ở reverse proxy và đặt TRUST_PROXY=1.',
      code: 'HTTPS_REQUIRED',
    });
  }
  if (!username || !password) {
    return res.status(400).json({ error: 'Cần nhập tên đăng nhập và mật khẩu' });
  }

  const result = verifyLoginAttempt(getState().users, username, password);
  if (!result.ok) {
    noteLoginFailure(ip, username, Date.now());
    return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
  }
  noteLoginSuccess(ip, username);

  const session = createSession(result.user, { userAgent: req.headers['user-agent'], ip });
  mutate((s) => {
    const user = s.users.find((u) => u.id === result.user.id);
    if (user) user.last_login_at = session.created_at;
    s.sessions.push(session);
    pruneSessions(s);
  });
  issueSessionCookie(res, session, flags);
  return res.json({ ok: true, user: publicUser(result.user) });
});

/** Tên đăng nhập suy ra từ email Google, bảo đảm hợp lệ và không trùng. */
function usernameFromEmail(users: UserRecord[], email: string): string {
  const local = email.split('@')[0] || 'user';
  const base = local.toLowerCase().replace(/[^a-z0-9._-]+/g, '.').replace(/^[._-]+|[._-]+$/g, '') || 'user';
  const taken = new Set(users.map((u) => u.username));
  let candidate = base.slice(0, 40);
  if (candidate.length < 3) candidate = `user${candidate}`.slice(0, 40);
  if (!taken.has(candidate)) return candidate;
  for (let i = 2; i < 1000; i += 1) {
    const next = `${base.slice(0, 34)}${i}`;
    if (!taken.has(next)) return next;
  }
  return `${base.slice(0, 30)}-${Date.now().toString(36)}`;
}

function googleSignupRole(): UserRole {
  const raw = String(process.env.GOOGLE_SIGNUP_ROLE ?? 'viewer').trim().toLowerCase();
  return isUserRole(raw) ? raw : 'viewer';
}

/**
 * Đăng nhập bằng Google Identity Services. Server chỉ chữ ký ID token (không có client secret),
 * tài khoản chưa tồn tại thì tạo mới với vai trò hạn chế theo GOOGLE_SIGNUP_ROLE.
 */
router.post('/auth/google', async (req, res) => {
  const ip = clientIpOf(req);
  const flags = cookieFlags(req);
  const throttle = checkLoginThrottle(ip, 'google', Date.now());
  if (!throttle.allowed) {
    return res.status(429).json({
      error: `Thử quá nhiều lần nên đã khoá tạm. Thử lại sau ${Math.ceil(throttle.retryAfterSeconds / 60)} phút.`,
      code: 'LOCKED',
      retry_after_seconds: throttle.retryAfterSeconds,
    });
  }
  if (flags.production && !flags.secure) {
    return res.status(400).json({
      error: 'Bản production bắt buộc truy cập qua HTTPS. Bật TLS ở reverse proxy và đặt TRUST_PROXY=1.',
      code: 'HTTPS_REQUIRED',
    });
  }
  const config = googleLoginConfig();
  if (!config.enabled) {
    return res.status(503).json({
      error: 'Chưa cấu hình GOOGLE_CLIENT_ID trên máy chủ nên chưa bật được đăng nhập Google.',
      code: 'GOOGLE_NOT_CONFIGURED',
    });
  }
  const verified = await verifyGoogleIdToken(String(req.body?.credential ?? ''), {
    clientId: config.client_id,
    allowedHostedDomains: config.allowed_domains,
  });
  if (!verified.ok) {
    noteLoginFailure(ip, 'google', Date.now());
    return res.status(401).json({ error: verified.error, code: verified.code });
  }

  const users = getState().users;
  let user = users.find((u) => u.google_sub === verified.identity.sub)
    ?? users.find((u) => u.email === verified.identity.email);
  let created = false;
  if (!user) {
    user = {
      id: newId('u'),
      username: usernameFromEmail(users, verified.identity.email),
      display_name: verified.identity.name || verified.identity.email,
      role: googleSignupRole(),
      password_hash: '',
      is_active: true,
      created_at: new Date().toISOString(),
      last_login_at: new Date().toISOString(),
      auth_provider: 'google',
      email: verified.identity.email,
      google_sub: verified.identity.sub,
      drive_setup: { ...DEFAULT_DRIVE_SETUP },
      notify_prefs: { ...DEFAULT_USER_NOTIFY_PREFS },
    };
    created = true;
    mutate((s) => s.users.push(user!));
    audit(req, 'create', 'user', user.id, `Tài khoản Google ${user.email} — ${user.role}`);
  } else if (!user.is_active) {
    return res.status(403).json({ error: 'Tài khoản này đã bị khoá. Hãy liên hệ người quản trị.', code: 'ACCOUNT_DISABLED' });
  }

  const session = createSession(user, { userAgent: req.headers['user-agent'], ip });
  mutate((s) => {
    const stored = s.users.find((u) => u.id === user!.id);
    if (stored) {
      stored.last_login_at = session.created_at;
      if (!stored.email) stored.email = verified.identity.email;
      if (!stored.google_sub) stored.google_sub = verified.identity.sub;
      if (!stored.auth_provider) stored.auth_provider = 'google';
    }
    s.sessions.push(session);
    pruneSessions(s);
  });
  noteLoginSuccess(ip, user.username);
  issueSessionCookie(res, session, flags);
  return res.json({
    ok: true,
    user: publicUser({ ...user, last_login_at: session.created_at }),
    created,
    needs_drive_setup: !user.drive_setup.connected,
  });
});

/** Lưu thư mục Google Drive của chính người dùng (bước cuối wizard onboarding). */
router.put('/auth/me/drive', (req, res) => {
  const ctx = requireAuthOf(req);
  if (!ctx) return res.status(401).json({ error: 'Phiên đã hết hạn' });
  const folderId = String(req.body?.folder_id ?? '').trim();
  if (!/^[a-zA-Z0-9_-]{6,200}$/.test(folderId)) {
    return res.status(400).json({ error: 'Mã thư mục Google Drive không hợp lệ' });
  }
  const folderName = String(req.body?.folder_name ?? '').trim().slice(0, 120);
  const setup: DriveSetupRecord = {
    connected: true,
    folder_id: folderId,
    folder_name: folderName,
    folder_url: String(req.body?.folder_url ?? '').trim().slice(0, 300),
    connected_at: new Date().toISOString(),
  };
  mutate((s) => {
    const stored = s.users.find((u) => u.id === ctx.user.id);
    if (stored) stored.drive_setup = setup;
  });
  audit(req, 'update', 'user', ctx.user.id, `Gắn thư mục Drive ${folderName || folderId}`);
  return res.json({ ok: true, drive_setup: setup });
});

router.post('/auth/setup', (req, res) => {
  const s = getState();
  if (s.users.length) {
    return res.status(409).json({ error: 'Hệ thống đã có tài khoản. Hãy liên hệ người quản trị để được cấp quyền.' });
  }
  const ip = clientIpOf(req);
  const storedCode = String(s.auth.setup_code || '');
  if (!storedCode || !setupCodeMatches(storedCode, String(req.body?.setup_code ?? ''))) {
    noteLoginFailure(ip, 'setup', Date.now());
    return res.status(403).json({
      error: 'Mã khởi tạo không đúng. Mã 8 ký tự này chỉ xuất hiện trên console của máy chủ khi chạy lần đầu.',
      code: 'BAD_SETUP_CODE',
    });
  }
  const username = normalizeUsername(req.body?.username);
  const displayName = String(req.body?.display_name ?? '').trim().slice(0, 80);
  const password = String(req.body?.password ?? '');
  const problems = [...usernameIssues(username), ...newPasswordProblems(password, username)];
  if (problems.length) return res.status(400).json({ error: problems.join('. ') });

  const user: UserRecord = {
    id: newId('u'),
    username,
    display_name: displayName || username,
    role: 'admin',
    password_hash: hashPassword(password),
    is_active: true,
    created_at: new Date().toISOString(),
    last_login_at: new Date().toISOString(),
    ...newIdentityFields(),
  };
  const session = createSession(user, { userAgent: req.headers['user-agent'], ip });
  mutate((state) => {
    state.users.push(user);
    state.sessions.push(session);
    state.auth = { setup_code: '', setup_code_created_at: null };
  });
  noteLoginSuccess(ip, username);
  issueSessionCookie(res, session, cookieFlags(req));
  return res.json({ ok: true, user: publicUser(user) });
});

router.post('/auth/logout', (req, res) => {
  const ctx = authOf(req);
  if (ctx) {
    mutate((s) => {
      s.sessions = s.sessions.filter((x) => x.id !== ctx.session.id);
    });
  }
  res.setHeader('Set-Cookie', clearedSessionCookie(isHttpsRequest(req)));
  res.json({ ok: true });
});

router.get('/auth/me', (req, res) => {
  const ctx = requireAuthOf(req);
  if (!ctx) return res.status(401).json({ error: 'Phiên đã hết hạn' });
  res.json({
    user: publicUser(ctx.user),
    session: { created_at: ctx.session.created_at, expires_at: ctx.session.expires_at, ip: ctx.session.ip },
    all_permissions: ALL_PERMISSIONS,
    policy: { session_ttl_days: sessionTtlDays(), password_min_length: minPasswordLength() },
  });
});

/** Đổi mật khẩu của chính mình; các phiên khác bị thu hồi, phiên hiện tại giữ lại. */
router.post('/auth/password', (req, res) => {
  const ctx = requireAuthOf(req);
  if (!ctx) return res.status(401).json({ error: 'Phiên đã hết hạn' });
  const current = String(req.body?.current_password ?? '');
  const next = String(req.body?.new_password ?? '');
  if (!canChangePassword(ctx.user, current)) {
    return res.status(403).json({ error: 'Mật khẩu hiện tại không đúng' });
  }
  const problems = newPasswordProblems(next, ctx.user.username);
  if (problems.length) return res.status(400).json({ error: problems.join('. ') });
  mutate((s) => {
    const user = s.users.find((u) => u.id === ctx.user.id);
    if (user) user.password_hash = hashPassword(next);
    s.sessions = s.sessions.filter((x) => x.user_id !== ctx.user.id || x.id === ctx.session.id);
  });
  audit(req, 'change_password', 'user', ctx.user.id, 'Đổi mật khẩu của chính mình');
  return res.json({ ok: true });
});

router.get('/auth/sessions', (req, res) => {
  const ctx = requireAuthOf(req);
  if (!ctx) return res.status(401).json({ error: 'Phiên đã hết hạn' });
  res.json({
    sessions: getState()
      .sessions.filter((x) => x.user_id === ctx.user.id)
      .map((x) => ({
        id_tail: x.id.slice(-6),
        id: x.id,
        created_at: x.created_at,
        expires_at: x.expires_at,
        last_seen_at: x.last_seen_at,
        ip: x.ip,
        user_agent: x.user_agent.slice(0, 80),
        current: x.id === ctx.session.id,
      })),
  });
});

router.post('/auth/sessions/:id/revoke', (req, res) => {
  const ctx = requireAuthOf(req);
  if (!ctx) return res.status(401).json({ error: 'Phiên đã hết hạn' });
  let removed = 0;
  mutate((s) => {
    const before = s.sessions.length;
    s.sessions = s.sessions.filter((x) => !(x.id === req.params.id && x.user_id === ctx.user.id));
    removed = before - s.sessions.length;
  });
  if (!removed) return res.status(404).json({ error: 'Không tìm thấy phiên này' });
  if (req.params.id === ctx.session.id) {
    res.setHeader('Set-Cookie', clearedSessionCookie(isHttpsRequest(req)));
  }
  return res.json({ ok: true, removed });
});

function activeAdminCount(s: ReturnType<typeof getState>): number {
  return s.users.filter((u) => u.role === 'admin' && u.is_active).length;
}

/** List chỉ kèm hash rút gọn để không lộ salt ra ngoài API. */
router.get('/users', (req, res) => {
  const s = getState();
  res.json({
    users: s.users.map((u) => ({
      ...publicUser(u),
      sessions: s.sessions.filter((x) => x.user_id === u.id).length,
    })),
    admin_only_notice: 'Mật khẩu chỉ được lưu dưới dạng băm scrypt; không ai xem lại được mật khẩu gốc.',
  });
});

router.post('/users', (req, res) => {
  const username = normalizeUsername(req.body?.username);
  const displayName = String(req.body?.display_name ?? '').trim().slice(0, 80);
  const password = String(req.body?.password ?? '');
  const role = req.body?.role;
  if (!isUserRole(role)) return res.status(400).json({ error: 'Vai trò phải là admin, editor hoặc viewer' });
  const problems = [...usernameIssues(username), ...newPasswordProblems(password, username)];
  if (findUserByName(username)) problems.push('Tên đăng nhập đã tồn tại');
  if (password.length > MAX_PASSWORD_LENGTH) problems.push(`Mật khẩu tối đa ${MAX_PASSWORD_LENGTH} ký tự`);
  if (problems.length) return res.status(400).json({ error: problems.join('. ') });

  const user: UserRecord = {
    id: newId('u'),
    username,
    display_name: displayName || username,
    role,
    password_hash: hashPassword(password),
    is_active: true,
    created_at: new Date().toISOString(),
    last_login_at: null,
    ...newIdentityFields(),
  };
  mutate((s) => s.users.push(user));
  audit(req, 'create', 'user', user.id, `${username} — ${role}`);
  return res.status(201).json({ user: publicUser(user) });
});

router.patch('/users/:id', (req, res) => {
  const s = getState();
  const target = s.users.find((u) => u.id === req.params.id);
  if (!target) return res.status(404).json({ error: 'Không tìm thấy tài khoản' });
  const ctx = authOf(req);
  const changes: string[] = [];
  const nextRole = req.body?.role;
  const nextActive = req.body?.is_active;
  const nextName = req.body?.display_name;
  const nextPassword = req.body?.password;

  if (nextRole !== undefined) {
    if (!isUserRole(nextRole)) return res.status(400).json({ error: 'Vai trò không hợp lệ' });
    if (target.role === 'admin' && nextRole !== 'admin' && activeAdminCount(s) <= 1) {
      return res.status(400).json({ error: 'Phải còn ít nhất một tài khoản quản trị đang hoạt động' });
    }
    changes.push(`role ${target.role} -> ${nextRole}`);
  }
  if (nextActive === false) {
    if (target.role === 'admin' && activeAdminCount(s) <= 1) {
      return res.status(400).json({ error: 'Không thể vô hiệu hoá quản trị viên cuối cùng' });
    }
    if (ctx?.user.id === target.id) return res.status(400).json({ error: 'Không thể vô hiệu hoá chính mình' });
    changes.push('vô hiệu hoá');
  } else if (nextActive === true) {
    changes.push('kích hoạt lại');
  }
  if (typeof nextName === 'string') changes.push(`đổi tên hiển thị`);
  if (typeof nextPassword === 'string' && nextPassword) {
    const problems = newPasswordProblems(nextPassword, target.username);
    if (problems.length) return res.status(400).json({ error: problems.join('. ') });
    changes.push('đặt lại mật khẩu');
  }
  if (!changes.length) return res.status(400).json({ error: 'Không có thay đổi nào' });

  mutate((state) => {
    const user = state.users.find((u) => u.id === target.id);
    if (!user) return;
    if (nextRole !== undefined) user.role = nextRole as UserRole;
    if (nextActive !== undefined) user.is_active = Boolean(nextActive);
    if (typeof nextName === 'string') user.display_name = nextName.trim().slice(0, 80) || user.display_name;
    if (typeof nextPassword === 'string' && nextPassword) user.password_hash = hashPassword(nextPassword);
    // Đổi quyền hoặc mật khẩu phải có hiệu lực ngay trên mọi thiết bị đang đăng nhập.
    if (nextRole !== undefined || nextActive === false || (typeof nextPassword === 'string' && nextPassword)) {
      state.sessions = state.sessions.filter((x) => x.user_id !== target.id);
    }
  });
  audit(req, 'update', 'user', target.id, `${target.username}: ${changes.join(', ')}`);
  const after = getState().users.find((u) => u.id === target.id)!;
  return res.json({ user: publicUser(after) });
});

router.delete('/users/:id', (req, res) => {
  const s = getState();
  const target = s.users.find((u) => u.id === req.params.id);
  if (!target) return res.status(404).json({ error: 'Không tìm thấy tài khoản' });
  const ctx = authOf(req);
  if (ctx?.user.id === target.id) return res.status(400).json({ error: 'Không thể xoá chính mình' });
  if (target.role === 'admin' && activeAdminCount(s) <= 1) {
    return res.status(400).json({ error: 'Không thể xoá quản trị viên cuối cùng' });
  }
  mutate((state) => {
    state.users = state.users.filter((u) => u.id !== target.id);
    state.sessions = state.sessions.filter((x) => x.user_id !== target.id);
  });
  audit(req, 'delete', 'user', target.id, target.username);
  return res.json({ ok: true });
});

/** Nhật ký ai đã sửa gì — chỉ quản trị viên. */
router.get('/audit', (req, res) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 120));
  const entries = getState().audit_log.slice(-limit).reverse();
  res.json({ total: getState().audit_log.length, entries });
});

/** Cấu hình webhook xuất (Google Apps Script / n8n / Zapier). */
const WEBHOOK_EVENT_CHOICES: WebhookEvent[] = [
  'week.published', 'week.revoked', 'event.created', 'event.updated',
  'event.moved', 'proposal.created', 'conflict.opened',
];

router.get('/webhook/config', (_req, res) => {
  const s = getState();
  res.json({
    config: publicWebhookConfig(s.webhook_config, false),
    event_choices: WEBHOOK_EVENT_CHOICES,
    signature_header: 'X-TG-Signature: sha256=<hmac của body đúng từng byte>',
  });
});

router.put('/webhook/config', (req, res) => {
  const body = req.body || {};
  const url = String(body.url ?? '').trim();
  const wanted = Array.isArray(body.events)
    ? body.events.filter((e: unknown): e is WebhookEvent => WEBHOOK_EVENT_CHOICES.includes(e as WebhookEvent))
    : [];
  const problems: string[] = [];
  if (url) {
    const err = webhookUrlError(url);
    if (err) problems.push(err);
  } else if (body.enabled) {
    problems.push('Bật webhook thì phải có URL');
  }
  if (body.enabled && !getState().webhook_config.secret) problems.push('Cần tạo secret trước khi bật webhook');
  if (problems.length) return res.status(400).json({ error: problems.join('. ') });

  mutate((s) => {
    s.webhook_config = {
      enabled: Boolean(body.enabled),
      url,
      secret: s.webhook_config.secret,
      events: wanted.length ? wanted : s.webhook_config.events,
      include_details: Boolean(body.include_details),
    };
  });
  audit(req, 'update', 'webhook', 'config', `enabled=${Boolean(body.enabled)} events=${(wanted.length ? wanted : getState().webhook_config.events).join(',')} chi_tiet=${Boolean(body.include_details)}`);
  return res.json({ config: publicWebhookConfig(getState().webhook_config, false) });
});

/** Secret ký HMAC: sinh một lần, xem lại với ?reveal=1, hoặc quay vòng để thu hồi bản cũ. */
router.post('/webhook/secret', (req, res) => {
  const rotate = Boolean(req.body?.rotate);
  let secret = getState().webhook_config.secret;
  if (rotate || !secret) {
    secret = generateWebhookSecret();
    mutate((s) => {
      s.webhook_config.secret = secret;
    });
    audit(req, rotate ? 'rotate_secret' : 'create_secret', 'webhook', 'config', 'Khóa ký webhook');
  }
  res.json({ secret, note: 'Lưu value này vào phía nhận (Apps Script / n8n). Sau khi rời trang, secret chỉ hiển thị lại khi bật reveal.' });
});

/** Gửi thử một bản tin để xác nhận URL và khoá ký đúng. */
router.post('/webhook/test', async (req, res) => {
  const config = getState().webhook_config;
  const urlError = webhookUrlError(config.url);
  if (urlError) return res.status(400).json({ error: urlError });
  if (!config.secret) return res.status(400).json({ error: 'Chưa có khoá ký webhook' });
  const body = JSON.stringify(
    buildWebhookPayload(config, 'week.published', {
      week_number: isoWeekNumber(todayIso()),
      year: new Date().getFullYear(),
      week_start: todayIso(),
      counts: { test: 1 },
    }),
  );
  const started = Date.now();
  const outcome = await sendWebhookOnce(config, 'week.published', body);
  rememberDelivery('week.published', config, outcome.ok ? 'sent' : 'failed', outcome.status, 1, outcome.error);
  if (!outcome.ok) {
    return res.status(502).json({ error: `Không gọi được URL webhook: ${outcome.error || 'bên nhận trả lỗi'}` });
  }
  return res.json({ ok: true, http_status: outcome.status, ms: Date.now() - started });
});

function rememberDelivery(
  event: WebhookEvent,
  config: { url: string },
  status: 'sent' | 'failed' | 'skipped',
  httpStatus: number | null,
  attempts: number,
  error: string,
): void {
  mutate(() => {
    rememberWebhookDelivery({
      at: new Date().toISOString(),
      event,
      target: redactTarget(config.url),
      status,
      http_status: httpStatus,
      attempts,
      error,
    });
  });
}

router.get('/webhook/log', (_req, res) => {
  const s = getState();
  res.json({ deliveries: s.webhook_log.slice(-40).reverse() });
});

// ---------------- Nhắc việc: Telegram, email, webhook đã cấu hình ----------------

const MASK = '••••';

function redactSecret(value: string): string {
  const v = String(value || '');
  if (!v) return '';
  return v.length <= 4 ? MASK : `${MASK}${v.slice(-4)}`;
}

function isMasked(value: unknown): boolean {
  return String(value ?? '').includes(MASK);
}

function publicNotificationConfig(config: NotificationConfig) {
  return {
    ...config,
    telegram: {
      ...config.telegram,
      bot_token: redactSecret(config.telegram.bot_token),
      has_token: Boolean(config.telegram.bot_token),
    },
    email: { ...config.email, pass: redactSecret(config.email.pass), has_pass: Boolean(config.email.pass) },
  };
}

router.get('/notify/config', (_req, res) => {
  const s = getState();
  res.json({
    config: publicNotificationConfig(s.notifications),
    webhook_enabled: s.webhook_config.enabled && Boolean(s.webhook_config.url),
    scheduler: { enabled: process.env.NOTIFY_SCHEDULER !== '0', tick_ms: Math.max(20000, Number(process.env.NOTIFY_TICK_MS || 60000)) },
    last_digest_date: s.last_digest_date,
    recent: s.notification_log.slice(-10).reverse(),
  });
});

/** Chỉ trả về khi client ghi đè đúng kiểu — giữ nguyên khoá bí mật nếu client gửi lại bản che. */
function coerceNotificationConfig(current: NotificationConfig, body: any): NotificationConfig {
  const next: NotificationConfig = JSON.parse(JSON.stringify(current));
  if (typeof body.enabled === 'boolean') next.enabled = body.enabled;
  if (typeof body.include_details === 'boolean') next.include_details = body.include_details;

  const tg = body.telegram || {};
  if (typeof tg.enabled === 'boolean') next.telegram.enabled = tg.enabled;
  if (typeof tg.chat_id === 'string') next.telegram.chat_id = tg.chat_id.trim();
  if (typeof tg.bot_token === 'string' && !isMasked(tg.bot_token)) next.telegram.bot_token = tg.bot_token.trim();

  const em = body.email || {};
  if (typeof em.enabled === 'boolean') next.email.enabled = em.enabled;
  if (typeof em.smtp_host === 'string') next.email.smtp_host = em.smtp_host.trim();
  if (em.smtp_port !== undefined) next.email.smtp_port = Math.min(65535, Math.max(1, Number(em.smtp_port) || 587));
  if (typeof em.secure === 'boolean') next.email.secure = em.secure;
  if (typeof em.user === 'string') next.email.user = em.user.trim();
  if (typeof em.pass === 'string' && !isMasked(em.pass)) next.email.pass = em.pass;
  if (typeof em.from === 'string') next.email.from = em.from.trim();
  if (Array.isArray(em.to)) next.email.to = em.to.map((x: unknown) => String(x).trim()).filter(Boolean).slice(0, 30);
  else if (typeof em.to === 'string') next.email.to = em.to.split(/[,;\s]+/).map((x: string) => x.trim()).filter(Boolean).slice(0, 30);

  if (typeof body.daily_digest_enabled === 'boolean') next.daily_digest_enabled = body.daily_digest_enabled;
  if (typeof body.daily_digest_time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(body.daily_digest_time)) {
    next.daily_digest_time = body.daily_digest_time;
  }
  if (typeof body.reminder_enabled === 'boolean') next.reminder_enabled = body.reminder_enabled;
  if (Array.isArray(body.reminder_before_hours)) {
    const hours: number[] = (body.reminder_before_hours as unknown[])
      .map((x) => Number(x))
      .filter((x: number) => Number.isFinite(x) && x > 0 && x <= 168);
    if (hours.length) next.reminder_before_hours = Array.from(new Set(hours)).sort((a, b) => b - a).slice(0, 6);
  }
  return next;
}

router.put('/notify/config', (req, res) => {
  const current = getState().notifications;
  const next = coerceNotificationConfig(current, req.body || {});
  if (next.enabled) {
    const hasTelegram = next.telegram.bot_token && next.telegram.chat_id;
    const hasEmail = next.email.smtp_host && next.email.to.length;
    if (!hasTelegram && !hasEmail) {
      return res.status(400).json({ error: 'Bật thông báo thì cần ít nhất một kênh: Telegram (token + chat id) hoặc email (SMTP + người nhận)' });
    }
  }
  mutate((s) => {
    s.notifications = next;
  });
  audit(req, 'update', 'notification', 'config', `enabled=${next.enabled} telegram=${next.telegram.enabled} email=${next.email.enabled} digest=${next.daily_digest_time} nhac=${next.reminder_before_hours.join('/')} chi_tiet=${next.include_details}`);
  return res.json({ config: publicNotificationConfig(getState().notifications) });
});

router.post('/notify/test', async (req, res) => {
  const config = getState().notifications;
  const text = [
    '🔔 <b>Thử thông báo</b>',
    `Đơn vị: ${config.include_details ? getState().settings.unit_name : '(đã ẩn chi tiết)'}`,
    `Thời điểm: ${new Date().toLocaleString('vi-VN')}`,
    'Nếu bạn nhận được tin này, cấu hình kênh đã đúng.',
  ].join('\n');
  const results = await notifyAll('test', 'Thử thông báo lịch công tác', text);
  const anySent = results.some((r) => r.status === 'sent');
  return res.status(anySent ? 200 : 502).json({ ok: anySent, results });
});

router.get('/notify/log', (_req, res) => {
  const s = getState();
  res.json({ deliveries: s.notification_log.slice(-60).reverse() });
});

/** Gửi bản tin đầu ngày ngay (dùng khi đổi cấu hình hoặc muốn gửi bù). */
router.post('/notify/digest', async (req, res) => {
  const date = String(req.body?.date || todayIso());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Ngày phải dạng YYYY-MM-DD' });
  const config = getState().notifications;
  const events = eventsBetween(date, date).filter((ev) => ev.status !== 'REJECTED' && ev.status !== 'DRAFT');
  const results = await notifyAll('digest', `Lịch công tác ${formatDdMmYyyy(date)}`, buildDigestText(date, events, config, getState().settings.unit_name));
  audit(req, 'send', 'notification', 'digest', `${date} · ${events.length} mục`);
  return res.json({ ok: results.some((r) => r.status === 'sent'), date, events: events.length, results });
});

/**
 * Cấu hình Firebase cho nhánh Google Drive. File nằm ngoài git nên repo public
 * không chứa khoá; endpoint chỉ người đã đăng nhập mới đọc được.
 */
router.get('/config/firebase', (_req, res) => {
  const file = path.join(path.resolve(import.meta.dirname, '..'), 'firebase-applet-config.json');
  if (!fs.existsSync(file)) {
    return res.status(404).json({ error: 'Chưa cấu hình Firebase — sao chép firebase-applet-config.example.json thành firebase-applet-config.json' });
  }
  try {
    res.json(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch {
    res.status(500).json({ error: 'File firebase-applet-config.json không phải JSON hợp lệ' });
  }
});



/** Bản tóm tắt nguồn: không gửi raw_text (có thể vài trăm KB) qua mỗi lần tải lịch. */
function sourceSummary(source: any) {
  const { raw_text, ...rest } = source;
  return { ...rest, chars: (raw_text || '').length };
}

router.get('/state', (req, res) => {
  const { start, end } = weekParam(req);
  const s = getState();
  const days = weekDays(start);
  const events = eventsBetween(start, end);
  const ids = new Set(events.map((e) => e.id));
  const proposedAll = s.events.filter((e) => e.status === 'PROPOSED');
  res.json({
    week: { start, end, week_number: isoWeekNumber(start), days },
    events,
    sources: s.sources.map(sourceSummary),
    conflicts: s.conflicts.filter((c) => ids.has(c.event_id_1) || ids.has(c.event_id_2)),
    /** Đề xuất của mọi tuần để màn duyệt không bị giới hạn ở tuần đang xem. */
    proposed_events: proposedAll,
    open_conflicts: s.conflicts.filter((c) => c.status === 'OPEN').length,
    agency_schedules: s.agency_schedules.filter((a) => a.event_date >= start && a.event_date <= end),
    personnel: s.personnel,
    settings: s.settings,
    publication: s.publications.find((p) => p.week_start === start) || null,
    audit_log: s.audit_log.slice(-30).reverse(),
    stats: {
      total: events.length,
      high_priority: events.filter((e) => e.priority_score >= 80).length,
      proposed: events.filter((e) => e.status === 'PROPOSED').length,
      proposed_all: proposedAll.length,
      published: events.filter((e) => e.status === 'PUBLISHED').length,
      needs_data: events.filter((e) => e.missing_data_fields.length > 0).length,
      today_count: events.filter((e) => e.event_date === todayIso()).length,
    },
  });
});

/** Toàn bộ đề xuất đang chờ duyệt, sắp theo ngày/giờ; có lọc tối thiểu để màn duyệt dùng lại. */
router.get('/proposals', (req, res) => {
  const s = getState();
  const status = String(req.query.status || 'PROPOSED').toUpperCase();
  const from = String(req.query.from || '');
  const to = String(req.query.to || '');
  let list = s.events.filter((e) => (status === 'ALL' ? true : e.status === status));
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) list = list.filter((e) => e.event_date >= from);
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) list = list.filter((e) => e.event_date <= to);
  list = list.sort((a, b) => `${a.event_date} ${a.start_time}`.localeCompare(`${b.event_date} ${b.start_time}`));
  const bySource = new Map<string, number>();
  for (const ev of list) bySource.set(ev.source_document || 'Không rõ nguồn', (bySource.get(ev.source_document || 'Không rõ nguồn') || 0) + 1);
  res.json({
    proposals: list,
    counts: {
      total: list.length,
      high_priority: list.filter((e) => e.priority_score >= 85).length,
      missing_data: list.filter((e) => e.missing_data_fields.length > 0).length,
    },
    by_source: [...bySource.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
  });
});

/** Lưới lịch tháng thật: 6 tuần (42 ngày) bắt đầu từ Thứ Hai của tuần chứa ngày 1. */
router.get('/calendar/month', (req, res) => {
  const raw = String(req.query.month || '').trim();
  const match = /^(\d{4})-(\d{2})$/.exec(raw);
  const now = new Date();
  const year = match ? Number(match[1]) : now.getFullYear();
  const month = match ? Math.min(12, Math.max(1, Number(match[2]))) : now.getMonth() + 1;
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  const gridStart = startOfWeek(first);
  const gridEnd = addDays(gridStart, 41);
  const s = getState();
  const events = eventsBetween(gridStart, gridEnd);
  const holidays = new Map(holidaysInRange(gridStart, gridEnd).map((h) => [h.date, h.name]));
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = addDays(gridStart, index);
    const dow = fromIso(date).getDay();
    return {
      date,
      display_date: `${date.slice(8, 10)}/${date.slice(5, 7)}`,
      weekday: WEEKDAY_FULL[dow],
      weekday_full: WEEKDAY_FULL[dow],
      is_today: date === todayIso(),
      is_weekend: dow === 0 || dow === 6,
      in_month: date.slice(0, 7) === `${year}-${String(month).padStart(2, '0')}`,
      holiday: holidays.get(date) ?? null,
      events: events
        .filter((e) => e.event_date === date)
        .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || '')),
    };
  });
  res.json({
    month: `${year}-${String(month).padStart(2, '0')}`,
    year,
    month_number: month,
    start: gridStart,
    end: gridEnd,
    days,
    stats: {
      total: events.length,
      high_priority: events.filter((e) => e.priority_score >= 80).length,
      proposed: events.filter((e) => e.status === 'PROPOSED').length,
      published: events.filter((e) => e.status === 'PUBLISHED').length,
    },
  });
});

// ---------------- Events CRUD ----------------

router.post('/events', (req, res) => {
  const body = req.body || {};
  if (!body.title && !body.content) return res.status(422).json({ error: 'Thiếu title hoặc content' });
  const now = new Date().toISOString();
  const event: EventRecord = {
    id: newId('ev'),
    source_id: body.source_id ?? null,
    source_document: body.source_document || '',
    source_page: body.source_page ?? null,
    source_paragraph: body.source_paragraph ?? null,
    event_date: body.event_date || req.query.week || todayIso(),
    start_time: body.start_time || '07:00',
    end_time: body.end_time || null,
    title: body.title || String(body.content).slice(0, 80),
    content: body.content || body.title || '',
    chair: body.chair || '',
    participants: body.participants || '',
    participant_group: body.participant_group || '',
    location: body.location || '',
    organizer: body.organizer || '',
    preparation: body.preparation || '',
    documents_required: body.documents_required || '',
    contact_person: body.contact_person || '',
    priority_score: Number(body.priority_score ?? 50),
    confidence: Number(body.confidence ?? 1),
    status: STATUSES.includes(body.status) ? body.status : 'DRAFT',
    missing_data_fields: Array.isArray(body.missing_data_fields) ? body.missing_data_fields : [],
    leaders: [],
    also_from: Array.isArray(body.also_from) ? body.also_from.map(String) : [],
    tasks: normalizeTasks(body.tasks),
    series_id: body.series_id ? String(body.series_id) : null,
    created_at: now,
    updated_at: now,
  };
  event.priority_score = recomputePriority(event);
  event.leaders = extractLeaders(event.chair, event.participants);
  mutate((s) => {
    s.events.push(event);
  });
  audit(req, 'create', 'event', event.id, event.title);
  emit('event.created', {
    week_start: startOfWeek(event.event_date),
    week_end: addDays(startOfWeek(event.event_date), 6),
    counts: { events: 1 },
    items: [eventItem(event)],
  });
  persist();
  const open = refreshConflicts();
  res.status(201).json({ event: findEvent(event.id), open_conflicts: open });
});

router.patch('/events/:id', (req, res) => {
  const existing = findEvent(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy sự kiện' });
  const allowed = [
    'title', 'content', 'chair', 'participants', 'participant_group', 'location', 'organizer',
    'preparation', 'documents_required', 'contact_person', 'source_document', 'event_date',
    'start_time', 'end_time', 'confidence', 'priority_score', 'source_id',
  ];
  const changes: string[] = [];
  const before = structuredClone(existing);
  mutate((s) => {
    const ev = s.events.find((e) => e.id === req.params.id)!;
    for (const key of allowed) {
      if (key in req.body && req.body[key] !== ev[key as keyof EventRecord]) {
        (ev as any)[key] = req.body[key];
        changes.push(key);
      }
    }
    if (changes.length) {
      ev.leaders = extractLeaders(ev.chair, ev.participants);
      ev.priority_score = Number(req.body.priority_score ?? recomputePriority(ev));
      const missing: string[] = [];
      if (!ev.start_time) missing.push('start_time');
      if (!ev.end_time) missing.push('end_time');
      if (!ev.chair) missing.push('chair');
      if (!ev.location) missing.push('location');
      ev.missing_data_fields = missing;
      ev.updated_at = new Date().toISOString();
    }
  });
  if (!changes.length) return res.json({ event: existing, unchanged: true });
  addEventVersion(
    existing.id,
    authOf(req)?.user.username || 'hệ thống',
    'update',
    changes,
    before,
  );
  //Cán bộ sửa phân công của bản AI vừa bóc tách -> lưu thành bài học cho lần bóc tách sau.
  const learnedFields = changes.some((c) => ['chair', 'participants', 'event_date', 'start_time', 'location'].includes(c));
  if (learnedFields && existing.status === 'PROPOSED' && existing.source_document) {
    const ev = findEvent(req.params.id)!;
    rememberLesson({
      source_text: (getState().sources.find((s) => s.id === ev.source_id)?.raw_text || ev.content).slice(0, 400),
      agency_content: ev.title,
      decision_action: 'CORRECTED_BY_OFFICER',
      assigned_executor: ev.chair,
      assigned_attendees: ev.participants,
      reason: `Cán bộ chỉnh ${changes.join(', ')} của mục "${ev.title}" trích từ "${ev.source_document}"`,
      week_num: isoWeekNumber(ev.event_date || todayIso()),
    });
    persist();
  }
  audit(req, 'update', 'event', req.params.id, changes.join(', '));
  const updated = findEvent(req.params.id);
  if (updated) emit('event.updated', { counts: { events: 1 }, items: [eventItem(updated)] });
  const open = refreshConflicts();
  res.json({ event: findEvent(req.params.id), updated_fields: changes, open_conflicts: open });
});

/** Kéo-thả đổi ngày/giờ: giữ nguyên thời lượng, phân tích lại xung đột. */
router.post('/events/:id/move', (req, res) => {
  const existing = findEvent(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy sự kiện' });
  const targetDate = String(req.body?.event_date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    return res.status(422).json({ error: 'event_date phải theo định dạng YYYY-MM-DD' });
  }
  const targetStart = normalizeTimeInput(req.body?.start_time);
  if (targetStart === null) return res.status(422).json({ error: 'start_time không hợp lệ' });

  const minutes = parseClock(existing.start_time);
  const length = durationOf(existing);
  const newEnd = minutes === null ? null : targetStart + length;

  mutate((s) => {
    const ev = s.events.find((e) => e.id === req.params.id)!;
    ev.event_date = targetDate;
    ev.start_time = formatClock(targetStart);
    ev.end_time = newEnd === null ? ev.end_time : formatClock(newEnd);
    ev.updated_at = new Date().toISOString();
  });
  audit(req, 'move', 'event', req.params.id, `${existing.event_date} ${existing.start_time} -> ${targetDate} ${formatClock(targetStart)}`);
  const moved = findEvent(req.params.id);
  if (moved) emit('event.moved', { counts: { events: 1 }, items: [eventItem(moved)] });
  const open = refreshConflicts();
  res.json({ event: findEvent(req.params.id), open_conflicts: open });
});

router.post('/events/:id/status', (req, res) => {
  const next = String(req.body?.status || '').toUpperCase();
  if (!STATUSES.includes(next as EventStatus)) {
    return res.status(422).json({ error: `Trạng thái phải là một trong: ${STATUSES.join(', ')}` });
  }
  if (!findEvent(req.params.id)) return res.status(404).json({ error: 'Không tìm thấy sự kiện' });
  const statusBefore = structuredClone(findEvent(req.params.id)!);
  mutate((s) => {
    const ev = s.events.find((e) => e.id === req.params.id)!;
    ev.status = next as EventStatus;
    ev.updated_at = new Date().toISOString();
  });
  addEventVersion(req.params.id, authOf(req)?.user.username || 'hệ thống', 'status', ['status'], statusBefore);
  audit(req, 'status', 'event', req.params.id, next);
  const open = refreshConflicts();
  res.json({ event: findEvent(req.params.id), open_conflicts: open });
});

// ---------------- Ý kiến duyệt & lịch sử thay đổi ----------------

/** Ý kiến trao đổi trên một mục lịch (không sửa nội dung lịch). */
router.get('/events/:id/comments', (req, res) => {
  if (!findEvent(req.params.id)) return res.status(404).json({ error: 'Không tìm thấy sự kiện' });
  const comments = getState().event_comments
    .filter((c) => c.event_id === req.params.id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  res.json({ comments });
});

router.post('/events/:id/comments', (req, res) => {
  if (!findEvent(req.params.id)) return res.status(404).json({ error: 'Không tìm thấy sự kiện' });
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(422).json({ error: 'Nội dung ý kiến đang trống.' });
  if (text.length > 2000) return res.status(422).json({ error: 'Ý kiến tối đa 2.000 ký tự.' });
  const author = authOf(req)?.user.display_name || authOf(req)?.user.username || 'Ẩn danh';
  const comment = addEventComment(req.params.id, author, text);
  persist();
  audit(req, 'comment', 'event', req.params.id, text.slice(0, 120));
  res.status(201).json({ comment });
});

/** Lịch sử phiên bản: ảnh chụp trước mỗi lần sửa/đổi trạng thái. */
router.get('/events/:id/versions', (req, res) => {
  if (!findEvent(req.params.id)) return res.status(404).json({ error: 'Không tìm thấy sự kiện' });
  const versions = getState().event_versions
    .filter((v) => v.event_id === req.params.id)
    .sort((a, b) => b.at.localeCompare(a.at));
  res.json({ versions });
});

// ---------------- Việc chuẩn bị (tasks) của một mục lịch ----------------

function findTask(ev: EventRecord, taskId: string): EventTask | undefined {
  return ev.tasks.find((t) => t.id === taskId);
}

/** Thêm một việc chuẩn bị: "soạn báo cáo", "in tài liệu 30 bản"... kèm người làm và hạn nộp. */
router.post('/events/:id/tasks', (req, res) => {
  const existing = findEvent(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy sự kiện' });
  const task = normalizeTask(req.body || {});
  if (!task) return res.status(422).json({ error: 'Thiếu nội dung việc cần chuẩn bị (text)' });
  if (existing.tasks.length >= EVENT_TASK_LIMIT) {
    return res.status(422).json({ error: `Mỗi mục lịch chỉ tối đa ${EVENT_TASK_LIMIT} việc chuẩn bị` });
  }
  mutate((s) => {
    const ev = s.events.find((e) => e.id === req.params.id)!;
    ev.tasks.push(task);
    ev.updated_at = new Date().toISOString();
  });
  audit(req, 'task_add', 'event', req.params.id, task.text);
  persist();
  res.status(201).json({ event: findEvent(req.params.id) });
});

/** Sửa hoặc đánh dấu hoàn thành một việc chuẩn bị. */
router.patch('/events/:id/tasks/:taskId', (req, res) => {
  const existing = findEvent(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy sự kiện' });
  if (!findTask(existing, req.params.taskId)) return res.status(404).json({ error: 'Không tìm thấy việc chuẩn bị' });
  const body = req.body || {};
  mutate((s) => {
    const ev = s.events.find((e) => e.id === req.params.id)!;
    const task = ev.tasks.find((t) => t.id === req.params.taskId)!;
    for (const key of ['text', 'owner', 'due_date'] as const) {
      if (typeof body[key] === 'string') (task as any)[key] = key === 'due_date'
        ? (/^\d{4}-\d{2}-\d{2}$/.test(body[key]) ? body[key] : '')
        : body[key].slice(0, key === 'text' ? 300 : 120).trim();
    }
    if (typeof body.done === 'boolean') {
      task.done = body.done;
      task.done_at = body.done ? new Date().toISOString() : null;
    }
    ev.updated_at = new Date().toISOString();
  });
  audit(req, 'task_update', 'event', req.params.id, `${req.params.taskId}${body.done === undefined ? '' : ` done=${body.done}`}`);
  persist();
  res.json({ event: findEvent(req.params.id) });
});

router.delete('/events/:id/tasks/:taskId', (req, res) => {
  const existing = findEvent(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy sự kiện' });
  if (!findTask(existing, req.params.taskId)) return res.status(404).json({ error: 'Không tìm thấy việc chuẩn bị' });
  const text = findTask(existing, req.params.taskId)!.text;
  mutate((s) => {
    const ev = s.events.find((e) => e.id === req.params.id)!;
    ev.tasks = ev.tasks.filter((t) => t.id !== req.params.taskId);
    ev.updated_at = new Date().toISOString();
  });
  audit(req, 'task_delete', 'event', req.params.id, text);
  persist();
  res.json({ event: findEvent(req.params.id) });
});

/**
 * Nhân bản mục lịch sang N tuần kế tiếp (sinh hoạt định kỳ: giao ban, tiếp công dân...).
 * Tuần đã có việc trùng tên+ngày sẽ bỏ qua; việc chuẩn bị được sao lại và đặt lại trạng thái "chưa xong".
 */
router.post('/events/:id/repeat', (req, res) => {
  const base = findEvent(req.params.id);
  if (!base) return res.status(404).json({ error: 'Không tìm thấy sự kiện' });
  const weeks = Math.min(Math.max(Number(req.body?.weeks ?? 3) || 3, 1), 26);
  const now = new Date().toISOString();
  const seriesId = base.series_id || newId('sr');
  const created: EventRecord[] = [];
  const skipped: string[] = [];

  mutate((s) => {
    if (base.id) {
      const origin = s.events.find((e) => e.id === req.params.id)!;
      origin.series_id = seriesId;
      origin.updated_at = now;
    }
    for (let w = 1; w <= weeks; w += 1) {
      const date = addDays(base.event_date, w * 7);
      const twin = s.events.find(
        (e) => e.event_date === date && e.status !== 'REJECTED' && e.title.trim().toLowerCase() === base.title.trim().toLowerCase()
      );
      if (twin) {
        skipped.push(`${formatDdMmYyyy(date)}: đã có "${twin.title}"`);
        continue;
      }
      const copy: EventRecord = {
        ...base,
        id: newId('ev'),
        event_date: date,
        series_id: seriesId,
        status: base.status === 'PUBLISHED' ? 'APPROVED' : base.status,
        tasks: base.tasks.map((t) => ({
          ...t,
          id: newId('tk'),
          done: false,
          done_at: null,
          due_date: t.due_date ? addDays(t.due_date, w * 7) : '',
        })),
        created_at: now,
        updated_at: now,
      };
      s.events.push(copy);
      created.push(copy);
    }
    s.conflicts = [
      ...s.conflicts.filter((c) => c.status === 'RESOLVED'),
      ...analyzeConflicts(s.events, s.settings.travel_buffers),
    ];
  });
  if (!created.length && !skipped.length) return res.status(422).json({ error: 'Chưa tạo bản lặp nào' });
  audit(req, 'repeat', 'event', req.params.id, `${created.length} bản lặp x${weeks} tuần`);
  if (created.length) {
    emit('event.created', {
      week_start: startOfWeek(created[0].event_date),
      week_end: addDays(startOfWeek(created[created.length - 1].event_date), 6),
      counts: { events: created.length },
      items: created.map(eventItem),
    });
  }
  persist();
  res.status(201).json({
    series_id: seriesId,
    created: created.map(eventBriefForResponse),
    skipped,
    open_conflicts: getState().conflicts.filter((c) => c.status === 'OPEN').length,
  });
});

function eventBriefForResponse(ev: EventRecord) {
  return { id: ev.id, event_date: ev.event_date, start_time: ev.start_time, title: ev.title, status: ev.status };
}

/** Xoá mềm: mục lịch chuyển vào thùng rác, khôi phục được trong 100 mục gần nhất. */
router.delete('/events/:id', (req, res) => {
  const existing = findEvent(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy sự kiện' });
  const ctx = authOf(req);
  const title = existing.title;
  mutate((s) => {
    const ev = s.events.find((e) => e.id === req.params.id)!;
    s.trash = [
      ...s.trash,
      { id: newId('tr'), deleted_at: new Date().toISOString(), deleted_by: ctx?.user.username ?? null, event: { ...ev } },
    ].slice(-TRASH_LIMIT);
    s.events = s.events.filter((e) => e.id !== req.params.id);
    s.conflicts = s.conflicts.filter((c) => c.event_id_1 !== req.params.id && c.event_id_2 !== req.params.id);
  });
  audit(req, 'delete', 'event', req.params.id, `${title} -> thùng rác`);
  persist();
  res.json({ deleted: req.params.id, in_trash: true });
});

// ---------------- Thùng rác ----------------

router.get('/trash', (_req, res) => {
  const rows = [...getState().trash]
    .sort((a, b) => b.deleted_at.localeCompare(a.deleted_at))
    .map((t) => ({
      id: t.id,
      deleted_at: t.deleted_at,
      deleted_by: t.deleted_by,
      event_id: t.event.id,
      title: t.event.title,
      event_date: t.event.event_date,
      start_time: t.event.start_time,
      location: t.event.location,
      chair: t.event.chair,
      status: t.event.status,
    }));
  res.json({ trash: rows, limit: TRASH_LIMIT });
});

/** Khôi phục mục đã xoá nhầm; nếu mục cùng id đã tồn tại thì cấp id mới để không đè lịch hiện hành. */
router.post('/trash/:id/restore', (req, res) => {
  const row = getState().trash.find((t) => t.id === req.params.id);
  if (!row) return res.status(404).json({ error: 'Không tìm thấy mục trong thùng rác' });
  const restoredId = getState().events.some((e) => e.id === row.event.id) ? newId('ev') : row.event.id;
  mutate((s) => {
    s.trash = s.trash.filter((t) => t.id !== req.params.id);
    s.events.push({ ...row.event, id: restoredId, updated_at: new Date().toISOString() });
  });
  audit(req, 'restore', 'event', restoredId, row.event.title);
  const open = refreshConflicts();
  persist();
  res.json({ event: findEvent(restoredId), open_conflicts: open });
});

/** Xoá vĩnh viễn một mục khỏi thùng rác. */
router.delete('/trash/:id', (req, res) => {
  const row = getState().trash.find((t) => t.id === req.params.id);
  if (!row) return res.status(404).json({ error: 'Không tìm thấy mục trong thùng rác' });
  mutate((s) => {
    s.trash = s.trash.filter((t) => t.id !== req.params.id);
  });
  audit(req, 'trash_purge', 'event', row.event.id, row.event.title);
  persist();
  res.json({ purged: req.params.id });
});

router.delete('/trash', (req, res) => {
  const count = getState().trash.length;
  mutate((s) => {
    s.trash = [];
  });
  audit(req, 'trash_empty', 'store', '', `${count} mục`);
  persist();
  res.json({ removed: count });
});

// ---------------- Nhập lịch .ics (Google Calendar / Outlook) ----------------

router.post('/import/ics', (req, res) => {
  const fileName = String(req.body?.file_name || 'lich.ics');
  const base64 = String(req.body?.content_base64 || '');
  const text = base64 ? Buffer.from(base64, 'base64').toString('utf8') : String(req.body?.content_text || '');
  if (!/BEGIN:VCALENDAR/i.test(text)) {
    return res.status(422).json({ error: 'Tệp không phải lịch .ics (thiếu BEGIN:VCALENDAR)' });
  }
  const maxBytes = Number(process.env.MAX_UPLOAD_MB || 20) * 1024 * 1024;
  if (Buffer.byteLength(text, 'utf8') > maxBytes) return res.status(413).json({ error: 'Tệp .ics vượt dung lượng cho phép' });

  const from = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.from || '')) ? String(req.body.from) : '';
  const to = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.to || '')) ? String(req.body.to) : '';
  const parsed = parseIcsCalendar(text);
  const now = new Date().toISOString();
  const drafts: EventRecord[] = [];
  let cancelled = 0;
  let outOfRange = 0;

  for (const occ of parsed.occurrences) {
    if (occ.cancelled) {
      cancelled += 1;
      continue;
    }
    if ((from && occ.event_date < from) || (to && occ.event_date > to)) {
      outOfRange += 1;
      continue;
    }
    const preparation = extractPreparation(`${occ.title} ${occ.content}`);
    const people = occ.participants || occ.organizer;
    drafts.push({
      id: newId('ev'),
      source_id: null,
      source_document: `Lịch .ics: ${fileName}`,
      source_page: null,
      source_paragraph: null,
      event_date: occ.event_date,
      start_time: occ.start_time,
      end_time: occ.end_time,
      title: occ.title.slice(0, 200),
      content: occ.content || occ.title,
      chair: '',
      participants: people,
      participant_group: '',
      location: occ.location,
      organizer: occ.organizer,
      preparation,
      documents_required: '',
      contact_person: '',
      priority_score: scorePriority({ title: occ.title, content: occ.content, participants: people }),
      confidence: occ.all_day ? 0.6 : 0.85,
      status: 'PROPOSED',
      missing_data_fields: [
        ...new Set([
          'chair',
          ...(occ.all_day ? ['start_time'] : []),
          ...(occ.end_time ? [] : ['end_time']),
          ...(occ.location ? [] : ['location']),
        ]),
      ],
      leaders: extractLeaders('', people),
      also_from: [],
      tasks: [],
      series_id: null,
      created_at: now,
      updated_at: now,
    });
  }

  const inserted: EventRecord[] = [];
  let mergedCount = 0;
  mutate((s) => {
    const result = upsertEvents(s, drafts);
    inserted.push(...result.inserted);
    mergedCount = result.merged.length;
    s.conflicts = [
      ...s.conflicts.filter((c) => c.status === 'RESOLVED'),
      ...analyzeConflicts(s.events, s.settings.travel_buffers),
    ];
  });
  audit(req, 'import_ics', 'store', fileName, `${inserted.length} mới, ${mergedCount} gộp, ${cancelled} đã huỷ`);
  persist();
  res.json({
    parsed_events: parsed.occurrences.length,
    imported: inserted.map(eventBriefForResponse),
    merged: mergedCount,
    cancelled_skipped: cancelled,
    out_of_range_skipped: outOfRange,
    notes: parsed.skipped.slice(0, 20),
    open_conflicts: getState().conflicts.filter((c) => c.status === 'OPEN').length,
  });
});

function normalizeTimeInput(value: unknown): number | null {
  const text = String(value ?? '');
  if (/^\d{1,2}$/.test(text)) return Number(text) * 60;
  return parseClock(text);
}

// ---------------- Sources ----------------

router.get('/sources', (_req, res) => {
  res.json({
    sources: getState().sources.map((s) => ({ ...s, raw_text: undefined, chars: (s.raw_text || '').length })),
  });
});

router.post('/sources/paste', (req, res) => {
  const title = String(req.body?.title || '').trim();
  const content = String(req.body?.content || '').trim();
  if (!title || !content) return res.status(422).json({ error: 'Cần cả title và content' });
  const hash = contentFingerprint(content);
  const duplicate = findDuplicateSource(hash);
  if (duplicate && !req.body?.allow_duplicate) {
    return res.status(409).json({
      error: `Nội dung này đã có trong kho với tên "${duplicate.file_name}". Không nạp lại để tránh trùng lịch.`,
      code: 'DUPLICATE_SOURCE',
      duplicate_source: { id: duplicate.id, file_name: duplicate.file_name },
    });
  }
  const source = {
    id: newId('s'),
    file_name: title,
    source_type: String(req.body?.source_type || 'ghi_chu'),
    priority_level: Number(req.body?.priority_level ?? 60),
    uploaded_at: new Date().toISOString(),
    file_size: Buffer.byteLength(content, 'utf8'),
    parse_status: 'PENDING' as const,
    notes: String(req.body?.notes || 'Dán thủ công'),
    raw_text: content,
    content_hash: hash,
  };
  mutate((s) => {
    s.sources.push(source);
  });
  audit(req, 'create', 'source', source.id, `${title} (${source.raw_text.length} ký tự)`);
  persist();
  res.status(201).json({ source: { ...source, raw_text: undefined } });
});

router.delete('/sources/:id', (req, res) => {
  if (!getState().sources.some((s) => s.id === req.params.id)) {
    return res.status(404).json({ error: 'Không tìm thấy nguồn' });
  }
  mutate((s) => {
    s.sources = s.sources.filter((x) => x.id !== req.params.id);
  });
  audit(req, 'delete', 'source', req.params.id, '');
  persist();
  res.json({ deleted: req.params.id });
});

/** Bóc tách riêng một văn bản nguồn thành các sự kiện PROPOSED. */
router.post('/sources/:id/extract', async (req, res) => {
  const source = getState().sources.find((s) => s.id === req.params.id);
  if (!source) return res.status(404).json({ error: 'Không tìm thấy nguồn' });
  const week = weekParam(req);
  try {
    res.json(await runSourceExtraction(source.id, week, req));
  } catch (err) {
    return failAi(res, err);
  }
  return undefined;
});

// ---------------- Conflicts ----------------

/** Tìm khung giờ trống cho một người/địa điểm trong ngày. */
router.get('/calendar/free-slots', (req, res) => {
  const date = String(req.query.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(422).json({ error: 'date phải theo định dạng YYYY-MM-DD' });
  const s = getState();
  const people = String(req.query.people || '').split(/[,;]/).map((p) => p.trim()).filter(Boolean);
  const slots = findFreeSlots({
    date,
    durationMinutes: Number(req.query.duration) || 90,
    workingHours: s.settings.working_hours,
    events: s.events,
    buffers: s.settings.travel_buffers,
    people,
    location: String(req.query.location || ''),
    preferStart: String(req.query.prefer_start || '') || undefined,
    limit: Math.min(Number(req.query.limit) || 5, 12),
  });
  res.json({ date, people, slots });
});

/** Kế hoạch xử lý xung đột: giữ việc ưu tiên cao, dời việc thấp sang khung trống. */
router.post('/conflicts/auto-plan', (req, res) => {
  const week = weekParam(req);
  const s = getState();
  const weekEvents = s.events.filter((e) => e.event_date >= week.start && e.event_date <= week.end);
  const ids = new Set(weekEvents.map((e) => e.id));
  const open = s.conflicts.filter((c) => c.status === 'OPEN' && (ids.has(c.event_id_1) || ids.has(c.event_id_2)));
  const plans = planConflictResolutions(
    s.events,
    open,
    s.settings.working_hours,
    s.settings.travel_buffers,
    { maxDaysAhead: Math.min(Math.max(Number(req.body?.days_ahead ?? 3), 0), 7), optionsPerConflict: 3 }
  );
  res.json({ week: { start: week.start, end: week.end }, plans, open_conflicts: open.length });
});

router.post('/conflicts/reanalyze', (req, res) => {
  const week = weekParam(req);
  const open = refreshConflicts();
  const ids = new Set(getState().events.filter((e) => e.event_date >= week.start && e.event_date <= week.end).map((e) => e.id));
  res.json({
    open_conflicts: open,
    conflicts: getState().conflicts.filter((c) => c.status === 'OPEN' && (ids.has(c.event_id_1) || ids.has(c.event_id_2))),
  });
});

router.post('/conflicts/:id/resolve', (req, res) => {
  if (!getState().conflicts.some((c) => c.id === req.params.id)) {
    return res.status(404).json({ error: 'Không tìm thấy xung đột' });
  }
  mutate((s) => {
    const c = s.conflicts.find((x) => x.id === req.params.id)!;
    c.status = 'RESOLVED';
    if (req.body?.resolution) c.resolution_suggestion = String(req.body.resolution);
  });
  audit(req, 'resolve', 'conflict', req.params.id, String(req.body?.resolution || ''));
  persist();
  res.json({ resolved: req.params.id });
});

// ---------------- Settings, personnel, memory ----------------

router.get('/settings', (_req, res) => {
  const s = getState();
  res.json({ settings: s.settings, personnel: s.personnel, memory_rows: s.memory.length });
});

router.put('/settings', (req, res) => {
  mutate((s) => {
    const body = req.body || {};
    if (body.unit_name) s.settings.unit_name = String(body.unit_name);
    if (body.parent_org !== undefined) s.settings.parent_org = String(body.parent_org);
    if (body.advisor_unit !== undefined) s.settings.advisor_unit = String(body.advisor_unit);
    if (body.document_number !== undefined) s.settings.document_number = String(body.document_number);
    if (body.signer !== undefined) s.settings.signer = String(body.signer);
    if (body.officer_name !== undefined) s.settings.officer_name = String(body.officer_name);
    if (body.officer_role !== undefined) s.settings.officer_role = String(body.officer_role);
    if (body.travel_buffers) s.settings.travel_buffers = { ...s.settings.travel_buffers, ...body.travel_buffers };
    if (body.working_hours && typeof body.working_hours === 'object') {
      const wh = body.working_hours;
      const next = { ...s.settings.working_hours };
      for (const key of ['morning_start', 'morning_end', 'afternoon_start', 'afternoon_end'] as const) {
        if (/^\d{2}:\d{2}$/.test(String(wh[key] || ''))) next[key] = String(wh[key]);
      }
      if (Array.isArray(wh.workdays)) {
        const days = wh.workdays.map(Number).filter((d: number) => Number.isInteger(d) && d >= 0 && d <= 6);
        if (days.length) next.workdays = [...new Set<number>(days)];
      }
      s.settings.working_hours = next;
    }
  });
  audit(req, 'update', 'settings', 'settings', Object.keys(req.body || {}).join(', '));
  persist();
  const open = refreshConflicts();
  res.json({ settings: getState().settings, open_conflicts: open });
});

// ---------------- Nhận diện thành phần Ban Xây dựng Đảng ----------------

const GROUP_IDS = new Set(PARTY_SIGNAL_GROUPS.map((g) => g.id));

/** Chặn chuỗi dài bất định từ client trước khi đưa vào bộ máy nhận diện. */
function cleanSignalList(raw: unknown, maxLength = 80): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw
    .map((item) => String(item ?? '').trim().slice(0, maxLength))
    .filter(Boolean))].slice(0, 100);
}

function cleanKeywordMap(raw: unknown): Record<string, string[]> {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: Record<string, string[]> = {};
  for (const [group, values] of Object.entries(input)) {
    if (!GROUP_IDS.has(group)) continue;
    const list = cleanSignalList(values, 60);
    if (list.length) out[group] = list.slice(0, 20);
  }
  return out;
}

function cleanAssignmentMap(raw: unknown): Record<string, string[]> {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: Record<string, string[]> = {};
  for (const [group, values] of Object.entries(input)) {
    if (!GROUP_IDS.has(group)) continue;
    const list = cleanSignalList(values, 40);
    if (list.length) out[group] = list.slice(0, 4);
  }
  return out;
}

router.get('/signals/config', (_req, res) => {
  const s = getState();
  res.json({
    groups: PARTY_SIGNAL_GROUPS.map((g) => ({
      id: g.id, label: g.label, base_level: g.base_level, rationale: g.rationale, patterns: g.patterns,
    })),
    disabled_groups: s.settings.signal_disabled_groups,
    extra_keywords: s.settings.signal_extra_keywords,
    learned_assignments: s.settings.signal_learned_assignments,
    personnel: s.personnel,
    advisor_unit: advisorUnitName(s.settings),
  });
});

router.patch('/signals/config', (req, res) => {
  const body = req.body || {};
  mutate((s) => {
    if (body.disabled_groups !== undefined) {
      s.settings.signal_disabled_groups = cleanSignalList(body.disabled_groups, 40).filter((id) => GROUP_IDS.has(id));
    }
    if (body.extra_keywords !== undefined) s.settings.signal_extra_keywords = cleanKeywordMap(body.extra_keywords);
    if (body.learned_assignments !== undefined) s.settings.signal_learned_assignments = cleanAssignmentMap(body.learned_assignments);
  });
  audit(req, 'update', 'signals_config', 'signals', '');
  persist();
  const s = getState();
  res.json({
    disabled_groups: s.settings.signal_disabled_groups,
    extra_keywords: s.settings.signal_extra_keywords,
    learned_assignments: s.settings.signal_learned_assignments,
  });
});

/**
 * Chạy bộ nhận diện trên một tuần (hoặc trên các mục trích từ một văn bản nguồn).
 * Chỉ đọc và đề xuất — không ghi lịch, không phê duyệt.
 */
router.post('/signals/detect', (req, res) => {
  const s = getState();
  const week = startOfWeek(String(req.body?.week_start || todayIso()));
  const end = addDays(week, 6);
  const sourceId = String(req.body?.source_id || '');
  const scoped = sourceId
    ? s.events.filter((e) => e.source_id === sourceId)
    : s.events.filter((e) => e.event_date >= week && e.event_date <= end);
  if (!scoped.length) {
    return res.status(404).json({
      error: sourceId ? 'Văn bản nguồn này chưa có mục lịch nào được bóc tách.' : 'Trong tuần chưa có mục lịch nào để nhận diện.',
      code: 'NOTHING_TO_DETECT',
    });
  }
  const roster = rosterFromPersonnel(s.personnel);
  if (!roster.length) {
    return res.status(400).json({
      error: 'Chưa có danh bạ cán bộ Ban Xây dựng Đảng. Hãy thêm người trong mục Danh bạ cán bộ trước khi chạy nhận diện.',
      code: 'EMPTY_ROSTER',
    });
  }
  const result = runPartyDetection(scoped, {
    roster,
    disabledGroups: s.settings.signal_disabled_groups,
    extraKeywords: s.settings.signal_extra_keywords,
    learnedAssignments: s.settings.signal_learned_assignments,
    existingEvents: s.events.filter((e) => e.event_date >= week && e.event_date <= end),
    relevantOnly: req.body?.relevant_only !== false,
  });
  audit(req, 'detect', 'signals', sourceId || week, `${result.stats.total} đề xuất, mức A ${result.stats.by_level.A}`);
  return res.json({
    week_start: week,
    week_end: end,
    roster: roster.map((p) => ({ id: p.id, name: p.name, title: p.title, role_description: p.role_description })),
    ...result,
  });
});

/** Học quy tắc phân công từ các mục lịch đã duyệt/công bố trong tuần được chọn. */
router.post('/signals/learn', (req, res) => {
  const s = getState();
  const week = startOfWeek(String(req.body?.week_start || todayIso()));
  const approved = s.events.filter((e) => e.status === 'APPROVED' || e.status === 'PUBLISHED');
  if (!approved.length) {
    return res.status(404).json({ error: 'Chưa có mục lịch nào ở trạng thái đã duyệt hoặc đã ban hành để học theo.', code: 'NO_APPROVED' });
  }
  const roster = rosterFromPersonnel(s.personnel);
  const incoming = learnAssignments(approved, roster);
  const merged = mergeLearnedRules(s.settings.signal_learned_assignments, incoming);
  mutate((state) => { state.settings.signal_learned_assignments = merged; });
  audit(req, 'learn', 'signals', week, `${Object.keys(merged).length} nhóm có quy tắc`);
  persist();
  return res.json({ ok: true, learned_assignments: merged, approved_count: approved.length });
});

// ---------------- Danh bạ cán bộ Ban (nguồn dữ liệu cho nhận diện) ----------------

const PERSONNEL_LIMIT = 200;

function personnelPayload(body: any) {
  const name = String(body?.name ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
  const title = String(body?.title ?? '').trim().slice(0, 120);
  const role = String(body?.role_description ?? '').trim().slice(0, 300);
  const active = body?.is_active === undefined ? 1 : (body.is_active ? 1 : 0);
  return { name, title, role, active, error: name.length < 2 ? 'Họ tên cán bộ cần tối thiểu 2 ký tự' : '' };
}

router.post('/personnel', (req, res) => {
  const s = getState();
  const { name, title, role, active, error } = personnelPayload(req.body);
  if (error) return res.status(400).json({ error });
  if (s.personnel.length >= PERSONNEL_LIMIT) {
    return res.status(400).json({ error: `Danh bạ chỉ giữ tối đa ${PERSONNEL_LIMIT} người.` });
  }
  if (s.personnel.some((p) => canonicalPersonName(p.name) === canonicalPersonName(name))) {
    return res.status(409).json({ error: 'Danh bạ đã có người trùng họ tên (kể cả khi ghi kèm lời gọi "đ/c").' });
  }
  const person = { id: newId('pr'), name, title, role_description: role, is_active: active };
  mutate((state) => { state.personnel.push(person); });
  audit(req, 'create', 'personnel', person.id, `${name} — ${title}`);
  persist();
  return res.status(201).json({ person });
});

router.patch('/personnel/:id', (req, res) => {
  const s = getState();
  const target = s.personnel.find((p) => p.id === req.params.id);
  if (!target) return res.status(404).json({ error: 'Không tìm thấy cán bộ trong danh bạ' });
  const { name, title, role, active, error } = personnelPayload({ ...target, is_active: target.is_active, ...req.body });
  if (error) return res.status(400).json({ error });
  if (s.personnel.some((p) => p.id !== target.id && canonicalPersonName(p.name) === canonicalPersonName(name))) {
    return res.status(409).json({ error: 'Danh bạ đã có người khác trùng họ tên này.' });
  }
  mutate((state) => {
    const person = state.personnel.find((p) => p.id === target.id);
    if (!person) return;
    person.name = name;
    person.title = title;
    person.role_description = role;
    person.is_active = active;
  });
  audit(req, 'update', 'personnel', target.id, name);
  persist();
  return res.json({ person: getState().personnel.find((p) => p.id === target.id) });
});

router.delete('/personnel/:id', (req, res) => {
  const target = getState().personnel.find((p) => p.id === req.params.id);
  if (!target) return res.status(404).json({ error: 'Không tìm thấy cán bộ trong danh bạ' });
  mutate((state) => {
    state.personnel = state.personnel.filter((p) => p.id !== target.id);
    for (const [group, ids] of Object.entries(state.settings.signal_learned_assignments)) {
      const kept = ids.filter((id) => id !== target.id);
      if (kept.length) state.settings.signal_learned_assignments[group] = kept;
      else delete state.settings.signal_learned_assignments[group];
    }
  });
  audit(req, 'delete', 'personnel', target.id, target.name);
  persist();
  return res.json({ deleted: target.id });
});

// ---------------- Lịch nội bộ Ban Xây dựng Đảng ----------------

router.get('/agency', (req, res) => {
  const s = getState();
  const { start: week, end } = weekParam(req);
  const weekNo = isoWeekNumber(week);
  const rows = s.agency_schedules
    .filter((a) => (a.event_date ? a.event_date >= week && a.event_date <= end : a.week_number === weekNo))
    .sort((a, b) => a.event_date.localeCompare(b.event_date) || a.sort_order - b.sort_order);
  res.json({
    week_start: week,
    week_number: weekNo,
    items: rows,
    personnel: s.personnel,
    memory: s.memory,
    advisor_unit: advisorUnitName(s.settings),
    advisor_head: agencyHeadLines(s.settings),
  });
});

router.post('/agency', (req, res) => {
  const body = req.body || {};
  const week = startOfWeek(String(body.event_date || todayIso()));
  const now = new Date().toISOString();
  const item = {
    id: newId('as'),
    week_number: isoWeekNumber(week),
    year: Number(week.slice(0, 4)),
    date_range: `${formatDdMmYyyy(week)} – ${formatDdMmYyyy(addDays(week, 6))}`,
    day_of_week: String(body.day_of_week || WEEKDAY_FULL[fromIso(String(body.event_date || week)).getDay()]),
    event_date: String(body.event_date || week),
    time_slot: String(body.time_slot || ''),
    content: String(body.content || ''),
    executor: String(body.executor || ''),
    attendees: String(body.attendees || ''),
    location: String(body.location || ''),
    source_id: body.source_id ?? null,
    source_document: String(body.source_document || 'Đăng ký nội bộ'),
    source_page_para: '',
    source_original_content: '',
    relevance_category: 'INTERNAL',
    relevance_reason: String(body.relevance_reason || 'Nhiệm vụ nội bộ Ban'),
    approval_status: 'DRAFT',
    conflict_warnings: [],
    diff_notes: '',
    is_internal: true,
    sort_order: Number(body.sort_order ?? getState().agency_schedules.length + 1),
    created_at: now,
    updated_at: now,
  };
  if (!item.content) return res.status(422).json({ error: 'content là bắt buộc' });
  mutate((s) => {
    s.agency_schedules.push(item);
  });
  audit(req, 'create', 'agency', item.id, item.content.slice(0, 60));
  persist();
  res.status(201).json({ item });
});

router.patch('/agency/:id', (req, res) => {
  if (!getState().agency_schedules.some((a) => a.id === req.params.id)) {
    return res.status(404).json({ error: 'Không tìm thấy công việc nội bộ' });
  }
  const allowed = ['time_slot', 'content', 'executor', 'attendees', 'location', 'approval_status', 'event_date', 'relevance_category', 'relevance_reason', 'diff_notes', 'sort_order'];
  const changes: string[] = [];
  mutate((s) => {
    const item = s.agency_schedules.find((a) => a.id === req.params.id)!;
    for (const key of allowed) {
      if (key in req.body && req.body[key] !== (item as any)[key]) {
        (item as any)[key] = req.body[key];
        changes.push(key);
      }
    }
    item.updated_at = new Date().toISOString();
  });
  audit(req, 'update', 'agency', req.params.id, changes.join(', ') || 'không thay đổi');
  persist();
  res.json({ item: getState().agency_schedules.find((a) => a.id === req.params.id), updated_fields: changes });
});

router.delete('/agency/:id', (req, res) => {
  if (!getState().agency_schedules.some((a) => a.id === req.params.id)) {
    return res.status(404).json({ error: 'Không tìm thấy công việc nội bộ' });
  }
  mutate((s) => {
    s.agency_schedules = s.agency_schedules.filter((a) => a.id !== req.params.id);
  });
  audit(req, 'delete', 'agency', req.params.id, '');
  persist();
  res.json({ deleted: req.params.id });
});

/** Rà soát chất lượng: dùng AI đối chiếu từng công việc nội bộ với văn bản nguồn. */
router.post('/agency/qc-review', async (req, res) => {
  const items = getState().agency_schedules.filter((a) => String(req.body?.ids || '').length === 0 || (req.body.ids as string[]).includes(a.id));
  const sources = getState().sources;
  try {
    const data = await askJson<{ findings?: { id: string; warning: string; severity?: string }[] }>({
      label: 'agency-qc',
      temperature: 0.1,
      systemInstruction: `
Bạn kiểm tra chất lượng lịch nội bộ Ban Xây dựng Đảng. Với mỗi công việc, đối chiếu với văn bản nguồn
và nêu vấn đề: thiếu căn cứ văn bản, trùng giờ với lịch cấp trên, người thực hiện không phù chức danh,
thiếu địa điểm hoặc giờ ghi không rõ. Trả về JSON {"findings":[{"id":"<id công việc>","warning":"...","severity":"WARNING|ERROR"}]}.
Không bịa vấn đề khi công việc đã hợp lệ — trả về mảng rỗng.
`.trim(),
      prompt: `Công việc: ${JSON.stringify(items.map((a) => ({ id: a.id, date: a.event_date, time: a.time_slot, content: a.content, executor: a.executor, source: a.source_document, internal: a.is_internal })))}
Lịch cấp trên/cấp ủy cùng giai đoạn: ${JSON.stringify(sources.map((s) => s.file_name))}`,
    });
    const findings = Array.isArray(data.findings) ? data.findings : [];
    mutate((s) => {
      for (const f of findings) {
        const item = s.agency_schedules.find((a) => a.id === f.id);
        if (item && f.warning) item.conflict_warnings = [String(f.warning)];
      }
    });
    audit(req, 'qc_review', 'agency', String(items.length), `${findings.length} cảnh báo`);
    persist();
    res.json({ reviewed: items.length, findings });
  } catch (err) {
    return failAi(res, err);
  }
  return undefined;
});

/** Lập dự thảo lịch nội bộ Ban từ toàn bộ văn bản nguồn đang có trong hệ thống. */
router.post('/agency/ai-draft', async (req, res) => {
  const { start: weekStart, end: weekEnd } = weekParam(req);
  const state = getState();
  const docs = state.sources
    .filter((s) => (s.raw_text || '').trim().length > 40)
    .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at))
    .slice(0, 5);
  if (docs.length === 0) {
    return res.status(422).json({ error: 'Chưa có văn bản nguồn nào đủ dài để bóc tách. Hãy tải lịch cấp ủy lên trước.' });
  }
  const corpus = docs.map((d) => `【${d.file_name}】\n${(d.raw_text || '').slice(0, 4000)}`).join('\n\n');
  const examples = state.memory.slice(-6);
  try {
    const data = await askJson<{ items?: Record<string, any>[] }>({
      label: 'agency-draft',
      temperature: 0.1,
      systemInstruction: `
Bạn lập lịch nội bộ Ban Xây dựng Đảng cho một tuần công tác, dựa trên các văn bản cấp ủy trong hệ thống.
Với mỗi đầu việc, chọn người thực hiện (executor) và người tham dự (attendees) theo đúng chức danh trong
danh sách cán bộ của Ban; bám theo các ví dụ phân công đã được phê duyệt trước đây.
Trả về JSON: {"items":[{"event_date":"YYYY-MM-DD","time_slot":"08 giờ 00","content":"...","executor":"...",
"attendees":"...","location":"...","source_document":"<tên văn bản chứa đầu việc>","relevance_category":"MANDATORY|PROPOSED|INTERNAL","relevance_reason":"..."}]}
Chỉ lấy việc CÓ TRONG văn bản, ngày phải thuộc tuần yêu cầu. Không có việc nào thì trả items = [].
`.trim(),
      prompt: `Tuần công tác: ${formatDdMmYyyy(weekStart)} – ${formatDdMmYyyy(weekEnd)} (event_date từ ${weekStart} đến ${weekEnd}).
Cán bộ Ban: ${JSON.stringify(state.personnel.map((p) => ({ name: p.name, title: p.title, role: p.role_description })))}
Ví dụ phân công đã phê duyệt: ${JSON.stringify(examples.map((m) => ({ van_ban: m.source_text, giao: m.assigned_executor, du: m.assigned_attendees, ly_do: m.reason })))}

VĂN BẢN NGUỒN:
${corpus.slice(0, MAX_PROMPT_CHARS)}`,
    });
    const rawItems = Array.isArray(data.items) ? data.items : [];
    const created: Record<string, unknown>[] = [];
    const now = new Date().toISOString();
    mutate((s) => {
      for (const item of rawItems) {
        const eventDate = /^\d{4}-\d{2}-\d{2}$/.test(String(item.event_date || '')) ? String(item.event_date) : weekStart;
        if (eventDate < weekStart || eventDate > weekEnd) continue;
        const fileName = String(item.source_document || docs[0].file_name);
        created.push({
          id: newId('as'),
          week_number: isoWeekNumber(weekStart),
          year: Number(weekStart.slice(0, 4)),
          date_range: `${formatDdMmYyyy(weekStart)} – ${formatDdMmYyyy(weekEnd)}`,
          day_of_week: WEEKDAY_FULL[fromIso(eventDate).getDay()],
          event_date: eventDate,
          time_slot: String(item.time_slot || ''),
          content: String(item.content || '').trim(),
          executor: String(item.executor || ''),
          attendees: String(item.attendees || ''),
          location: String(item.location || ''),
          source_id: s.sources.find((x) => x.file_name === fileName)?.id ?? null,
          source_document: fileName,
          source_page_para: '',
          source_original_content: '',
          relevance_category: String(item.relevance_category || 'PROPOSED'),
          relevance_reason: String(item.relevance_reason || ''),
          approval_status: 'AI_PARSED',
          conflict_warnings: [],
          diff_notes: examples.length ? `Đối chiếu ${examples.length} phân công cũ` : 'Chưa có dữ liệu học trước',
          is_internal: false,
          sort_order: s.agency_schedules.length + 1,
          created_at: now,
          updated_at: now,
        });
      }
      for (const item of created) {
        s.agency_schedules.push(item as any);
        s.memory.push({
          id: newId('mem'),
          source_text: String((item as any).source_document),
          agency_content: String((item as any).content),
          decision_action: 'AI_PARSED',
          assigned_executor: String((item as any).executor),
          assigned_attendees: String((item as any).attendees),
          reason: String((item as any).relevance_reason),
          week_num: isoWeekNumber(weekStart),
          created_at: now,
        });
      }
    });
    audit(req, 'agency_ai_draft', 'agency', weekStart, `${created.length} công việc`);
    persist();
    res.json({
      created: created.length,
      items: created,
      documents: docs.map((d) => d.file_name),
      message: created.length
        ? `AI đã lập ${created.length} công việc cho Ban từ ${docs.length} văn bản nguồn.`
        : `Không tìm thấy đầu việc nào của Ban trong ${docs.length} văn bản nguồn của tuần này.`,
    });
  } catch (err) {
    return failAi(res, err);
  }
  return undefined;
});

/** Đối soát phi AI: kiểm mỗi công việc nội bộ có trích được từ văn bản nguồn hay không. */
router.post('/agency/trace-check', (req, res) => {
  const { start: weekStart, end: weekEnd } = weekParam(req);
  const state = getState();
  const items = state.agency_schedules.filter((a) => a.event_date >= weekStart && a.event_date <= weekEnd);
  const norm = (s: string) =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase();
  const tokens = (s: string) => norm(s).split(/[^a-z0-9]+/).filter((t) => t.length >= 4);
  const docs = state.sources.filter((s) => (s.raw_text || '').trim().length > 40);
  const results = items.map((item) => {
    const words = tokens(item.content);
    if (docs.length === 0 || words.length === 0) {
      return {
        id: item.id, content: item.content, status: 'NO_SOURCE', score: 0,
        source_document: item.source_document, excerpt: '', missing_terms: [],
        note: docs.length === 0 ? 'Hệ thống chưa có văn bản nguồn nào có nội dung để đối chiếu.' : 'Nội dung công việc quá ngắn để so khớp.',
      };
    }
    const scored = docs
      .map((doc) => {
        const hay = norm(doc.raw_text);
        const hits = words.filter((w) => hay.includes(w)).length;
        return { doc, hay, score: Math.round((hits / words.length) * 100) };
      })
      .sort((a, b) => b.score - a.score);
    const preferred = scored.find((c) => c.doc.id === item.source_id || c.doc.file_name === item.source_document);
    const chosen = preferred && preferred.score >= scored[0].score - 5 ? preferred : scored[0];
    const bestLine = chosen.doc.raw_text.split(/\r?\n/)
      .map((line) => ({ line, hits: tokens(line).filter((w) => words.includes(w)).length }))
      .sort((a, b) => b.hits - a.hits)[0];
    const status = chosen.score >= 70 ? 'MATCHED' : chosen.score >= 40 ? 'PARTIAL' : 'NOT_FOUND';
    return {
      id: item.id, content: item.content, status, score: chosen.score,
      source_document: chosen.doc.file_name,
      excerpt: bestLine && bestLine.hits > 0 ? bestLine.line.trim().slice(0, 240) : '',
      missing_terms: words.filter((w) => !chosen.hay.includes(w)).slice(0, 8),
      note: chosen.doc.file_name !== item.source_document ? `Không thấy văn bản "${item.source_document}", đã so với "${chosen.doc.file_name}"` : '',
    };
  });
  const notes = new Map(results.map((r) => [r.id, `${r.status} ${r.score}%${r.excerpt ? ` · "${r.excerpt}"` : ''}`]));
  mutate((s) => {
    for (const item of s.agency_schedules) {
      const note = notes.get(item.id);
      if (note) item.diff_notes = note;
    }
  });
  persist();
  audit(req, 'trace_check', 'agency', weekStart, `${results.filter((r) => r.status === 'MATCHED').length}/${results.length} khớp`);
  res.json({
    checked: results.length,
    documents: docs.length,
    matched: results.filter((r) => r.status === 'MATCHED').length,
    partial: results.filter((r) => r.status === 'PARTIAL').length,
    not_found: results.filter((r) => r.status === 'NOT_FOUND').length,
    no_source: results.filter((r) => r.status === 'NO_SOURCE').length,
    results,
  });
});

/** Bóc tách văn bản Đảng thành công việc nội bộ Ban, có tham khảo trí nhớ phân công. */
router.post('/agency/analyze-file', async (req, res) => {
  const fileName = String(req.body?.file_name || '').trim();
  const direct = String(req.body?.file_content || '').trim();
  let content = direct;
  if (!content && req.body?.content_base64) content = (await extractTextAsync(fileName, Buffer.from(String(req.body.content_base64), 'base64'))).text;
  if (!fileName || content.length < 40) {
    return res.status(422).json({ error: 'Cần tên tệp và nội dung văn bản (tối thiểu 40 ký tự).' });
  }
  const { start: weekStart, end: weekEnd } = weekParam(req);
  const state = getState();
  const examples = state.memory.slice(-6);
  try {
    const data = await askJson<{ items?: Record<string, any>[] }>({
      label: 'agency-analyze',
      temperature: 0.1,
      systemInstruction: `
Bạn lập lịch nội bộ Ban Xây dựng Đảng từ văn bản cấp ủy. Với mỗi đầu việc trong văn bản,
chọn người thực hiện (executor) và người tham dự (attendees) theo đúng chức danh trong danh sách
cán bộ của Ban; ưu tiên bám theo các ví dụ phân công đã được phê duyệt trước đây.
Trả về JSON: {"items":[{"event_date":"YYYY-MM-DD","time_slot":"08 giờ 00","content":"...","executor":"...",
"attendees":"...","location":"...","relevance_category":"MANDATORY|PROPOSED|INTERNAL","relevance_reason":"..."}]}
Chỉ lấy việc CÓ TRONG văn bản. Không có việc nào thì trả items = [].
`.trim(),
      prompt: `Giai đoạn: ${formatDdMmYyyy(weekStart)} – ${formatDdMmYyyy(weekEnd)}
Cán bộ Ban: ${JSON.stringify(state.personnel.map((p) => ({ name: p.name, title: p.title, role: p.role_description })))}
Ví dụ phân công đã phê duyệt: ${JSON.stringify(examples.map((m) => ({ van_ban: m.source_text, giao: m.assigned_executor, du: m.assigned_attendees, ly_do: m.reason })))}

VĂN BẢN (${fileName}):
${content.slice(0, MAX_PROMPT_CHARS)}`,
    });
    const rawItems = Array.isArray(data.items) ? data.items : [];
    const created: Record<string, unknown>[] = [];
    const now = new Date().toISOString();
    mutate((s) => {
      for (const item of rawItems) {
        const eventDate = /^\d{4}-\d{2}-\d{2}$/.test(String(item.event_date || '')) ? String(item.event_date) : weekStart;
        if (eventDate < weekStart || eventDate > weekEnd) continue;
        created.push({
          id: newId('as'),
          week_number: isoWeekNumber(weekStart),
          year: Number(weekStart.slice(0, 4)),
          date_range: `${formatDdMmYyyy(weekStart)} – ${formatDdMmYyyy(weekEnd)}`,
          day_of_week: WEEKDAY_FULL[fromIso(eventDate).getDay()],
          event_date: eventDate,
          time_slot: String(item.time_slot || ''),
          content: String(item.content || '').trim(),
          executor: String(item.executor || ''),
          attendees: String(item.attendees || ''),
          location: String(item.location || ''),
          source_id: s.sources.find((x) => x.file_name === fileName)?.id ?? null,
          source_document: fileName,
          source_page_para: '',
          source_original_content: content.slice(0, 300),
          relevance_category: String(item.relevance_category || 'PROPOSED'),
          relevance_reason: String(item.relevance_reason || ''),
          approval_status: 'AI_PARSED',
          conflict_warnings: [],
          diff_notes: examples.length ? `Đối chiếu ${examples.length} phân công cũ` : 'Chưa có dữ liệu học trước',
          is_internal: false,
          sort_order: s.agency_schedules.length + 1,
          created_at: now,
          updated_at: now,
        });
      }
      for (const item of created) {
        s.agency_schedules.push(item as any);
        s.memory.push({
          id: newId('mem'),
          source_text: fileName,
          agency_content: String((item as any).content),
          decision_action: 'AI_PARSED',
          assigned_executor: String((item as any).executor),
          assigned_attendees: String((item as any).attendees),
          reason: String((item as any).relevance_reason),
          week_num: isoWeekNumber(weekStart),
          created_at: now,
        });
      }
    });
    audit(req, 'agency_analyze', 'agency', fileName, `${created.length} công việc`);
    persist();
    res.json({
      created: created.length,
      items: created,
      message: created.length
        ? `AI đã bóc tách ${created.length} công việc từ "${fileName}" và đối chiếu ${examples.length} phân công cũ.`
        : `Không tìm thấy đầu việc Ban Xây dựng Đảng nào trong "${fileName}".`,
    });
  } catch (err) {
    return failAi(res, err);
  }
  return undefined;
});

// ---------------- Bộ não tri thức (AI Brain) ----------------

router.get('/brain', (_req, res) => {
  const s = getState();
  res.json({
    nodes: s.brain_nodes.map((n) => ({
      ...n,
      linked_events: s.events
        .filter((e) => e.source_document === n.title)
        .sort((a, b) => a.event_date.localeCompare(b.event_date) || a.start_time.localeCompare(b.start_time)),
    })),
  });
});

router.post('/brain', (req, res) => {
  const body = req.body || {};
  if (!body.title && !body.summary) return res.status(422).json({ error: 'Cần title hoặc summary' });
  const node = {
    id: String(body.id || newId('node')),
    title: String(body.title || ''),
    summary: String(body.summary || ''),
    category: String(body.category || 'Chỉ đạo & Kế hoạch'),
    directives: Array.isArray(body.directives) ? body.directives.map(String) : [],
    source: String(body.source || 'nhập tay'),
    updated_at: new Date().toISOString(),
  };
  mutate((s) => {
    const at = s.brain_nodes.findIndex((n) => n.id === node.id);
    if (at >= 0) s.brain_nodes[at] = node;
    else s.brain_nodes.unshift(node);
  });
  audit(req, 'save', 'brain', node.id, node.title || node.category);
  persist();
  res.status(201).json({ node });
});

router.delete('/brain/:id', (req, res) => {
  mutate((s) => {
    s.brain_nodes = s.brain_nodes.filter((n) => n.id !== req.params.id);
  });
  audit(req, 'delete', 'brain', req.params.id, '');
  persist();
  res.json({ deleted: req.params.id });
});

/** Phân tích một văn bản/phương án Đảng thành nút tri thức + sự kiện đề xuất. */
router.post('/brain/analyze', async (req, res) => {
  const fileName = String(req.body?.fileName || '').trim();
  const fileContent = String(req.body?.fileContent || '').trim();
  if (!fileName) return res.status(400).json({ error: 'fileName là bắt buộc' });
  if (fileContent.length < 40) {
    return res.status(422).json({ error: 'Nội dung tài liệu quá ngắn để phân tích (cần tối thiểu 40 ký tự).' });
  }
  const week = weekParam(req);
  try {
    const data = await askJson<Record<string, any>>({
      label: 'brain-analyze',
      temperature: 0.1,
      systemInstruction: `
Bạn là Bộ Não Tri Thức Tham Mưu của Văn phòng Đảng ủy và UBND phường.
Phân tích tài liệu và trả về JSON:
{"summary":"tóm tắt cốt lõi 2-3 câu","category":"phân loại văn bản","keyDirectives":["chỉ đạo quan trọng"],
"events":[{"title":"","content":"","event_date":"YYYY-MM-DD","start_time":"HH:MM","end_time":"HH:MM","chair":"","participants":"","location":"","preparation":"","confidence":0.8}]}
Chỉ trích xuất nội dung CÓ TRONG tài liệu. Không có sự kiện nào thì trả events = [].
`.trim(),
      prompt: `Tài liệu: ${fileName}\n\n${fileContent.slice(0, MAX_PROMPT_CHARS)}\n\nChỉ phân tích trong giai đoạn từ ${week.start} đến ${week.end}.`,
    });
    const state = getState();
    const src = state.sources.find((s) => s.file_name === fileName);
    const events = (Array.isArray(data.events) ? data.events : []).map((item) =>
      coerceAiEvent(item, {
        source_doc: fileName,
        source_id: src?.id ?? null,
        source_priority: src?.priority_level ?? 70,
        week_start: week.start,
      })
    ).filter((e): e is EventRecord => Boolean(e));
    const node = {
      id: newId('node'),
      title: fileName,
      summary: String(data.summary || ''),
      category: String(data.category || 'Chỉ đạo & Kế hoạch'),
      directives: Array.isArray(data.keyDirectives) ? data.keyDirectives.map(String) : [],
      source: String(req.body?.source || 'Google Drive'),
      updated_at: new Date().toISOString(),
    };
    if (events.length) {
      mutate((s) => {
        s.brain_nodes.unshift(node);
        s.events.push(...events);
      });
    } else {
      mutate((s) => {
        s.brain_nodes.unshift(node);
      });
    }
    audit(req, 'brain_analyze', 'brain', node.id, `${events.length} sự kiện từ "${fileName}"`);
    persist();
    res.json({ knowledgeNode: node, events, saved: events.length });
  } catch (err) {
    return failAi(res, err);
  }
  return undefined;
});

// ---------------- Google Drive (đồng bộ thủ công, không bịa dữ liệu) ----------------

router.get('/drive/config', (_req, res) => {
  res.json({ drive_config: getState().drive_config });
});

router.put('/drive/config', (req, res) => {
  const current = getState().drive_config;
  const pick = (key) => (req.body?.[key] === undefined ? current[key] : String(req.body[key]));
  mutate((s) => {
    s.drive_config = {
      folder_id: pick('folder_id'),
      folder_name: pick('folder_name'),
      folder_url: pick('folder_url'),
      connected: Boolean(pick('folder_id')),
    };
  });
  audit(req, 'update', 'drive_config', 'drive', getState().drive_config.folder_id);
  persist();
  res.json({ drive_config: getState().drive_config });
});

// ---------------- Phân tích tải công tác ----------------

router.get('/analytics/workload', (req, res) => {
  const { start, end } = weekParam(req);
  const events = getState().events.filter((e) => e.event_date >= start && e.event_date <= end && e.status !== 'REJECTED');
  const perLeader = new Map<string, { leader: string; count: number; minutes: number; high_priority: number; days: Set<string> }>();
  for (const ev of events) {
    const names = ev.leaders.length ? ev.leaders : [ev.chair || 'Chưa xác định'];
    for (const name of names) {
      const row = perLeader.get(name) || { leader: name, count: 0, minutes: 0, high_priority: 0, days: new Set<string>() };
      row.count += 1;
      row.minutes += durationOf(ev);
      if (ev.priority_score >= 85) row.high_priority += 1;
      row.days.add(ev.event_date);
      perLeader.set(name, row);
    }
  }
  const rows = [...perLeader.values()]
    .map((r) => ({ ...r, days: r.days.size, busy: r.count >= 4 || r.high_priority >= 2 }))
    .sort((a, b) => b.count - a.count || b.minutes - a.minutes);
  res.json({
    week: { start, end, week_number: isoWeekNumber(start) },
    leaders: rows,
    busiest_day: [...events.reduce((m, e) => m.set(e.event_date, (m.get(e.event_date) || 0) + 1), new Map<string, number>()).entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([date, count]) => ({ date, count }))[0] || null,
  });
});

/** Sổ tay đôn đốc: việc chuẩn bị có hạn nộp do cán bộ đánh dấu (+) và hạn đọc được từ câu chữ văn bản. */
router.get('/analytics/deadlines', (req, res) => {
  const { start, end } = weekParam(req);
  const events = getState().events.filter((e) => e.event_date >= start && e.event_date <= end && e.status !== 'REJECTED');
  const rows: {
    event_id: string;
    task_id: string | null;
    title: string;
    owner: string;
    due_date: string;
    note: string;
    done: boolean;
    source: 'task' | 'text';
  }[] = [];

  for (const e of events) {
    for (const t of e.tasks) {
      if (!t.due_date) continue;
      rows.push({
        event_id: e.id,
        task_id: t.id,
        title: e.title,
        owner: t.owner || e.contact_person || e.chair || 'Chưa phân công',
        due_date: t.due_date,
        note: t.text,
        done: t.done,
        source: 'task',
      });
    }
  }

  const withTaskDates = new Set(rows.map((r) => r.event_id));
  for (const e of events) {
    if (withTaskDates.has(e.id)) continue;
    const m = /(trước\s+(?:\d{1,2}[:h]\d{2})?\s*(?:ngày\s+)?(\d{1,2})[/\-](\d{1,2})|hạn\s*(\d{1,2})[/\-](\d{1,2}))/i.exec(`${e.preparation} ${e.content}`);
    if (!m) continue;
    const day = m[2] || m[4];
    const month = m[3] || m[5];
    rows.push({
      event_id: e.id,
      task_id: null,
      title: e.title,
      owner: e.contact_person || e.chair || e.preparation.split('•')[0]?.trim() || 'Chưa phân công',
      due_date: `${e.event_date.slice(0, 4)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      note: e.preparation || e.content,
      done: false,
      source: 'text',
    });
  }

  rows.sort((a, b) => a.due_date.localeCompare(b.due_date) || Number(a.done) - Number(b.done));
  res.json({
    week: { start, end },
    deadlines: rows,
    counts: { total: rows.length, done: rows.filter((r) => r.done).length, explicit: rows.filter((r) => r.source === 'task').length },
  });
});

// ---------------- Xung đột, sao lưu, nạp tệp ----------------

router.get('/conflicts', (_req, res) => {
  const s = getState();
  const byId = new Map(s.events.map((e) => [e.id, e]));
  res.json({
    conflicts: s.conflicts.filter((c) => c.status === 'OPEN').map((c) => ({
      ...c,
      event_1: byId.get(c.event_id_1) || null,
      event_2: byId.get(c.event_id_2) || null,
    })),
  });
});

router.post('/backup', (req, res) => {
  const s = getState();
  const dir = path.join(DATA_DIR, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify({ exported_at: new Date().toISOString(), schema_version: s.schema_version, ...s }, null, 2), 'utf8');
  audit(req, 'backup', 'store', file, `${s.events.length} sự kiện`);
  persist();
  res.json({ backup_path: path.relative(process.cwd(), file).replace(/\\/g, '/'), bytes: fs.statSync(file).size });
});

/** Tải bản sao lưu về máy: nội dung giống hệt tệp trong data/backups. */
router.get('/backup/download', (req, res) => {
  const s = getState();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const body = JSON.stringify({ exported_at: new Date().toISOString(), schema_version: s.schema_version, ...s }, null, 2);
  audit(req, 'backup_download', 'store', `backup_${stamp}.json`, `${s.events.length} sự kiện`);
  persist();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="backup_${stamp}.json"`);
  res.send(body);
});

/**
 * Phục hồi từ một bản sao lưu: kiểm tra cấu trúc, ghi snapshot phòng hờ, thay kho rồi buộc đăng nhập lại
 * vì danh sách tài khoản trong bản sao lưu có thể khác tài khoản đang dùng.
 */
router.post('/backup/restore', (req, res) => {
  const confirm = String(req.body?.confirm || '');
  if (confirm !== 'PHUC HOI') {
    return res.status(422).json({ error: 'Cần xác nhận bằng chữ "PHUC HOI" vì phục hồi sẽ ghi đè toàn bộ lịch hiện có.' });
  }
  const base64 = String(req.body?.content_base64 || '');
  const text = base64 ? Buffer.from(base64, 'base64').toString('utf8') : String(req.body?.content_text || '');
  if (!text.trim()) return res.status(422).json({ error: 'Chưa có nội dung bản sao lưu (content_base64 hoặc content_text)' });

  let parsed: Record<string, any>;
  try {
    parsed = JSON.parse(text);
  } catch {
    return res.status(422).json({ error: 'Tệp sao lưu không phải JSON hợp lệ.' });
  }
  if (!parsed || typeof parsed !== 'object') return res.status(422).json({ error: 'Tệp sao lưu không đúng định dạng.' });
  if (!Array.isArray(parsed.events)) return res.status(422).json({ error: 'Tệp sao lưu thiếu danh sách events.' });
  if (!parsed.settings || typeof parsed.settings !== 'object') return res.status(422).json({ error: 'Tệp sao lưu thiếu settings.' });
  if (Number(parsed.schema_version) > SCHEMA_VERSION) {
    return res.status(422).json({ error: `Bản sao lưu tạo bởi bản mới hơn (schema v${parsed.schema_version}); ứng dụng đang ở v${SCHEMA_VERSION}.` });
  }

  const s = getState();
  const dir = path.join(DATA_DIR, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const snapshot = path.join(dir, `pre_restore_${stamp}.json`);
  fs.writeFileSync(snapshot, JSON.stringify({ exported_at: new Date().toISOString(), schema_version: s.schema_version, ...s }, null, 2), 'utf8');

  const incomingEvents = parsed.events.length;
  replaceState(parsed);
  refreshConflicts();
  audit(req, 'backup_restore', 'store', path.basename(snapshot), `${incomingEvents} sự kiện được nạp lại; snapshot an toàn ${path.basename(snapshot)}`);
  persist();
  res.setHeader('Set-Cookie', clearedSessionCookie(isHttpsRequest(req)));
  res.json({
    restored: true,
    events: getState().events.length,
    sources: getState().sources.length,
    safety_snapshot: path.relative(process.cwd(), snapshot).replace(/\\/g, '/'),
    relogin_required: true,
    message: 'Đã phục hồi xong. Hãy đăng nhập lại bằng tài khoản có trong bản sao lưu.',
  });
});

/** Nạp một văn bản: client đọc file thành base64, server rút nội dung text (PDF/ảnh/Excel tự nhận dạng). */
router.post('/sources/upload', async (req, res) => {
  const fileName = String(req.body?.file_name || '').trim();
  const base64 = String(req.body?.content_base64 || '');
  if (!fileName || !base64) return res.status(422).json({ error: 'Cần file_name và content_base64' });
  const buffer = Buffer.from(base64, 'base64');
  const maxBytes = Number(process.env.MAX_UPLOAD_MB || 20) * 1024 * 1024;
  if (buffer.length > maxBytes) {
    return res.status(413).json({ error: `Tệp vượt quá ${Math.round(maxBytes / 1024 / 1024)} MB. Hãy tách nhỏ hoặc dán nội dung.` });
  }
  let read;
  try {
    read = await extractTextAsync(fileName, buffer);
  } catch (err) {
    return res.status(422).json({ error: `Không đọc được tệp: ${err instanceof Error ? err.message : String(err)}` });
  }
  if (!read.text) return res.status(422).json({ error: read.error || 'Không trích được nội dung từ tệp.' });

  const hash = contentFingerprint(read.text);
  const duplicate = findDuplicateSource(hash);
  if (duplicate && !req.body?.allow_duplicate) {
    return res.status(409).json({
      error: `Nội dung tệp này đã có trong kho với tên "${duplicate.file_name}". Không nạp lại để tránh trùng lịch.`,
      code: 'DUPLICATE_SOURCE',
      duplicate_source: { id: duplicate.id, file_name: duplicate.file_name },
    });
  }

  const source = {
    id: newId('s'),
    file_name: fileName,
    source_type: String(req.body?.source_type || 'cap_tren'),
    priority_level: Number(req.body?.priority_level ?? 80),
    uploaded_at: new Date().toISOString(),
    file_size: buffer.length,
    parse_status: 'PENDING' as const,
    notes: String(req.body?.notes || `Nạp từ tệp${read.meta?.ocr ? ' (OCR)' : ''}${read.meta?.pages ? `, ${read.meta.pages} trang` : ''}`),
    raw_text: read.text,
    content_hash: hash,
  };
  mutate((s) => {
    s.sources.push(source);
  });
  audit(req, 'upload', 'source', source.id, `${fileName} (${read.chars} ký tự${read.meta?.ocr ? ', OCR' : ''})`);
  persist();

  let extraction: Awaited<ReturnType<typeof runSourceExtraction>> | { error: string } | null = null;
  if (req.body?.auto_extract && can(authOf(req)?.user.role || 'viewer', 'ai:run')) {
    const week = weekParam(req);
    try {
      extraction = await runSourceExtraction(source.id, week, req);
    } catch (err) {
      extraction = { error: err instanceof Error ? err.message : String(err) };
    }
  }
  res.status(201).json({ source: { ...source, raw_text: undefined }, chars: read.chars, meta: read.meta || null, extraction });
});

router.get('/drive/incoming', (_req, res) => {
  const dir = path.join(DATA_DIR, 'drive_incoming');
  if (!fs.existsSync(dir)) {
    return res.json({ directory: 'data/drive_incoming', files: [], message: 'Thư mục chưa có tệp nào.' });
  }
  const files = fs.readdirSync(dir)
    .filter((name) => fs.statSync(path.join(dir, name)).isFile())
    .map((name) => {
      const full = path.join(dir, name);
      return { name, size: fs.statSync(full).size, modified_at: fs.statSync(full).mtime.toISOString() };
    });
  res.json({ directory: 'data/drive_incoming', files });
  return undefined;
});

/** Nhập mọi tệp trong data/drive_incoming thành văn bản nguồn. */
router.post('/sources/ingest-dir', async (req, res) => {
  const dir = path.join(DATA_DIR, 'drive_incoming');
  if (!fs.existsSync(dir)) {
    return res.status(422).json({ error: `Chưa có thư mục ${path.relative(process.cwd(), dir)}. Đặt tệp xuất từ Drive vào đó rồi đồng bộ lại.` });
  }
  const imported: { id: string; file_name: string; chars: number; ocr?: boolean }[] = [];
  const skipped: { file: string; reason: string }[] = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (!fs.statSync(full).isFile()) continue;
    if (getState().sources.some((s) => s.file_name === name)) {
      skipped.push({ file: name, reason: 'Đã có trong danh sách văn bản' });
      continue;
    }
    const read = await extractTextAsync(name, fs.readFileSync(full));
    if (!read.text) {
      skipped.push({ file: name, reason: read.error || 'Không đọc được nội dung' });
      continue;
    }
    const hash = contentFingerprint(read.text);
    if (findDuplicateSource(hash)) {
      skipped.push({ file: name, reason: 'Nội dung trùng với văn bản đã nạp (khác tên tệp)' });
      continue;
    }
    const source = {
      id: newId('s'),
      file_name: name,
      source_type: 'thu_moi_cap_tren',
      priority_level: 85,
      uploaded_at: new Date().toISOString(),
      file_size: fs.statSync(full).size,
      parse_status: 'PENDING' as const,
      notes: `Nhập từ ${path.basename(dir)}${read.meta?.ocr ? ' (OCR)' : ''}`,
      raw_text: read.text,
      content_hash: hash,
    };
    mutate((s) => {
      s.sources.push(source);
    });
    imported.push({ id: source.id, file_name: name, chars: read.chars, ...(read.meta?.ocr ? { ocr: true } : {}) });
  }
  audit(req, 'ingest_dir', 'sources', dir, `${imported.length} tệp mới`);
  persist();
  res.json({ imported, skipped });
  return undefined;
});

// ---------------- AI ----------------

/** Trạng thái các nhà cung cấp AI (Gemini / Ollama / OpenAI-compatible). */
router.get('/ai/status', async (_req, res) => {
  const providers = await probeProviders();
  res.json({
    providers,
    active: aiModel(),
    any_available: providers.some((p) => p.available),
  });
});

/** Agent có công cụ: đọc lịch, tìm khung trống, tra cán bộ, tạo đề xuất. */
router.post('/ai/agent', async (req, res) => {
  const message = String(req.body?.message || req.body?.prompt || '').trim();
  if (!message) return res.status(400).json({ error: 'message là bắt buộc' });
  const week = weekParam(req);
  try {
    const result = await runAgent({
      message,
      weekStart: week.start,
      allowWrite: Boolean(req.body?.allow_write),
    });
    if (result.created_events.length) {
      audit(req, 'ai_agent_create', 'events', result.created_events.map((e) => e.id).join(','), `${result.created_events.length} đề xuất do trợ lý tạo`);
      persist();
    }
    res.json({ ...result, ai_available: true });
  } catch (err) {
    return failAi(res, err);
  }
  return undefined;
});

router.post('/ai/week-draft', async (req, res) => {
  const week = weekParam(req);
  try {
    const draft = await generateWeekDraft(week.start, { save: Boolean(req.body?.save) });
    if (draft.saved) audit(req, 'ai_week_draft_saved', 'week', week.start, `${draft.saved} dự thảo`);
    res.json(draft);
  } catch (err) {
    return failAi(res, err);
  }
  return undefined;
});

router.post('/ai/chat', async (req, res) => {
  const prompt = String(req.body?.prompt || '').trim();
  if (!prompt) return res.status(400).json({ error: 'prompt là bắt buộc' });
  const { start, end } = weekParam(req);
  const state = getState();
  const weekEvents = state.events.filter((e) => e.event_date >= start && e.event_date <= end);
  const knowledge = state.brain_nodes.slice(0, 15).map((n) => ({
    'tai lieu': n.title, 'loai': n.category, 'tom_tat': n.summary, 'chi_dao': n.directives,
  }));
  const sources = state.sources.filter((s) => s.raw_text).map((s) => s.file_name);
  try {
    const text = await ask({
      label: 'chat',
      systemInstruction: `
Bạn là Trợ lý Lập lịch AI tham mưu công tác cho Văn phòng Đảng ủy và UBND phường.
Trả lời tiếng Việt, ngắn gọn, đúng thể thức hành chính, dựa trên dữ liệu lịch được cung cấp.
Nếu dữ liệu không có thông tin được hỏi, nói rõ là chưa có trong dữ liệu — KHÔNG bịa số liệu, tên người hay ngày giờ.
Khi dẫn văn bản chỉ đạo, nêu tên tài liệu trong "Bộ não tri thức". Có bao nhiêu sự kiện thì nói bấy nhiêu, không làm tròn.
Chỉ trả về nhận xét bằng chữ, không kèm markdown.
`.trim(),
      prompt: `Tuần ${formatDdMmYyyy(start)}–${formatDdMmYyyy(end)}.
Lịch: ${JSON.stringify(weekEvents.map((e) => ({
        date: e.event_date, start: e.start_time, end: e.end_time, title: e.title,
        chair: e.chair, location: e.location, priority: e.priority_score, status: e.status,
      })))}
Xung đột mở: ${JSON.stringify(state.conflicts.filter((c) => c.status === 'OPEN').slice(0, 20))}
Bộ não tri thức (${knowledge.length} văn bản đã phân tích): ${JSON.stringify(knowledge)}
Văn bản nguồn đang có: ${JSON.stringify(sources)}
Câu hỏi: ${prompt}`,
    });
    res.json({ text, ai_available: true, context_events: weekEvents.length, context_documents: knowledge.length });
  } catch (err) {
    return failAi(res, err);
  }
  return undefined;
});

/** Bóc tách nhanh một đoạn văn bản dán tay -> sự kiện (không lưu vào store). */
router.post('/ai/parse-text', async (req, res) => {
  const text = String(req.body?.text || req.body?.documentText || '').trim();
  if (text.length < 40) {
    return res.status(422).json({ error: 'Nội dung dán vào quá ngắn để bóc tách (cần tối thiểu 40 ký tự).' });
  }
  const week = weekParam(req);
  try {
    const { events, rejected } = await extractEventsFromText(text, {
      source_doc: String(req.body?.source_doc || 'Nội dung dán nhanh'),
      source_id: null,
      source_priority: Number(req.body?.priority_level || 75),
      week_start: week.start,
    });
    res.json({ events, rejected, week_start: week.start, week_end: week.end });
  } catch (err) {
    return failAi(res, err);
  }
  return undefined;
});

/** AI bổ sung các trường còn thiếu của một sự kiện đã lưu. */
router.post('/events/:id/ai-fill', async (req, res) => {  const event = findEvent(req.params.id);
  if (!event) return res.status(404).json({ error: 'Không tìm thấy sự kiện' });
  const source = getState().sources.find((s) => s.id === event.source_id);
  try {
    const data = await askJson<Record<string, any>>({
      label: 'ai-fill',
      systemInstruction: `
Bạn bổ sung thông tin còn thiếu cho một sự kiện lịch công tác từ văn bản nguồn.
Chỉ dùng thông tin có trong văn bản. Trường không có dữ liệu phải trả về chuỗi rỗng.
Trả về JSON: {"content":"","chair":"","participants":"","location":"","preparation":"","documents_required":"","contact_person":"","confidence":0.7}
`.trim(),
      prompt: `Sự kiện: ${JSON.stringify({ title: event.title, date: event.event_date, start: event.start_time, location: event.location, chair: event.chair })}
Còn thiếu: ${event.missing_data_fields.join(', ') || 'chưa xác định'}
Văn bản nguồn (${source?.file_name || event.source_document || 'không rõ'}):
${(source?.raw_text || '').slice(0, MAX_PROMPT_CHARS)}`,
    });
    const patch: Record<string, unknown> = {};
    for (const key of ['content', 'chair', 'participants', 'location', 'preparation', 'documents_required', 'contact_person']) {
      const value = String(data[key] ?? '').trim();
      if (value && !(event as any)[key]) patch[key] = value;
    }
    if (!patch.preparation && !event.preparation) {
      const derived = extractPreparation(`${event.title} ${event.content} ${source?.raw_text || ''}`);
      if (derived) patch.preparation = derived;
    }
    if (!Object.keys(patch).length) {
      return res.json({ filled: [], message: 'AI không tìm thêm được dữ liệu trong văn bản nguồn.' });
    }
    mutate((s) => {
      const ev = s.events.find((e) => e.id === req.params.id)!;
      for (const [k, v] of Object.entries(patch)) (ev as any)[k] = v;
      ev.missing_data_fields = ev.missing_data_fields.filter((f) => !Object.keys(patch).includes(f));
      ev.updated_at = new Date().toISOString();
    });
    audit(req, 'ai_fill', 'event', req.params.id, Object.keys(patch).join(', '));
    persist();
    res.json({ filled: Object.keys(patch), event: findEvent(req.params.id) });
  } catch (err) {
    return failAi(res, err);
  }
  return undefined;
});

/** AI đề xuất phương án xử lý cho một xung đột cụ thể. */
router.post('/conflicts/:id/ai-suggest', async (req, res) => {
  const state = getState();
  const conflict = state.conflicts.find((c) => c.id === req.params.id);
  if (!conflict) return res.status(404).json({ error: 'Không tìm thấy xung đột' });
  const e1 = state.events.find((e) => e.id === conflict.event_id_1);
  const e2 = state.events.find((e) => e.id === conflict.event_id_2);
  if (!e1 || !e2) return res.status(422).json({ error: 'Sự kiện liên quan đã bị xoá' });
  try {
    const text = await ask({
      label: 'conflict-suggest',
      temperature: 0.1,
      systemInstruction: `
Bạn là trợ lý xử lý xung đột lịch công tác của Văn phòng cấp phường.
Đề xuất tối đa 2 phương án khả thi (ủy quyền người dự thay, dời giờ, đổi phòng họp),
mỗi phương án nêu rõ: việc cần làm, ai quyết định, hệ quả nếu chọn. Ưu tiên sự kiện điểm cao hơn.
Không bịa tên người ngoài dữ liệu đã cho. Trả lời tiếng Việt, dạng gạch đầu dòng.
`.trim(),
      prompt: `Xung đột: ${conflict.conflict_type} (${conflict.severity})\n${conflict.description}\n\nA: ${JSON.stringify({ title: e1.title, date: e1.event_date, start: e1.start_time, end: e1.end_time, chair: e1.chair, location: e1.location, priority: e1.priority_score, prep: e1.preparation })}\nB: ${JSON.stringify({ title: e2.title, date: e2.event_date, start: e2.start_time, end: e2.end_time, chair: e2.chair, location: e2.location, priority: e2.priority_score, prep: e2.preparation })}`,
    });
    res.json({ suggestion: text, conflict_id: conflict.id });
  } catch (err) {
    return failAi(res, err);
  }
  return undefined;
});

// ---------------- Publish & exports (tiện ích miễn phí) ----------------

router.post('/publish', async (req, res) => {
  const week = weekParam(req);
  const publishedIds: string[] = [];
  mutate((s) => {
    for (const ev of s.events) {
      if (ev.event_date >= week.start && ev.event_date <= week.end && ev.status === 'APPROVED') {
        ev.status = 'PUBLISHED';
        ev.updated_at = new Date().toISOString();
        publishedIds.push(ev.id);
      }
    }
  });

  // Không có mục nào để ban hành: không tạo lượt ban hành rỗng, không tạo link.
  if (!publishedIds.length) {
    return res.json({
      week_start: week.start,
      published: 0,
      publication: null,
      share: null,
      open_conflicts: getState().conflicts.filter((c) => c.status === 'OPEN').length,
    });
  }

  const s = getState();
  const publication = rememberPublication({
    week_number: isoWeekNumber(week.start),
    year: Number(week.start.slice(0, 4)),
    week_start: week.start,
    week_end: week.end,
    document_number: s.settings.document_number || `${isoWeekNumber(week.start)}-LCT/VP`,
    signer: s.settings.signer,
    unit_name: s.settings.unit_name,
    event_ids: publishedIds,
  });

  // Ban hành xong là có ngay link xem trực tuyến (chỉ đọc, thu hồi được).
  const token = newShareToken();
  mutate((state) => {
    const target = state.publications.find((p) => p.id === publication.id);
    if (target) {
      target.share_token = token;
      target.share_expires_at = null;
      target.share_pin = '';
    }
  });
  const printPath = `/api/public/week/${token}/print`;
  const url = `${publicBaseUrl(req)}${printPath}`;
  let qrDataUrl = '';
  try {
    qrDataUrl = await QRCode.toDataURL(url, { margin: 1, width: 360, errorCorrectionLevel: 'M' });
  } catch {
    qrDataUrl = '';
  }

  audit(req, 'publish', 'week', week.start, `${publishedIds.length} sự kiện APPROVED -> PUBLISHED, số ${publication.document_number}`);
  const publishedEvents = getState().events.filter((e) => publication.event_ids.includes(e.id));
  emit('week.published', {
    week_number: publication.week_number,
    year: publication.year,
    week_start: publication.week_start,
    week_end: publication.week_end,
    document_number: publication.document_number,
    counts: { published: publishedIds.length },
    items: publishedEvents.map(eventItem),
  });
  persist();
  res.json({
    week_start: week.start,
    published: publishedIds.length,
    publication: { ...publication, share_token: token },
    share: { token, url, print_path: printPath, qr_data_url: qrDataUrl },
    open_conflicts: getState().conflicts.filter((c) => c.status === 'OPEN').length,
  });
});

/** Thu hồi một lần ban hành: các mục đã ban hành quay về trạng thái ĐÃ DUYỆT. */
router.post('/publications/:id/revoke', (req, res) => {
  const pub = getState().publications.find((p) => p.id === req.params.id);
  if (!pub) return res.status(404).json({ error: 'Không tìm thấy lượt ban hành' });
  const ids = new Set(pub.event_ids);
  let reverted = 0;
  mutate((s) => {
    for (const ev of s.events) {
      if (ids.has(ev.id) && ev.status === 'PUBLISHED') {
        ev.status = 'APPROVED';
        ev.updated_at = new Date().toISOString();
        reverted += 1;
      }
    }
    s.publications = s.publications.filter((p) => p.id !== req.params.id);
  });
  audit(req, 'revoke', 'publication', req.params.id, `Tuần ${pub.week_number}/${pub.year}: hoàn trả ${reverted} mục về APPROVED`);
  emit('week.revoked', {
    week_number: pub.week_number,
    year: pub.year,
    week_start: pub.week_start,
    week_end: pub.week_end,
    document_number: pub.document_number,
    counts: { reverted },
  });
  persist();
  res.json({ revoked: pub.id, reverted });
});

/** Nhật ký ban hành các tuần (mới nhất trước). */
router.get('/publications', (req, res) => {
  const week = req.query.week ? weekParam(req) : null;
  const all = [...getState().publications].reverse();
  res.json({
    publications: week ? all.filter((p) => p.week_start === week.start) : all.slice(0, 30),
    total: all.length,
  });
});

/** Địa chỉ công khai của máy chủ, ưu tiên PUBLIC_BASE_URL khi chạy sau reverse proxy. */
function publicBaseUrl(req: Request): string {
  const configured = String(process.env.PUBLIC_BASE_URL || '').trim();
  if (configured) return configured.replace(/\/+$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

/** Kiểm tra hiệu lực của link chia sẻ: hết hạn hoặc sai PIN. */
function shareIssue(pub: PublicationRecord, pin: unknown): 'expired' | 'pin_required' | null {
  if (pub.share_expires_at && new Date(pub.share_expires_at).getTime() < Date.now()) return 'expired';
  if (pub.share_pin && String(pin ?? '') !== pub.share_pin) return 'pin_required';
  return null;
}

/** Bật link công khai cho một lần ban hành; token ngẫu nhiên, thu hồi được và không cần đăng nhập để xem. */
router.post('/publications/:id/share', async (req, res) => {
  const pub = getState().publications.find((p) => p.id === req.params.id);
  if (!pub) return res.status(404).json({ error: 'Không tìm thấy lần ban hành' });
  const days = Math.max(0, Math.min(365, Number(req.body?.expires_in_days) || 0));
  const pin = String(req.body?.pin ?? '').replace(/\D/g, '').slice(0, 6);
  if (pin && !/^\d{4,6}$/.test(pin)) {
    return res.status(422).json({ error: 'Mã PIN phải là 4–6 chữ số (hoặc để trống).' });
  }
  const token = pub.share_token || newShareToken();
  const expiresAt = days > 0 ? new Date(Date.now() + days * 86400000).toISOString() : null;
  mutate((s) => {
    const target = s.publications.find((p) => p.id === req.params.id)!;
    target.share_token = token;
    target.share_expires_at = expiresAt;
    target.share_pin = pin;
  });
  audit(req, 'share_enable', 'publication', pub.id, `tuần ${pub.week_start}${expiresAt ? ` · hết hạn ${expiresAt.slice(0, 10)}` : ''}${pin ? ' · có PIN' : ''}`);
  persist();
  const printPath = `/api/public/week/${token}/print`;
  const url = `${publicBaseUrl(req)}${printPath}`;
  let qrDataUrl = '';
  try {
    qrDataUrl = await QRCode.toDataURL(url, { margin: 1, width: 360, errorCorrectionLevel: 'M' });
  } catch {
    qrDataUrl = '';
  }
  res.json({
    share_token: token,
    share_expires_at: expiresAt,
    share_pin: pin,
    print_path: printPath,
    url,
    qr_data_url: qrDataUrl,
    views: getState().share_access.filter((a) => a.token === token).length,
  });
});

/** Ảnh QR của link đang chia sẻ, dùng cho màn Xuất bản. */
router.get('/publications/:id/qr', async (req, res) => {
  const pub = getState().publications.find((p) => p.id === req.params.id);
  if (!pub) return res.status(404).json({ error: 'Không tìm thấy lần ban hành' });
  if (!pub.share_token) return res.status(409).json({ error: 'Tuần này chưa bật link công khai.' });
  const printPath = `/api/public/week/${pub.share_token}/print`;
  const url = `${publicBaseUrl(req)}${printPath}`;
  const qr_data_url = await QRCode.toDataURL(url, { margin: 1, width: 360, errorCorrectionLevel: 'M' });
  res.json({ url, print_path: printPath, qr_data_url, share_pin: pub.share_pin, share_expires_at: pub.share_expires_at });
});

/** Tắt link: người dùng cũ sẽ nhận "link không còn hiệu lực". */
router.delete('/publications/:id/share', (req, res) => {
  const pub = getState().publications.find((p) => p.id === req.params.id);
  if (!pub) return res.status(404).json({ error: 'Không tìm thấy lần ban hành' });
  if (!pub.share_token) return res.json({ revoked: false, message: 'Tuần này chưa bật link chia sẻ.' });
  mutate((s) => {
    const target = s.publications.find((p) => p.id === req.params.id)!;
    target.share_token = '';
    target.share_expires_at = null;
    target.share_pin = '';
  });
  audit(req, 'share_disable', 'publication', pub.id, `tuần ${pub.week_start}`);
  persist();
  res.json({ revoked: true });
});

/** Tra lần ban hành đang được chia sẻ + chỉ lấy các mốc đã PUBLISHED của chính lần ban hành đó. */
function sharedPublication(token: string): { pub: PublicationRecord; events: EventRecord[] } | null {
  if (!/^[a-f0-9]{16,48}$/.test(token)) return null;
  const s = getState();
  const pub = s.publications.find((p) => p.share_token && p.share_token.toLowerCase() === token.toLowerCase());
  if (!pub) return null;
  const events = s.events
    .filter((e) => pub.event_ids.includes(e.id) && e.status === 'PUBLISHED')
    .sort((a, b) => `${a.event_date} ${a.start_time}`.localeCompare(`${b.event_date} ${b.start_time}`));
  return { pub, events };
}

/** Trang JSON gọn cho link công khai: bỏ nguồn, độ tin cậy, người liên hệ và việc nội bộ. */
router.get('/public/week/:token', (req, res) => {
  const found = sharedPublication(req.params.token);
  if (!found) return res.status(404).json({ error: 'Link không còn hiệu lực hoặc chưa từng được chia sẻ.' });
  const issue = shareIssue(found.pub, req.query.pin);
  if (issue === 'expired') return res.status(410).json({ error: 'Link chia sẻ đã hết hạn. Hãy đề nghị đơn vị bật lại link mới.' });
  if (issue === 'pin_required') return res.status(401).json({ error: 'Link này cần mã PIN. Nhập PIN do đơn vị cung cấp.', pin_required: true });
  const { pub, events } = found;
  noteShareAccess(req.params.token, pub.week_start);
  persist();
  res.json({
    week: { start: pub.week_start, end: pub.week_end, number: pub.week_number },
    document_number: pub.document_number,
    unit_name: pub.unit_name,
    signer: pub.signer,
    events: events.map((e) => ({
      event_date: e.event_date,
      weekday: WEEKDAY_FULL[fromIso(e.event_date).getDay()],
      start_time: e.start_time,
      end_time: e.end_time,
      title: e.title,
      content: e.content,
      participants: e.participants,
      location: e.location,
      chair: e.chair,
      preparation: e.preparation,
    })),
  });
});

/** Bản in A4 theo thể thức văn bản, mở được bằng link chia sẻ mà không cần tài khoản. */
router.get('/public/week/:token/print', (req, res) => {
  const found = sharedPublication(req.params.token);
  if (!found) {
    res.status(404).set('Content-Type', 'text/html; charset=utf-8').send('<!DOCTYPE html><meta charset="utf-8"><title>Link hết hạn</title><body style="font-family:&#39;Segoe UI&#39;,system-ui,-apple-system,Roboto,Arial,sans-serif;padding:40px">Link chia sẻ lịch công tác không còn hiệu lực.</body>');
    return;
  }
  const issue = shareIssue(found.pub, req.query.pin);
  if (issue === 'expired') {
    res.status(410).set('Content-Type', 'text/html; charset=utf-8').send('<!DOCTYPE html><meta charset="utf-8"><title>Link hết hạn</title><body style="font-family:&#39;Segoe UI&#39;,system-ui,-apple-system,Roboto,Arial,sans-serif;padding:40px">Link chia sẻ lịch công tác đã hết hạn.</body>');
    return;
  }
  if (issue === 'pin_required') {
    const wrong = req.query.pin !== undefined;
    res.status(401).set('Content-Type', 'text/html; charset=utf-8').send(`<!DOCTYPE html><meta charset="utf-8"><title>Nhập mã PIN</title><body style="font-family:'Segoe UI',system-ui,sans-serif;padding:40px;max-width:420px;margin:0 auto">
      <h2 style="color:#0F2A5F;font-size:18px">Lịch công tác được bảo vệ</h2>
      <p style="color:#475569;font-size:14px">Nhập mã PIN do đơn vị cung cấp để xem lịch.</p>
      ${wrong ? '<p style="color:#B91C1C;font-size:13px">Mã PIN không đúng, vui lòng thử lại.</p>' : ''}
      <form method="get"><input name="pin" inputmode="numeric" maxlength="6" autofocus style="font-size:20px;letter-spacing:8px;padding:8px 12px;width:160px;border:1px solid #CBD5E1;border-radius:8px">
      <button type="submit" style="margin-left:8px;background:#2563EB;color:#fff;border:none;border-radius:8px;padding:10px 16px;font-weight:700">Xem lịch</button></form>
    </body>`);
    return;
  }
  const { pub, events } = found;
  noteShareAccess(req.params.token, pub.week_start);
  persist();
  res.setHeader('Cache-Control', 'no-store');
  res.set('Content-Type', 'text/html; charset=utf-8').send(officialDocumentHtml({
    events,
    settings: { ...getState().settings, unit_name: pub.unit_name, document_number: pub.document_number, signer: pub.signer },
    weekStart: pub.week_start,
    weekEnd: pub.week_end,
    weekNumber: pub.week_number,
    conflicts: [],
    publicMode: true,
  }));
});

router.get('/export/ics', (req, res) => {
  const { start, end } = weekParam(req);
  const s = getState();
  const events = eventsBetween(start, end).filter((e) => e.status !== 'REJECTED');
  const ics = buildIcs(events, `Lịch công tác tuần ${isoWeekNumber(start)} - ${s.settings.unit_name}`);
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="lich-tuan-${start}.ics"`);
  res.send(ics);
});

/** Địa chỉ đăng ký lịch .ics tự cập nhật (Google/Outlook) cho tuần đã ban hành. */
router.get('/ics/subscription', (req, res) => {
  const token = ensureIcsToken();
  res.json({
    token,
    url: `${publicBaseUrl(req)}/api/ics/feed/${token}/calendar.ics`,
    note: 'Dán địa chỉ này vào Google Calendar › Thêm lịch › Từ URL. Chỉ chia sẻ cho người cần xem.',
  });
});

router.post('/ics/subscription/rotate', (req, res) => {
  const token = rotateIcsToken();
  audit(req, 'rotate', 'ics_subscription', token.slice(0, 8), 'Tạo khoá đăng ký lịch .ics mới');
  persist();
  res.json({ token, url: `${publicBaseUrl(req)}/api/ics/feed/${token}/calendar.ics` });
});

/** Feed .ics công khai theo khoá: chỉ các mục đã PUBLISHED, không lộ đề xuất hay việc nội bộ. */
router.get('/ics/feed/:token/calendar.ics', (req, res) => {
  const s = getState();
  if (!s.ics_token || req.params.token !== s.ics_token) {
    return res.status(404).type('text/plain; charset=utf-8').send('Khoá đăng ký lịch không còn hiệu lực.');
  }
  const start = addDays(todayIso(), -30);
  const end = addDays(todayIso(), 180);
  const events = eventsBetween(start, end).filter((e) => e.status === 'PUBLISHED');
  const ics = buildIcs(events, `Lịch công tác - ${s.settings.unit_name}`);
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(ics);
});

router.get('/export/document', (req, res) => {
  const { start, end } = weekParam(req);
  const s = getState();
  const events = eventsBetween(start, end).filter((e) => e.status !== 'REJECTED');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(officialDocumentHtml({
    events,
    settings: s.settings,
    weekStart: start,
    weekEnd: end,
    weekNumber: isoWeekNumber(start),
    conflicts: s.conflicts.filter((c) => c.status === 'OPEN'),
  }));
});

/** Bản Word để cán bộ văn phòng sửa thể thức trước khi ký ban hành. */
router.get('/export/docx', async (req, res) => {
  const { start, end } = weekParam(req);
  const s = getState();
  const events = eventsBetween(start, end).filter((e) => e.status !== 'REJECTED');
  const buffer = await buildWeekDocx({ events, settings: s.settings, weekStart: start, conflicts: s.conflicts });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="lich-tuan-${start}.docx"`);
  res.send(buffer);
});

/** Bảng tính có bộ lọc + các sheet tổng hợp để làm báo cáo nhanh. */
router.get('/export/xlsx', async (req, res) => {
  const { start, end } = weekParam(req);
  const s = getState();
  const events = eventsBetween(start, end).filter((e) => e.status !== 'REJECTED');
  const buffer = await buildWeekXlsx({ events, settings: s.settings, weekStart: start, conflicts: s.conflicts });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="lich-tuan-${start}.xlsx"`);
  res.send(buffer);
});

/** PDF dựng cục bộ bằng font Unicode của máy; thiếu font thì báo rõ chứ không xuất tệp mất dấu. */
router.get('/export/pdf', async (req, res) => {
  const { start, end } = weekParam(req);
  const s = getState();
  const events = eventsBetween(start, end).filter((e) => e.status !== 'REJECTED');
  try {
    const buffer = await buildWeekPdf({ events, settings: s.settings, weekStart: start, conflicts: s.conflicts });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="lich-tuan-${start}.pdf"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Không dựng được PDF' });
  }
});

/** Số liệu báo cáo tuần dạng JSON (dùng cho biểu đồ hoặc nối sang hệ thống khác). */
router.get('/reports/week', (req, res) => {
  const { start, end } = weekParam(req);
  const s = getState();
  const events = eventsBetween(start, end).filter((e) => e.status !== 'REJECTED');
  res.json(buildWeekReport(events, s.settings, start));
});

/** Báo cáo tháng: tổng hợp theo ngày, theo tuần ISO và theo người. */
router.get('/reports/month', (req, res) => {
  const raw = String(req.query.month || '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) {
    return res.status(422).json({ error: 'Tham số month phải dạng YYYY-MM' });
  }
  const start = `${raw}-01`;
  const nextMonth = new Date(Number(raw.slice(0, 4)), Number(raw.slice(5, 7)), 1);
  const end = toIso(new Date(nextMonth.getTime() - 86400000));
  const s = getState();
  const events = eventsBetween(start, end).filter((e) => e.status !== 'REJECTED');
  res.json(buildMonthReport(events, s.settings, start));
});

router.get('/export/week.json', (req, res) => {  const { start, end } = weekParam(req);
  const s = getState();
  res.json({
    schema_version: s.schema_version,
    exported_at: new Date().toISOString(),
    week: { start, end, week_number: isoWeekNumber(start) },
    settings: s.settings,
    events: eventsBetween(start, end),
    conflicts: s.conflicts,
    publications: s.publications.filter((p) => p.week_start === start),
    sources: s.sources.map(({ raw_text, ...rest }) => rest),
  });
});

// ---------------- Tiện ích miễn phí, chạy hoàn toàn cục bộ ----------------

/** Ngày lễ dương lịch đã biết chắc; ngày âm lịch để văn bản chỉ đạo quyết định. */
router.get('/calendar/holidays', (req, res) => {
  const year = Number(req.query.year || new Date().getFullYear());
  const start = String(req.query.start || '');
  const end = String(req.query.end || '');
  const days = /^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end)
    ? holidaysInRange(start, end)
    : holidaysInYear(Number.isFinite(year) ? year : new Date().getFullYear());
  res.json({ year, start: start || null, end: end || null, days, notice: LUNAR_NOTICE });
});

/** SOI thể thức văn bản lịch theo Nghị định 30/2020 + cảnh báo ngày lễ trùng tuần. */
router.get('/util/format-check', (req, res) => {
  const { start, end } = weekParam(req);
  const s = getState();
  const events = eventsBetween(start, end).filter((e) => e.status !== 'REJECTED');
  const check = checkDocumentFormat({
    events,
    settings: s.settings,
    weekNumber: isoWeekNumber(start),
    conflicts: s.conflicts,
  });
  res.json({
    ...check,
    week: { start, end, week_number: isoWeekNumber(start) },
    holidays: holidaysInRange(start, end),
    notice: LUNAR_NOTICE,
    publication: s.publications.find((p) => p.week_start === start) || null,
  });
});
