import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { newSetupCode, normalizeUsername } from './auth.ts';
import { contentFingerprint } from './engines/document_text.ts';
import {
  AUDIT_LIMIT,
  MEMORY_LIMIT,
  PUBLICATION_LIMIT,
  SESSION_LIMIT,
  WEBHOOK_LOG_LIMIT,
  NOTIFICATION_LOG_LIMIT,
  SENT_REMINDER_LIMIT,
  EVENT_TASK_LIMIT,
  TRASH_LIMIT,
  SHARE_ACCESS_LIMIT,
  EVENT_COMMENT_LIMIT,
  EVENT_VERSION_LIMIT,
  PUSH_SUBSCRIPTION_LIMIT,
  DEFAULT_DRIVE_CONFIG,
  DEFAULT_SETTINGS,
  DEFAULT_WEBHOOK_CONFIG,
  DEFAULT_NOTIFICATION_CONFIG,
  DEFAULT_USER_NOTIFY_PREFS,
  type AuditEntry,
  type AuthMeta,
  type EventComment,
  type EventRecord,
  type EventTask,
  type EventVersion,
  type MemoryRecord,
  type NotificationConfig,
  type NotificationDelivery,
  type PublicationRecord,
  type PushSubscriptionRecord,
  type SessionRecord,
  type ShareAccessRecord,
  type SourceRecord,
  type StoreState,
  type TrashRecord,
  type UserRecord,
  type WebhookConfig,
  type WebhookDelivery,
  type WebhookEvent,
} from './types.ts';

export const SCHEMA_VERSION = 7;
const ROOT = path.resolve(import.meta.dirname, '..');
/** Đặt APP_DATA_DIR để chuyển kho dữ liệu ra ngoài thư mục mã nguồn (an toàn khi deploy). */
export const DATA_DIR = process.env.APP_DATA_DIR ? path.resolve(process.env.APP_DATA_DIR) : path.join(ROOT, 'data');
const STORE_FILE = path.join(DATA_DIR, 'app_store.json');
const SQLITE_EXPORT_FILE = path.join(DATA_DIR, 'schedule_export.json');

export function newId(prefix = 'e'): string {
  return `${prefix}${crypto.randomBytes(6).toString('hex')}`;
}

const LEADER_KEYWORDS = [
  'bí thư', 'phó bí thư', 'chủ tịch', 'phó chủ tịch', 'ủy viên',
  'trưởng ban', 'phó trưởng ban', 'chánh văn phòng', 'phó chánh văn phòng',
  'thường trực', 'ban thường vụ',
];

/** Tách các đồng chí giữ vai trò lãnh đạo khỏi chuỗi chair/participants,
    phục vụ view "theo từng lãnh đạo". */
export function extractLeaders(...fields: (string | null | undefined)[]): string[] {
  const found = new Set<string>();
  for (const raw of fields) {
    if (!raw) continue;
    for (const part of String(raw).replace(/đ\/c/gi, 'đc').split(/[,;]| và |\//)) {
      const name = part.trim().replace(/^(đc|đồng chí|ông|bà)\s+/i, '');
      const lower = name.toLowerCase();
      if (name && name.length <= 60 && LEADER_KEYWORDS.some((kw) => lower.includes(kw))) {
        found.add(name);
      }
    }
  }
  return [...found];
}

function parseJsonList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return value.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  }
}

