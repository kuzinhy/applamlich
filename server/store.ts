import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { hashPassword, newSetupCode, normalizeUsername } from './auth.ts';
import seedStoreData from '../data/seed_store.json';
import { contentFingerprint } from './engines/document_text.ts';
import {
  buildCloudPayload,
  cloudConfig,
  cloudEnabled,
  commitRemote,
  fetchRemote,
  mergeCloudState,
  watchRemote,
  LOCAL_ONLY_FIELDS,
  type RemoteSnapshot,
} from './services/cloud_store.ts';
import {
  normalizeSheetSync,
  pullEventsFromSheet,
  pushEventsToSheet,
  applyPullUpdates,
  selectSyncEvents,
  setSheetBaselineFile,
  sheetCredentialStatus,
  sheetSyncHint,
  type PullReport,
  type PushReport,
  type SheetSyncSettings,
} from './services/sheet_store.ts';
import { parseClock, formatClock, cleanVietnameseOcrText, approximateClock } from './utils/clock.ts';
import { canonicalWeekdayVi } from './utils/dates.ts';
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
  DEFAULT_DRIVE_SETUP,
  DEFAULT_SETTINGS,
  DEFAULT_WEBHOOK_CONFIG,
  DEFAULT_NOTIFICATION_CONFIG,
  DEFAULT_USER_NOTIFY_PREFS,
  ORG_ADMIN_LEVELS,
  cloneOrgProfile,
  type AuditEntry,
  type AuthMeta,
  type EventComment,
  type EventRecord,
  type EventTask,
  type EventVersion,
  type MemoryRecord,
  type NotificationConfig,
  type NotificationDelivery,
  type OrgConveningRule,
  type OrgPost,
  type OrgProfile,
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
const isVercel = Boolean(process.env.VERCEL || process.env.NOW_REGION);
/** Đặt APP_DATA_DIR để chuyển kho dữ liệu ra ngoài thư mục mã nguồn (an toàn khi deploy). */
export const DATA_DIR = process.env.APP_DATA_DIR
  ? path.resolve(process.env.APP_DATA_DIR)
  : (isVercel ? path.join('/tmp', 'data') : path.join(ROOT, 'data'));