function normalizeEvent(row: any): EventRecord {
  const status = String(row.status || 'PROPOSED').toUpperCase();
  return {
    id: String(row.id ?? newId('ev')),
    source_id: row.source_id ?? null,
    source_document: row.source_document || '',
    source_page: row.source_page ?? null,
    source_paragraph: row.source_paragraph ?? null,
    event_date: row.event_date || '',
    start_time: row.start_time || '07:00',
    end_time: row.end_time || null,
    title: row.title || '',
    content: row.content || '',
    chair: row.chair || '',
    participants: row.participants || '',
    participant_group: row.participant_group || '',
    location: row.location || '',
    organizer: row.organizer || '',
    preparation: row.preparation || '',
    documents_required: row.documents_required || '',
    contact_person: row.contact_person || '',
    priority_score: Number(row.priority_score ?? 50),
    confidence: Number(row.confidence ?? 0.5),
    status: ['DRAFT', 'PROPOSED', 'APPROVED', 'PUBLISHED', 'REJECTED'].includes(status)
      ? status as EventRecord['status']
      : 'PROPOSED',
    missing_data_fields: parseJsonList(row.missing_data_fields),
    leaders: extractLeaders(row.chair, row.participants),
    also_from: parseJsonList(row.also_from),
    tasks: normalizeTasks(row.tasks),
    series_id: row.series_id ? String(row.series_id) : null,
    created_at: row.created_at || new Date().toISOString(),
    updated_at: row.updated_at || row.created_at || new Date().toISOString(),
  };
}

/** Đầu việc chuẩn bị: chặn văn bản dài quá mức và nhận cả kiểu cũ (danh sách chuỗi). */
export function normalizeTask(row: any): EventTask | null {
  const legacy = typeof row === 'string' ? { text: row } : (row || {});
  const text = String(legacy.text || '').trim().slice(0, 300);
  if (!text) return null;
  const due = String(legacy.due_date || '');
  const done = Boolean(legacy.done);
  return {
    id: String(legacy.id ?? newId('tk')),
    text,
    owner: String(legacy.owner || '').slice(0, 120),
    due_date: /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : '',
    done,
    done_at: done ? (legacy.done_at ? String(legacy.done_at) : new Date().toISOString()) : null,
  };
}

export function normalizeTasks(value: unknown): EventTask[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeTask).filter((t): t is EventTask => Boolean(t)).slice(0, EVENT_TASK_LIMIT);
}

function normalizeSource(row: any): SourceRecord {
  const rawText = row.raw_text || '';
  return {
    id: String(row.id ?? newId('s')),
    file_name: row.file_name || '',
    source_type: row.source_type || 'ghi_chu',
    priority_level: Number(row.priority_level ?? 50),
    uploaded_at: row.uploaded_at || new Date().toISOString(),
    file_size: Number(row.file_size ?? 0),
    parse_status: (row.parse_status || 'DONE') as SourceRecord['parse_status'],
    notes: row.notes || '',
    raw_text: rawText,
    content_hash: String(row.content_hash || (rawText ? contentFingerprint(rawText) : '')),
  };
}

function normalizeAgency(row: any): StoreState['agency_schedules'][number] {
  return {
    id: String(row.id ?? newId('as')),
    week_number: Number(row.week_number ?? 0),
    year: Number(row.year ?? new Date().getFullYear()),
    date_range: row.date_range || '',
    day_of_week: row.day_of_week || '',
    event_date: row.event_date || '',
    time_slot: row.time_slot || '',
    content: row.content || '',
    executor: row.executor || '',
    attendees: row.attendees || '',
    location: row.location || '',
    source_id: row.source_id ?? null,
    source_document: row.source_document || '',
    source_page_para: row.source_page_para || '',
    source_original_content: row.source_original_content || '',
    relevance_category: row.relevance_category || '',
    relevance_reason: row.relevance_reason || '',
    approval_status: row.approval_status || 'DRAFT',
    conflict_warnings: parseJsonList(row.conflict_warnings),
    diff_notes: row.diff_notes || '',
    is_internal: Boolean(row.is_internal),
    sort_order: Number(row.sort_order ?? 0),
    created_at: row.created_at || new Date().toISOString(),
    updated_at: row.updated_at || row.created_at || new Date().toISOString(),
  };
}

function normalizeMemory(row: any): MemoryRecord {
  return {
    id: String(row.id ?? newId('mem')),
    source_text: row.source_text || '',
    agency_content: row.agency_content || '',
    decision_action: row.decision_action || '',
    assigned_executor: row.assigned_executor || '',
    assigned_attendees: row.assigned_attendees || '',
    reason: row.reason || '',
    week_num: Number(row.week_num ?? 0),
    created_at: row.created_at || new Date().toISOString(),
  };
}

const WEBHOOK_EVENTS: WebhookEvent[] = [
  'week.published', 'week.revoked', 'event.created', 'event.updated',
  'event.moved', 'proposal.created', 'conflict.opened',
];

function normalizeUser(row: any): UserRecord {
  const role = row.role === 'admin' || row.role === 'viewer' ? row.role : 'editor';
  const drive = row.drive_setup && typeof row.drive_setup === 'object' ? row.drive_setup : {};
  return {
    id: String(row.id ?? newId('u')),
    username: String(row.username || '').trim().toLowerCase(),
    display_name: row.display_name || row.username || '',
    role,
    password_hash: String(row.password_hash || ''),
    is_active: row.is_active === undefined ? true : Boolean(row.is_active),
    created_at: row.created_at || new Date().toISOString(),
    last_login_at: row.last_login_at ?? null,
    auth_provider: row.auth_provider === 'google' ? 'google' : 'local',
    email: String(row.email || '').trim().toLowerCase(),
    google_sub: String(row.google_sub || ''),
    drive_setup: {
      connected: Boolean(drive.connected),
      folder_id: String(drive.folder_id || ''),
      folder_name: String(drive.folder_name || ''),
      folder_url: String(drive.folder_url || ''),
      connected_at: drive.connected_at || null,
    },
    notify_prefs: normalizeNotifyPrefs(row.notify_prefs),
  };
}

/** Tùy chọn nhận tin riêng: thiếu trường nào thì dùng mặc định của trường đó. */
export function normalizeNotifyPrefs(row: any): UserRecord['notify_prefs'] {
  const base = DEFAULT_USER_NOTIFY_PREFS;
  if (!row || typeof row !== 'object') return { ...base };
  return {
    enabled: row.enabled === undefined ? base.enabled : Boolean(row.enabled),
    digest: row.digest === undefined ? base.digest : Boolean(row.digest),
    reminders: row.reminders === undefined ? base.reminders : Boolean(row.reminders),
    tasks: row.tasks === undefined ? base.tasks : Boolean(row.tasks),
    push: row.push === undefined ? base.push : Boolean(row.push),
  };
}

function normalizeSession(row: any): SessionRecord {
  return {
    id: String(row.id ?? ''),
    user_id: String(row.user_id ?? ''),
    role: row.role === 'admin' || row.role === 'viewer' ? row.role : 'editor',
    created_at: row.created_at || new Date().toISOString(),
    expires_at: row.expires_at || new Date(Date.now() + 86400000).toISOString(),
    last_seen_at: row.last_seen_at || row.created_at || new Date().toISOString(),
    user_agent: String(row.user_agent || ''),
    ip: String(row.ip || ''),
  };
}

function normalizeWebhookConfig(row: any): WebhookConfig {
  const events = Array.isArray(row?.events)
    ? row.events.filter((e: unknown): e is WebhookEvent => WEBHOOK_EVENTS.includes(e as WebhookEvent))
    : [...DEFAULT_WEBHOOK_CONFIG.events];
  return {
    enabled: Boolean(row?.enabled),
    url: String(row?.url || ''),
    secret: String(row?.secret || ''),
    events: events.length ? events : [...DEFAULT_WEBHOOK_CONFIG.events],
    include_details: Boolean(row?.include_details),
  };
}

function normalizeWebhookDelivery(row: any): WebhookDelivery {  return {
    id: String(row.id ?? newId('hook')),
    at: row.at || new Date().toISOString(),
    event: row.event || 'week.published',
    target: row.target || '',
    status: (row.status === 'failed' || row.status === 'skipped' ? row.status : 'sent') as WebhookDelivery['status'],
    http_status: row.http_status ?? null,
    attempts: Number(row.attempts ?? 0),
    error: row.error || '',
  };
}