const STORE_FILE = path.join(DATA_DIR, 'app_store.json');
const SEED_FILE = path.join(ROOT, 'data', 'seed_store.json');
/** Mốc "dòng ta để lại lần trước" cho Sheet — cache riêng, không nằm trong store để không bị nhân bản ra seed công khai. */
setSheetBaselineFile(path.join(DATA_DIR, 'sheet_sync_cache.json'));

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
  const title = cleanVietnameseOcrText(row.title || '');
  const content = cleanVietnameseOcrText(row.content || '');
  // Giờ để trống nghĩa là văn bản không ghi giờ -> giữ nguyên trống để báo "chưa rõ giờ", không gán khống 07:00.
  const rawStart = String(row.start_time ?? '').trim();
  const parsedStart = parseClock(rawStart, `${title} ${content}`);
  const normalizedStart = parsedStart !== null ? formatClock(parsedStart) : rawStart;

  return {
    id: String(row.id ?? newId('ev')),
    source_id: row.source_id ?? null,
    source_document: row.source_document || '',
    source_page: row.source_page ?? null,
    source_paragraph: row.source_paragraph ?? null,
    event_date: row.event_date || '',
    start_time: normalizedStart,
    end_time: row.end_time || null,
    title,
    content,
    chair: cleanVietnameseOcrText(row.chair || ''),
    participants: cleanVietnameseOcrText(row.participants || ''),
    participant_group: row.participant_group || '',
    location: cleanVietnameseOcrText(row.location || ''),
    organizer: cleanVietnameseOcrText(row.organizer || ''),
    preparation: cleanVietnameseOcrText(row.preparation || ''),
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
    sort_order: typeof row.sort_order === 'number' && Number.isFinite(row.sort_order) ? row.sort_order : undefined,
    is_supplemental: Boolean(row.is_supplemental),
    supplemental_note: String(row.supplemental_note || ''),
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
  const eventDate = String(row.event_date || '').trim();
  let content = cleanVietnameseOcrText(String(row.content || '')).trim();
  let timeSlot = cleanVietnameseOcrText(String(row.time_slot || '')).trim();
  const mins = parseClock(timeSlot, content);
  if (mins !== null) {
    const h = String(Math.floor(mins / 60)).padStart(2, '0');
    const m = String(mins % 60).padStart(2, '0');
    // Chuẩn hóa các giờ bị cắt số hoặc ghi giờ chiều dạng 1..5 giờ -> "14 giờ 00"
    if (/^[1-5]\s*(?:[:hg]|giờ)/i.test(timeSlot) || /^\d\s+\d/.test(String(row.time_slot || ''))) {
      timeSlot = `${h} giờ ${m}`;
    }
  }
  // Bỏ tiền tố giờ bị lặp ở đầu nội dung công việc (ví dụ: "14g00 Họp chi bộ..." -> "Họp chi bộ...")
  content = content.replace(/^\d{1,2}\s*(?:[:hg]|giờ)\s*\d{0,2}\s*[-–:]?\s*/i, '').trim();

  return {
    id: String(row.id ?? newId('as')),
    week_number: Number(row.week_number ?? 0),
    year: Number(row.year ?? new Date().getFullYear()),
    date_range: row.date_range || '',
    day_of_week: canonicalWeekdayVi(row.day_of_week, eventDate),
    event_date: eventDate,
    time_slot: timeSlot,
    content,
    executor: cleanVietnameseOcrText(row.executor || ''),
    attendees: cleanVietnameseOcrText(row.attendees || ''),
    location: cleanVietnameseOcrText(row.location || ''),
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
    is_supplemental: Boolean(row.is_supplemental),
    supplemental_note: String(row.supplemental_note || ''),
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

/** Tách một ô nhập thành danh sách từ ngắn gọn, bỏ trùng, bỏ rỗng. */
function wordList(value: unknown, limit: number): string[] {
  const raw = Array.isArray(value)
    ? value.map((x) => String(x ?? ''))
    : String(value ?? '').split(/[,;\n]/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const word = item.trim().replace(/\s+/g, ' ');
    if (word.length < 2 || word.length > 80) continue;
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(word);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Hồ sơ cơ quan luôn có đủ khung để giao diện render, kể cả khi store cũ chưa có.
 * Chức danh không có người giữ vẫn được giữ lại (holder rỗng) vì đó là phần cán bộ
 * chưa bổ nhiệm — engine coi rỗng là "không được phép gợi ý ai".
 */
export function normalizeOrgProfile(row: any): OrgProfile {
  const base = cloneOrgProfile();
  const level = String(row?.admin_level ?? base.admin_level).trim();
  const known = ORG_ADMIN_LEVELS.find((l) => l.id === level);
  const posts = Array.isArray(row?.posts)
    ? row.posts
        .map((p: any, index: number) => ({
          id: String(p?.id ?? `post_${index + 1}`),
          title: String(p?.title ?? '').trim().slice(0, 80),
          holder: String(p?.holder ?? '').trim().replace(/\s+/g, ' ').slice(0, 80),
          seniority: Math.min(99, Math.max(1, Number(p?.seniority) || index + 1)),
          aliases: wordList(p?.aliases, 8),
          deputy_title: String(p?.deputy_title ?? '').trim().slice(0, 80),
        }))
        .filter((p: OrgPost) => p.title)
        .slice(0, 30)
    : base.posts;
  const rules = Array.isArray(row?.convening_rules)
    ? row.convening_rules
        .map((r: any, index: number) => ({
          id: String(r?.id ?? `cv_${index + 1}`),
          convener: String(r?.convener ?? '').trim().slice(0, 80),
          keywords: wordList(r?.keywords, 12),
          required_titles: wordList(r?.required_titles, 8),
        }))
        .filter((r: OrgConveningRule) => r.convener && r.keywords.length && r.required_titles.length)
        .slice(0, 20)
    : base.convening_rules;
  return {
    admin_level: known ? known.id : 'khac',
    admin_level_label: known ? known.label : String(row?.admin_level_label ?? '').trim().slice(0, 40),
    aliases: wordList(row?.aliases, 12),
    address: String(row?.address ?? '').trim().slice(0, 200),
    phone: String(row?.phone ?? '').trim().slice(0, 40),
    email: String(row?.email ?? '').trim().slice(0, 80),
    liaison: String(row?.liaison ?? '').trim().slice(0, 120),
    posts,
    convening_rules: rules,
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
    settings: {
      ...DEFAULT_SETTINGS,
      travel_buffers: { ...DEFAULT_SETTINGS.travel_buffers },
      org_profile: cloneOrgProfile(),
    },
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

let state: StoreState | null = null;
let storeRevision = 1;
let seedSyncTimer: ReturnType<typeof setTimeout> | null = null;

export function getStoreRevision(): number {
  return storeRevision;
}

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
    drive_config: {
      folder_id: parsed.drive_config?.folder_id || DEFAULT_DRIVE_CONFIG.folder_id,
      folder_name: parsed.drive_config?.folder_name || DEFAULT_DRIVE_CONFIG.folder_name,
      folder_url: parsed.drive_config?.folder_url || DEFAULT_DRIVE_CONFIG.folder_url,
      connected: parsed.drive_config?.connected ?? true,
    },
    settings: {
      ...DEFAULT_SETTINGS,
      ...(parsed.settings || {}),
      travel_buffers: { ...DEFAULT_SETTINGS.travel_buffers, ...(parsed.settings?.travel_buffers || {}) },
      working_hours: { ...DEFAULT_SETTINGS.working_hours, ...(parsed.settings?.working_hours || {}) },
      org_profile: normalizeOrgProfile(parsed.settings?.org_profile),
      // Sheet cũ có thể thiếu cột (mới bật) — chuẩn hoá để không nơi nào phải kiểm tra `?.sheet_sync?.`.
      sheet_sync: normalizeSheetSync(parsed.settings?.sheet_sync),
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

/**
 * data/seed_store.json được push lên repo công khai và là kho khởi động của bản deploy,
 * nên không được mang theo phiên đang sống, nhật ký có IP, khoá chia sẻ, token feed ICS,
 * hash mật khẩu hay định danh thư mục Drive. Bản này chỉ cắt khoá truy cập —
 * lịch, nguồn, cán bộ vẫn nguyên; deploy mới sẽ chạy màn khởi tạo để tự đặt tài khoản.
 */
export function stripSeedSecrets(parsed: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = { ...parsed };
  for (const field of LOCAL_ONLY_FIELDS) out[field] = [];
  out.ics_token = '';
  out.publications = (out.publications || []).map((row: any) =>
    row && typeof row === 'object' ? { ...row, share_token: '', share_pin: '' } : row,
  );
  out.users = [];
  out.auth = { ...(out.auth || {}), setup_code: '', setup_code_created_at: '' };
  if (out.drive_config && typeof out.drive_config === 'object') {
    out.drive_config = { ...out.drive_config, folder_id: '', folder_url: '', connected: false };
  }
  return out;
}

function load(): StoreState {
  if (fs.existsSync(STORE_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')) as Record<string, any>;
      if (Array.isArray(parsed.events)) {
        if (parsed.schema_version !== SCHEMA_VERSION) {
          try {
            fs.copyFileSync(STORE_FILE, `${STORE_FILE}.v${parsed.schema_version ?? 0}.bak`);
          } catch {}
        }
        return migrateState(parsed);
      }
    } catch {}
  }

  if (fs.existsSync(SEED_FILE)) {
    try {
      const diskSeed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8')) as Record<string, any>;
      if (Array.isArray(diskSeed.events)) {
        return migrateState(stripSeedSecrets(diskSeed));
      }
    } catch {}
  }

  if (seedStoreData && Array.isArray((seedStoreData as any).events)) {
    try {
      return migrateState(stripSeedSecrets(seedStoreData as Record<string, any>));
    } catch {}
  }

  return emptyState();
}

export function getState(): StoreState {
  if (!state) {
    state = load();
    bootstrapAuth();
    if (!fs.existsSync(STORE_FILE)) {
      persist();
    }
  }
  return state;
}

/** Mục đã bị từ chối: vẫn lưu để tra lại, nhưng không hiện trên lịch, không vào thống kê, không xuất file, không nhắc việc. */
export function isBooked(event: Pick<EventRecord, 'status'>): boolean {
  return String(event.status || '').toUpperCase() !== 'REJECTED';
}

/** Thứ tự chuẩn của một mục lịch: ngày -> thứ tự kéo-thả -> giờ (kể cả mục chưa rõ giờ) -> tên. */
export function compareEventOrder(a: EventRecord, b: EventRecord): number {
  const d = String(a.event_date || '').localeCompare(String(b.event_date || ''));
  if (d !== 0) return d;
  if (typeof a.sort_order === 'number' && typeof b.sort_order === 'number' && a.sort_order !== b.sort_order) {
    return a.sort_order - b.sort_order;
  }
  const ta = approximateClock(a.start_time, `${a.title || ''} ${a.content || ''}`);
  const tb = approximateClock(b.start_time, `${b.title || ''} ${b.content || ''}`);
  if (ta !== tb) return ta - tb;
  return String(a.title || '').localeCompare(String(b.title || ''), 'vi');
}

/** Sự kiện trong một khoảng ngày, sắp theo compareEventOrder; mặc định đã loại mục bị từ chối. */
export function eventsBetween(start: string, end: string, options: { includeRejected?: boolean } = {}): EventRecord[] {
  return getState()
    .events.filter((e) => e.event_date >= start && e.event_date <= end && (options.includeRejected === true || isBooked(e)))
    .sort(compareEventOrder);
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
  storeRevision += 1;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${STORE_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tmp, STORE_FILE);
  } catch (err) {
    console.warn('Lưu trữ app_store.json không thành công (môi trường serverless):', err);
  }

  // Đồng bộ tự động sang data/seed_store.json khi chạy ở máy phát triển (gom nhóm bất đồng bộ tránh nghẽn I/O)
  if (!isVercel && !process.env.APP_DATA_DIR && process.env.NODE_ENV !== 'test') {
    if (seedSyncTimer) clearTimeout(seedSyncTimer);
    seedSyncTimer = setTimeout(() => {
      seedSyncTimer = null;
      if (!state) return;
      try {
        const seedPayload = stripSeedSecrets(state as unknown as Record<string, any>);
        const seedTmp = `${SEED_FILE}.${process.pid}.tmp`;
        fs.writeFileSync(seedTmp, JSON.stringify(seedPayload, null, 2), 'utf8');
        fs.renameSync(seedTmp, SEED_FILE);
      } catch {
        // Bỏ qua nếu thư mục không cho phép ghi
      }
    }, 250);
    seedSyncTimer.unref?.();
  }

  if (cloudEnabled() && !applyingCloud) queueCloudPush();
  if (!applyingSheet) queueSheetPush();
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

// ---------------------------------------------------------------- đồng bộ cloud (Firestore)

let cloudBaseRevision = 0;
let cloudPushTimer: ReturnType<typeof setTimeout> | null = null;
let cloudPushing: Promise<void> | null = null;
let applyingCloud = false;
let cloudLastError = '';
let cloudLastPushAt = '';
let cloudUnwatch: (() => void) | null = null;
const cloudListeners = new Set<() => void>();

export type CloudStatus = {
  enabled: boolean;
  doc_key: string;
  base_revision: number;
  pending: boolean;
  watching: boolean;
  last_push_at: string;
  last_error: string;
};

export function cloudStatus(): CloudStatus {
  const cfg = cloudConfig();
  return {
    enabled: cloudEnabled(),
    doc_key: cfg?.docKey || '',
    base_revision: cloudBaseRevision,
    pending: Boolean(cloudPushTimer) || Boolean(cloudPushing),
    watching: Boolean(cloudUnwatch),
    last_push_at: cloudLastPushAt,
    last_error: cloudLastError,
  };
}

/** Đăng ký nhận thông báo khi nội dung từ cloud được áp vào bộ nhớ. */
export function onCloudUpdate(cb: () => void): () => void {
  cloudListeners.add(cb);
  return () => cloudListeners.delete(cb);
}

/** Gộp bản đọc được từ cloud vào state đang chạy; phần chỉ có ở máy này vẫn giữ. */
export function applyCloudSnapshot(snap: RemoteSnapshot): void {
  applyingCloud = true;
  try {
    state = migrateState(mergeCloudState(getState() as Record<string, any>, snap.payload));
    cloudBaseRevision = snap.revision;
    persist();
  } finally {
    applyingCloud = false;
  }
  for (const cb of cloudListeners) {
    try { cb(); } catch { /* listener hỏng không được làm hỏng đồng bộ */ }
  }
}

/** Mở đường theo dõi document để máy này thấy ngay khi máy khác ghi. */
export function startCloudWatch(): void {
  if (cloudUnwatch || !cloudEnabled()) return;
  try {
    cloudUnwatch = watchRemote((snap) => {
      if (!snap || applyingCloud || cloudPushing || snap.revision === cloudBaseRevision) return;
      applyCloudSnapshot(snap);
    });
  } catch (err) {
    cloudLastError = String((err as Error)?.message || err);
  }
}

/**
 * Khởi động đồng bộ: cloud đã có dữ liệu thì cloud là nguồn chuẩn;
 * cloud còn trống thì đẩy dữ liệu máy này lên một lần để các máy khác thấy chung.
 */
export async function bootstrapCloud(): Promise<{ mode: 'off' | 'pulled' | 'seeded' | 'error'; detail?: string }> {
  if (!cloudEnabled()) return { mode: 'off' };
  try {
    const remote = await fetchRemote();
    if (!remote) {
      const res = await commitRemote(buildCloudPayload(getState() as Record<string, any>), 0);
      // tsconfig tắt strictNullChecks nên `res.ok` không thu hẹp được union: tách nhánh bằng `in`.
      if (!('remote' in res)) {
        cloudBaseRevision = res.revision;
        cloudLastPushAt = new Date().toISOString();
        startCloudWatch();
        return { mode: 'seeded' };
      }
      applyCloudSnapshot(res.remote);
      startCloudWatch();
      return { mode: 'pulled' };
    }
    applyCloudSnapshot(remote);
    startCloudWatch();
    return { mode: 'pulled', detail: `revision ${remote.revision}` };
  } catch (err) {
    cloudLastError = String((err as Error)?.message || err);
    return { mode: 'error', detail: cloudLastError };
  }
}

/** Gom nhiều lần sửa liên tiếp thành một lượt ghi lên cloud. */
export function queueCloudPush(delayMs = 1200): void {
  if (!cloudEnabled() || applyingCloud) return;
  if (cloudPushTimer) clearTimeout(cloudPushTimer);
  cloudPushTimer = setTimeout(() => {
    cloudPushTimer = null;
    void flushCloudPush();
  }, delayMs);
}

/**
 * Ghi lên cloud theo revision đã đọc. Xung đột nghĩa là máy khác vừa sửa:
 * nạp bản của họ, gộp theo id rồi thử lại MỘT lần. Không bao giờ ghi đè im lặng.
 */
export async function flushCloudPush(): Promise<void> {
  if (!cloudEnabled() || applyingCloud) return;
  if (cloudPushing) return cloudPushing;
  cloudPushing = (async () => {
    try {
      let res = await commitRemote(buildCloudPayload(getState() as Record<string, any>), cloudBaseRevision);
      if ('remote' in res) {
        const remote = res.remote;
        applyCloudSnapshot(remote);
        res = await commitRemote(buildCloudPayload(getState() as Record<string, any>), remote.revision);
      }
      if ('remote' in res) {
        cloudLastError = 'Vẫn xung đột sau một lần gộp — nội dung máy này chưa lên cloud.';
      } else {
        cloudBaseRevision = res.revision;
        cloudLastPushAt = new Date().toISOString();
        cloudLastError = '';
      }
    } catch (err) {
      cloudLastError = String((err as Error)?.message || err);
    } finally {
      cloudPushing = null;
    }
  })();
  return cloudPushing;
}

/** Dừng theo dõi (test hoặc tắt đồng bộ). */
export function stopCloudWatch(): void {
  if (cloudUnwatch) {
    try { cloudUnwatch(); } catch { /* bỏ qua */ }
    cloudUnwatch = null;
  }
}

// ---------------- Kho chung Google Sheet (hai chiều) ----------------

let sheetPushTimer: ReturnType<typeof setTimeout> | null = null;
let sheetPullTimer: ReturnType<typeof setInterval> | null = null;
/** Một lượt đọc/ghi sheet chạy tuần tự: kéo không được xen vào giữa lúc đang đẩy. */
let sheetLock: Promise<any> = Promise.resolve();
let applyingSheet = false;
let sheetLastError = '';
let sheetLastPushAt = '';
let sheetLastPullAt = '';
let sheetLastConflicts = 0;

function withSheetLock<T>(job: () => Promise<T>): Promise<T> {
  const run = sheetLock.then(job, job);
  sheetLock = run.then(() => undefined, () => undefined);
  return run;
}

export type SheetSyncStatus = {
  enabled: boolean;
  spreadsheet_id: string;
  sheet_gid: number;
  write_policy: string;
  hint: string;
  credential_available: boolean;
  service_account_email: string;
  syncable_events: number;
  queued: boolean;
  last_push_at: string;
  last_pull_at: string;
  /** Số dòng mà lần đẩy trước phát hiện hai bên cùng sửa — còn nguyên cho tới khi cán bộ quyết. */
  last_conflicts: number;
  last_error: string;
};

function sheetConfig(): SheetSyncSettings {
  return normalizeSheetSync(getState().settings.sheet_sync);
}

/** Sheet chỉ được đụng tới khi cán bộ đã dán đường dẫn VÀ bật đồng bộ — mặc định là tắt. */
export function sheetSyncEnabled(): boolean {
  const cfg = sheetConfig();
  return cfg.enabled && Boolean(cfg.spreadsheet_id);
}

export function sheetStatus(): SheetSyncStatus {
  const cfg = sheetConfig();
  const cred = sheetCredentialStatus();
  return {
    enabled: cfg.enabled && Boolean(cfg.spreadsheet_id),
    spreadsheet_id: cfg.spreadsheet_id,
    sheet_gid: cfg.gid,
    write_policy: cfg.write_policy,
    hint: sheetSyncHint(cfg),
    credential_available: cred.available,
    service_account_email: cred.client_email,
    syncable_events: selectSyncEvents(getState().events, cfg.write_policy).length,
    queued: Boolean(sheetPushTimer),
    last_push_at: sheetLastPushAt || cfg.last_pushed_at,
    last_pull_at: sheetLastPullAt || cfg.last_pulled_at,
    last_conflicts: sheetLastConflicts,
    last_error: sheetLastError,
  };
}

/** Ghi mốc thời gian mà không tự kéo theo một lượt đẩy mới (nếu không sẽ looping persist → push). */
function rememberSheetStamp(field: 'last_pushed_at' | 'last_pulled_at'): void {
  const iso = new Date().toISOString();
  if (field === 'last_pushed_at') sheetLastPushAt = iso;
  else sheetLastPullAt = iso;
  applyingSheet = true;
  try {
    const s = getState();
    s.settings.sheet_sync = { ...s.settings.sheet_sync, [field]: iso };
    persist();
  } finally {
    applyingSheet = false;
  }
}

/** Gom nhiều lần sửa lịch liên tiếp thành một lần ghi sheet. */
export function queueSheetPush(delayMs = 4000): void {
  if (!sheetSyncEnabled() || applyingSheet) return;
  if (sheetPushTimer) clearTimeout(sheetPushTimer);
  sheetPushTimer = setTimeout(() => {
    sheetPushTimer = null;
    void flushSheetPush();
  }, delayMs);
  sheetPushTimer.unref?.();
}

/**
 * Đẩy lịch lên sheet. Trả null khi đồng bộ đang tắt để màn Cài đặt báo đúng "chưa bật",
 * không phải một báo cáo thành công rỗng.
 */
export async function flushSheetPush(options: { force?: boolean } = {}): Promise<PushReport | null> {
  const cfg = sheetConfig();
  if (!cfg.enabled || !cfg.spreadsheet_id) return null;
  return withSheetLock(async () => {
    const report = await pushEventsToSheet(cfg, getState().events, options);
    sheetLastConflicts = report.conflicts.length;
    if (report.ok) {
      sheetLastError = '';
      rememberSheetStamp('last_pushed_at');
    } else {
      sheetLastError = report.error;
    }
    return report;
  });
}

/**
 * Kéo dòng từ sheet vào lịch. Dòng xoá trên sheet KHÔNG xoá sự kiện; dòng lạ chỉ được đếm để báo.
 * `force` của push về sau do cán bộ quyết qua nút "Đẩy ghi đè" ở màn Cài đặt.
 */
export async function pullSheetNow(): Promise<PullReport | null> {
  const cfg = sheetConfig();
  if (!cfg.enabled || !cfg.spreadsheet_id) return null;
  return withSheetLock(async () => {
    const report = await pullEventsFromSheet(cfg, getState().events);
    if (!report.ok) {
      sheetLastError = report.error;
      return report;
    }
    if (report.updates.length) {
      applyingSheet = true;
      try {
        const s = getState();
        s.events = applyPullUpdates(s.events, report.updates).events;
      } finally {
        applyingSheet = false;
      }
    }
    rememberSheetStamp('last_pulled_at');
    return report;
  });
}

/**
 * Máy khác sửa sheet thì máy này chỉ thấy khi tự đi hỏi lại (Sheets không có đườngPush như Firestore).
 * Mặc định 60 giây một lần, timer not keep the process alive.
 */
export function startSheetPullPolling(intervalMs = 60_000): void {
  if (sheetPullTimer) return;
  sheetPullTimer = setInterval(() => {
    if (!sheetSyncEnabled()) return;
    void pullSheetNow().catch(() => undefined);
  }, Math.max(15_000, intervalMs));
  sheetPullTimer.unref?.();
}

export function stopSheetPullPolling(): void {
  if (sheetPullTimer) {
    clearInterval(sheetPullTimer);
    sheetPullTimer = null;
  }
}


/**
 * Lần chạy đầu khi chưa có tài khoản nào: sinh mã khởi tạo 8 ký tự hex và trả về để in ra console.
 * Ai muốn tạo tài khoản quản trị đầu tiên phải đọc được mã này từ máy chủ — chặn người lạ
 * chiếm quyền khi ứng dụng ra ngoài mạng.
 */
export function bootstrapAuth(): string | null {
  const s = getState();
  if (s.users.length || process.env.GOOGLE_CLIENT_ID?.trim()) return null;
  if (!s.auth.setup_code) {
    s.auth = { setup_code: newSetupCode(), setup_code_created_at: new Date().toISOString() };
    persist();
  }
  return s.auth.setup_code;
}

export function findUserByName(username: string): UserRecord | undefined {
  return getState().users.find((u) => u.username === normalizeUsername(username));
}