function normalizeNotificationConfig(row: any): NotificationConfig {
  const base = DEFAULT_NOTIFICATION_CONFIG;
  const hours: number[] = Array.isArray(row?.reminder_before_hours)
    ? row.reminder_before_hours.map(Number).filter((n: number) => Number.isFinite(n) && n > 0 && n <= 168)
    : [...base.reminder_before_hours];
  return {
    enabled: Boolean(row?.enabled),
    telegram: {
      enabled: Boolean(row?.telegram?.enabled),
      bot_token: String(row?.telegram?.bot_token || ''),
      chat_id: String(row?.telegram?.chat_id || ''),
    },
    zalo: {
      enabled: Boolean(row?.zalo?.enabled),
      access_token: String(row?.zalo?.access_token || ''),
      recipient_id: String(row?.zalo?.recipient_id || ''),
    },
    email: {
      enabled: Boolean(row?.email?.enabled),
      smtp_host: String(row?.email?.smtp_host || ''),
      smtp_port: Number(row?.email?.smtp_port ?? 587),
      secure: Boolean(row?.email?.secure),
      user: String(row?.email?.user || ''),
      pass: String(row?.email?.pass || ''),
      from: String(row?.email?.from || ''),
      to: Array.isArray(row?.email?.to) ? row.email.to.map(String).filter(Boolean) : [],
    },
    daily_digest_enabled: row?.daily_digest_enabled === undefined ? base.daily_digest_enabled : Boolean(row.daily_digest_enabled),
    daily_digest_time: /^\d{2}:\d{2}$/.test(String(row?.daily_digest_time || '')) ? String(row.daily_digest_time) : base.daily_digest_time,
    reminder_enabled: row?.reminder_enabled === undefined ? base.reminder_enabled : Boolean(row.reminder_enabled),
    reminder_before_hours: hours.length ? [...new Set(hours)].sort((a: number, b: number) => b - a) : [...base.reminder_before_hours],
    include_details: Boolean(row?.include_details),
  };
}

function normalizeNotificationDelivery(row: any): NotificationDelivery {
  return {
    id: String(row.id ?? newId('ntf')),
    at: row.at || new Date().toISOString(),
    channel: ['telegram', 'email', 'webhook'].includes(row.channel) ? row.channel : 'telegram',
    kind: ['digest', 'reminder', 'test', 'publish'].includes(row.kind) ? row.kind : 'test',
    target: String(row.target || ''),
    status: ['sent', 'failed', 'skipped'].includes(row.status) ? row.status : 'failed',
    error: String(row.error || ''),
  };
}

function normalizeTrash(row: any): TrashRecord {
  const event = normalizeEvent(row?.event || {});
  return {
    id: String(row?.id ?? newId('tr')),
    deleted_at: row?.deleted_at || new Date().toISOString(),
    deleted_by: row?.deleted_by ? String(row.deleted_by) : null,
    event,
  };
}

function normalizeComment(row: any): EventComment {
  return {
    id: String(row?.id ?? newId('cm')),
    event_id: String(row?.event_id ?? ''),
    author: String(row?.author || 'Ẩn danh').slice(0, 120),
    text: String(row?.text || '').slice(0, 2000),
    created_at: row?.created_at || new Date().toISOString(),
  };
}

function normalizeVersion(row: any): EventVersion {
  return {
    id: String(row?.id ?? newId('ver')),
    event_id: String(row?.event_id ?? ''),
    at: row?.at || new Date().toISOString(),
    actor: String(row?.actor || 'hệ thống').slice(0, 120),
    action: String(row?.action || 'update').slice(0, 60),
    changed: Array.isArray(row?.changed) ? row.changed.map(String).slice(0, 40) : [],
    snapshot: row?.snapshot && typeof row.snapshot === 'object' ? row.snapshot : {},
  };
}

function normalizePushSubscription(row: any): PushSubscriptionRecord {
  return {
    id: String(row?.id ?? newId('push')),
    user_id: String(row?.user_id ?? ''),
    endpoint: String(row?.endpoint || ''),
    p256dh: String(row?.p256dh || ''),
    auth: String(row?.auth || ''),
    created_at: row?.created_at || new Date().toISOString(),
  };
}

function emptyState(): StoreState {
  return {
    schema_version: SCHEMA_VERSION,
    sources: [],
    events: [],
    conflicts: [],
    agency_schedules: [],
    personnel: [],
    memory: [],
    brain_nodes: [],
    publications: [],
    drive_config: { ...DEFAULT_DRIVE_CONFIG },
    settings: { ...DEFAULT_SETTINGS, travel_buffers: { ...DEFAULT_SETTINGS.travel_buffers } },
    audit_log: [],
    trash: [],
    share_access: [],
    users: [],
    sessions: [],
    auth: { setup_code: '', setup_code_created_at: null },
    webhook_config: { ...DEFAULT_WEBHOOK_CONFIG, events: [...DEFAULT_WEBHOOK_CONFIG.events] },
    webhook_log: [],
    notifications: { ...DEFAULT_NOTIFICATION_CONFIG },
    notification_log: [],
    last_digest_date: '',
    sent_reminders: [],
    event_comments: [],
    event_versions: [],
    push_subscriptions: [],
    ics_token: '',
  };
}

function fromSqliteExport(tables: Record<string, any[]>): StoreState {
  const state = emptyState();
  state.sources = (tables.sources || []).map(normalizeSource);
  state.events = (tables.events || []).map(normalizeEvent);
  state.conflicts = (tables.conflicts || []).map((row) => ({
    id: String(row.id ?? newId('cf')),
    event_id_1: String(row.event_id_1),
    event_id_2: String(row.event_id_2),
    conflict_type: row.conflict_type || 'OVERLAP_TIME',
    severity: row.severity || 'WARNING',
    description: row.description || '',
    resolution_suggestion: row.resolution_suggestion || '',
    status: (row.status || 'OPEN') as 'OPEN' | 'RESOLVED',
    created_at: row.created_at || new Date().toISOString(),
  }));
  state.agency_schedules = (tables.agency_schedules || []).map(normalizeAgency);
  state.personnel = (tables.bxdd_personnel || []).map((row) => ({
    id: String(row.id ?? newId('nv')),
    name: row.name || '',
    title: row.title || '',
    role_description: row.role_description || '',
    is_active: Number(row.is_active ?? 1),
  }));
  state.memory = (tables.schedule_learning_memory || []).map(normalizeMemory);
  return state;
}

let state: StoreState | null = null;

/** Migration an toàn: mọi bản store cũ đều được chuẩn hoá lại theo schema hiện tại,
    không dựng lại từ đầu (tránh mất lịch thật khi nâng SCHEMA_VERSION). */
export function migrateState(parsed: Record<string, any>): StoreState {
  const base = emptyState();
  return {
    ...base,
    ...parsed,
    schema_version: SCHEMA_VERSION,
    sources: (parsed.sources || []).map(normalizeSource),
    events: (parsed.events || []).map(normalizeEvent),
    agency_schedules: (parsed.agency_schedules || []).map(normalizeAgency),
    memory: (parsed.memory || []).map(normalizeMemory),
    publications: (parsed.publications || []).map((row: any): PublicationRecord => ({
      id: String(row.id ?? newId('pb')),
      week_number: Number(row.week_number ?? 0),
      year: Number(row.year ?? 0),
      week_start: row.week_start || '',
      week_end: row.week_end || '',
      document_number: row.document_number || '',
      signer: row.signer || '',
      unit_name: row.unit_name || '',
      published_at: row.published_at || new Date().toISOString(),
      event_ids: parseJsonList(row.event_ids),
      share_token: /^[a-f0-9]{16,48}$/i.test(String(row.share_token || '')) ? String(row.share_token) : '',
      share_expires_at: row.share_expires_at && !Number.isNaN(new Date(row.share_expires_at).getTime())
        ? new Date(row.share_expires_at).toISOString()
        : null,
      share_pin: /^\d{4,6}$/.test(String(row.share_pin || '')) ? String(row.share_pin) : '',
    })),
    trash: (parsed.trash || []).map(normalizeTrash).slice(-TRASH_LIMIT),
    share_access: (parsed.share_access || []).map((row: any): ShareAccessRecord => ({
      token: String(row?.token || ''),
      week_start: String(row?.week_start || ''),
      viewed_at: row?.viewed_at || new Date().toISOString(),
    })).slice(-SHARE_ACCESS_LIMIT),
    drive_config: { ...DEFAULT_DRIVE_CONFIG, ...(parsed.drive_config || {}) },
    settings: {
      ...DEFAULT_SETTINGS,
      ...(parsed.settings || {}),
      travel_buffers: { ...DEFAULT_SETTINGS.travel_buffers, ...(parsed.settings?.travel_buffers || {}) },
      working_hours: { ...DEFAULT_SETTINGS.working_hours, ...(parsed.settings?.working_hours || {}) },
    },
    users: (parsed.users || []).map(normalizeUser),
    sessions: (parsed.sessions || []).map(normalizeSession),
    auth: { ...emptyState().auth, ...(parsed.auth || {}) } as AuthMeta,
    webhook_config: normalizeWebhookConfig(parsed.webhook_config),
    webhook_log: (parsed.webhook_log || []).map(normalizeWebhookDelivery),
    notifications: normalizeNotificationConfig(parsed.notifications),
    notification_log: (parsed.notification_log || []).map(normalizeNotificationDelivery).slice(-NOTIFICATION_LOG_LIMIT),
    last_digest_date: String(parsed.last_digest_date || ''),
    sent_reminders: Array.isArray(parsed.sent_reminders)
      ? parsed.sent_reminders.map(String).slice(-SENT_REMINDER_LIMIT)
      : [],
    event_comments: (parsed.event_comments || []).map(normalizeComment).slice(-5000),
    event_versions: (parsed.event_versions || []).map(normalizeVersion).slice(-5000),
    push_subscriptions: (parsed.push_subscriptions || []).map(normalizePushSubscription).slice(-PUSH_SUBSCRIPTION_LIMIT),
    ics_token: /^[a-f0-9]{16,64}$/i.test(String(parsed.ics_token || '')) ? String(parsed.ics_token) : '',
    audit_log: (parsed.audit_log || []).map((row: any): AuditEntry => ({
      id: String(row.id ?? newId('log')),
      at: row.at || new Date().toISOString(),
      action: row.action || '',
      entity: row.entity || '',
      entity_id: String(row.entity_id ?? ''),
      detail: row.detail || '',
      actor: row.actor ?? null,
      ip: row.ip ?? null,
    })),
  };
}

function load(): StoreState {
  if (fs.existsSync(STORE_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')) as Record<string, any>;
      if (Array.isArray(parsed.events)) {
        if (parsed.schema_version !== SCHEMA_VERSION) {
          fs.copyFileSync(STORE_FILE, `${STORE_FILE}.v${parsed.schema_version ?? 0}.bak`);
        }
        return migrateState(parsed);
      }
      fs.copyFileSync(STORE_FILE, `${STORE_FILE}.malformed.bak`);
    } catch {
      fs.copyFileSync(STORE_FILE, `${STORE_FILE}.corrupt.bak`);
    }
  }
  if (fs.existsSync(SQLITE_EXPORT_FILE)) {
    const dump = JSON.parse(fs.readFileSync(SQLITE_EXPORT_FILE, 'utf8'));
    return migrateState(fromSqliteExport(dump.tables || {}));
  }
  return emptyState();
}

export function getState(): StoreState {
  if (!state) state = load();
  return state;
}

/** Sự kiện trong một khoảng ngày, sắp xếp theo ngày rồi giờ. */
export function eventsBetween(start: string, end: string): EventRecord[] {
  return getState()
    .events.filter((e) => e.event_date >= start && e.event_date <= end)
    .sort((a, b) => `${a.event_date} ${a.start_time}`.localeCompare(`${b.event_date} ${b.start_time}`));
}

/** Ghi thêm một bài học cho AI; giữ tối đa MEMORY_LIMIT dòng mới nhất. */
export function rememberLesson(lesson: Omit<MemoryRecord, 'id' | 'created_at'>): MemoryRecord {
  const record: MemoryRecord = { ...lesson, id: newId('mem'), created_at: new Date().toISOString() };
  const s = getState();
  s.memory.push(record);
  if (s.memory.length > MEMORY_LIMIT) s.memory = s.memory.slice(-MEMORY_LIMIT);
  return record;
}

/** Ghi một lần ban hành tuần, giữ tối đa PUBLICATION_LIMIT dòng gần nhất. */
export function rememberPublication(pub: Omit<PublicationRecord, 'id' | 'published_at' | 'share_token' | 'share_expires_at' | 'share_pin'>): PublicationRecord {
  const record: PublicationRecord = {
    ...pub,
    share_token: '',
    share_expires_at: null,
    share_pin: '',
    id: newId('pb'),
    published_at: new Date().toISOString(),
  };
  const s = getState();
  s.publications.push(record);
  if (s.publications.length > PUBLICATION_LIMIT) s.publications = s.publications.slice(-PUBLICATION_LIMIT);
  return record;
}

export function persist(): void {
  if (!state) return;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${STORE_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmp, STORE_FILE);
}

export function recordAudit(
  action: string,
  entity: string,
  entityId: string,
  detail: string,
  actor: { username?: string | null; ip?: string | null } = {},
): void {
  const entry: AuditEntry = {
    id: newId('log'),
    at: new Date().toISOString(),
    action,
    entity,
    entity_id: entityId,
    detail,
    actor: actor.username ?? null,
    ip: actor.ip ?? null,
  };
  const s = getState();
  s.audit_log.push(entry);
  if (s.audit_log.length > AUDIT_LIMIT) {
    s.audit_log = s.audit_log.slice(-AUDIT_LIMIT);
  }
}

/** Xoá phiên hết hạn và cắt danh sách về SESSION_LIMIT phiên mới nhất. Trả về số dòng đã gỡ. */
export function pruneSessions(s: StoreState, now = new Date()): number {
  const before = s.sessions.length;
  const alive = s.sessions.filter((session) => new Date(session.expires_at).getTime() > now.getTime());
  s.sessions = alive.length > SESSION_LIMIT ? alive.slice(-SESSION_LIMIT) : alive;
  return before - s.sessions.length;
}

/** Ghi một lần thử gửi webhook, giữ WEBHOOK_LOG_LIMIT dòng gần nhất. */
export function rememberWebhookDelivery(delivery: Omit<WebhookDelivery, 'id'>): WebhookDelivery {
  const record: WebhookDelivery = { ...delivery, id: newId('hook') };
  const s = getState();
  s.webhook_log.push(record);
  if (s.webhook_log.length > WEBHOOK_LOG_LIMIT) s.webhook_log = s.webhook_log.slice(-WEBHOOK_LOG_LIMIT);
  return record;
}

/** Ghi một lần gửi thông báo (Telegram/email/webhook), giữ NOTIFICATION_LOG_LIMIT dòng. */
export function rememberNotification(delivery: Omit<NotificationDelivery, 'id'>): NotificationDelivery {
  const record: NotificationDelivery = { ...delivery, id: newId('ntf') };
  const s = getState();
  s.notification_log.push(record);
  if (s.notification_log.length > NOTIFICATION_LOG_LIMIT) {
    s.notification_log = s.notification_log.slice(-NOTIFICATION_LOG_LIMIT);
  }
  return record;
}

export function markReminderSent(key: string): void {
  const s = getState();
  s.sent_reminders.push(key);
  if (s.sent_reminders.length > SENT_REMINDER_LIMIT) {
    s.sent_reminders = s.sent_reminders.slice(-SENT_REMINDER_LIMIT);
  }
}

export function mutate(fn: (s: StoreState) => void): void {
  fn(getState());
  persist();
}

export function storeFileLocation(): string {
  return STORE_FILE;
}

/** Chuỗi 32 ký tự hex dùng làm khoá đường dẫn chia sẻ công khai. */
export function newShareToken(): string {
  return crypto.randomBytes(16).toString('hex');
}

/** Ghi một lượt xem trang chia sẻ; chỉ giữ lúc xem, không giữ IP hay nội dung. */
export function noteShareAccess(token: string, weekStart: string): void {
  const s = getState();
  s.share_access.push({ token, week_start: weekStart, viewed_at: new Date().toISOString() });
  if (s.share_access.length > SHARE_ACCESS_LIMIT) {
    s.share_access = s.share_access.slice(-SHARE_ACCESS_LIMIT);
  }
}

/** Ghi một ý kiến duyệt lịch; mỗi mục lịch giữ tối đa EVENT_COMMENT_LIMIT ý kiến. */
export function addEventComment(eventId: string, author: string, text: string): EventComment {
  const s = getState();
  const record: EventComment = {
    id: newId('cm'),
    event_id: eventId,
    author: String(author || 'Ẩn danh').slice(0, 120),
    text: String(text || '').slice(0, 2000),
    created_at: new Date().toISOString(),
  };
  s.event_comments.push(record);
  const mine = s.event_comments.filter((c) => c.event_id === eventId);
  if (mine.length > EVENT_COMMENT_LIMIT) {
    const drop = new Set(mine.slice(0, mine.length - EVENT_COMMENT_LIMIT).map((c) => c.id));
    s.event_comments = s.event_comments.filter((c) => !drop.has(c.id));
  }
  return record;
}

/** Ghi lịch sử thay đổi của một mục lịch; giữ EVENT_VERSION_LIMIT bản gần nhất mỗi mục. */
export function addEventVersion(
  eventId: string,
  actor: string,
  action: string,
  changed: string[],
  snapshot: Partial<EventRecord>,
): EventVersion {
  const s = getState();
  const record: EventVersion = {
    id: newId('ver'),
    event_id: eventId,
    at: new Date().toISOString(),
    actor: String(actor || 'hệ thống').slice(0, 120),
    action: String(action || 'update').slice(0, 60),
    changed: changed.slice(0, 40),
    snapshot: { ...snapshot },
  };
  s.event_versions.push(record);
  const mine = s.event_versions.filter((v) => v.event_id === eventId);
  if (mine.length > EVENT_VERSION_LIMIT) {
    const drop = new Set(mine.slice(0, mine.length - EVENT_VERSION_LIMIT).map((v) => v.id));
    s.event_versions = s.event_versions.filter((v) => !drop.has(v.id));
  }
  return record;
}

/** Khoá feed .ics dùng chung; sinh một lần rồi giữ nguyên cho tới khi quản trị viên đổi. */
export function ensureIcsToken(): string {
  const s = getState();
  if (!s.ics_token) {
    s.ics_token = crypto.randomBytes(20).toString('hex');
    persist();
  }
  return s.ics_token;
}

export function rotateIcsToken(): string {
  const s = getState();
  s.ics_token = crypto.randomBytes(20).toString('hex');
  persist();
  return s.ics_token;
}

/**
 * Nạp toàn bộ kho từ một bản sao lưu đã kiểm tra cấu trúc (phục hồi qua giao diện).
 * Bản đang chạy phải được ghi ra tệp snapshot trước khi gọi hàm này.
 */
export function replaceState(parsed: Record<string, any>): StoreState {
  state = migrateState(parsed);
  persist();
  return state;
}

/**
 * Lần chạy đầu khi chưa có tài khoản nào: sinh mã khởi tạo 8 ký tự hex và trả về để in ra console.
 * Ai muốn tạo tài khoản quản trị đầu tiên phải đọc được mã này từ máy chủ — chặn người lạ
 * chiếm quyền khi ứng dụng ra ngoài mạng.
 */
export function bootstrapAuth(): string | null {
  const s = getState();
  if (s.users.length) return null;
  if (!s.auth.setup_code) {
    s.auth.setup_code = newSetupCode();
    s.auth.setup_code_created_at = new Date().toISOString();
    persist();
  }
  return s.auth.setup_code;
}

export function findUserByName(username: string): UserRecord | undefined {
  return getState().users.find((u) => u.username === normalizeUsername(username));
}
