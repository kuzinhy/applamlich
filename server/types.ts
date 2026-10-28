export type EventStatus = 'DRAFT' | 'PROPOSED' | 'APPROVED' | 'PUBLISHED' | 'REJECTED';

export interface SourceRecord {
  id: string;
  file_name: string;
  source_type: string;
  priority_level: number;
  uploaded_at: string;
  file_size: number;
  parse_status: 'DONE' | 'NEEDS_REVIEW' | 'PENDING';
  notes: string;
  raw_text: string;
  /** SHA-256 của nội dung đã chuẩn hoá — chặn nạp trùng cùng văn bản dưới tên khác. */
  content_hash: string;
}

/** Một đầu việc chuẩn bị cho sự kiện: ai làm, hạn nào, đã xong chưa. */
export interface EventTask {
  id: string;
  text: string;
  owner: string;
  due_date: string;   // YYYY-MM-DD, rỗng = chưa đặt hạn
  done: boolean;
  done_at: string | null;
}

export interface EventRecord {
  id: string;
  source_id: string | null;
  source_document: string;
  source_page: number | null;
  source_paragraph: number | null;
  event_date: string;          // YYYY-MM-DD
  start_time: string;          // HH:MM
  end_time: string | null;     // HH:MM
  title: string;
  content: string;
  chair: string;
  participants: string;
  participant_group: string;
  location: string;
  organizer: string;
  preparation: string;
  documents_required: string;
  contact_person: string;
  priority_score: number;
  confidence: number;
  status: EventStatus;
  missing_data_fields: string[];
  leaders: string[];
  /** Tên các văn bản nguồn khác cũng nêu cùng việc này (chống trùng đa nguồn). */
  also_from: string[];
  /** Đầu việc chuẩn bị có người phụ trách và hạn chót. */
  tasks: EventTask[];
  /** Nhóm các mục sinh ra từ một lệnh lặp lịch; null = mục đơn lẻ. */
  series_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConflictRecord {
  id: string;
  event_id_1: string;
  event_id_2: string;
  conflict_type: string;
  severity: string;
  description: string;
  resolution_suggestion: string;
  status: 'OPEN' | 'RESOLVED';
  created_at: string;
}

export interface AgencyScheduleRecord {
  id: string;
  week_number: number;
  year: number;
  date_range: string;
  day_of_week: string;
  event_date: string;
  time_slot: string;          // "07 giờ 30" theo lối ghi lịch BXDĐ
  content: string;
  executor: string;
  attendees: string;
  location: string;
  source_id: string | null;
  source_document: string;
  source_page_para: string;
  source_original_content: string;
  relevance_category: string;  // MANDATORY | PROPOSED | INTERNAL
  relevance_reason: string;
  approval_status: string;     // DRAFT | AI_PARSED | APPROVED | REJECTED
  conflict_warnings: string[];
  diff_notes: string;
  is_internal: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface MemoryRecord {
  id: string;
  source_text: string;
  agency_content: string;
  decision_action: string;
  assigned_executor: string;
  assigned_attendees: string;
  reason: string;
  week_num: number;
  created_at: string;
}

export interface PersonnelRecord {
  id: string;
  name: string;
  title: string;
  role_description: string;
  is_active: number;
}

export interface TravelBuffers {
  sameBuilding: number;
  sameWard: number;
  sameCity: number;
  outsideArea: number;
}

export interface WorkingHours {
  morning_start: string;
  morning_end: string;
  afternoon_start: string;
  afternoon_end: string;
  /** 1 = Thứ hai … 6 = Thứ bảy, 0 = Chủ nhật. */
  workdays: number[];
}

export interface SettingsRecord {
  unit_name: string;
  /** Cấp trên trực tiếp, ghi ở dòng đầu khối tổ chức (ví dụ "Đảng bộ Thành phố Hồ Chí Minh"). */
  parent_org: string;
  /** Đơn vị lập lịch nội bộ ở màn Tham mưu lịch, mặc định là Ban Xây dựng Đảng. */
  advisor_unit: string;
  document_number: string;
  signer: string;
  officer_name: string;
  officer_role: string;
  travel_buffers: TravelBuffers;
  working_hours: WorkingHours;
  /** Nhóm dấu hiệu nhận diện thành phần Ban mà quản trị viên tắt. */
  signal_disabled_groups: string[];
  /** Từ khóa quản trị tự thêm, gán theo mã nhóm dấu hiệu. */
  signal_extra_keywords: Record<string, string[]>;
  /** Quy tắc học từ lịch đã duyệt: mã nhóm dấu hiệu → mã cán bộ thường được phân công. */
  signal_learned_assignments: Record<string, string[]>;
}

export interface NotificationConfig {
  enabled: boolean;
  telegram: { enabled: boolean; bot_token: string; chat_id: string };
  email: {
    enabled: boolean;
    smtp_host: string;
    smtp_port: number;
    secure: boolean;
    user: string;
    pass: string;
    from: string;
    to: string[];
  };
  daily_digest_enabled: boolean;
  /** Giờ gửi bản tin đầu ngày, dạng HH:MM. */
  daily_digest_time: string;
  reminder_enabled: boolean;
  /** Nhắc trước sự kiện bao nhiêu giờ, ví dụ [24, 2]. */
  reminder_before_hours: number[];
  /** false = bản tin chỉ nêu số lượng, không gửi tên người/địa điểm/nội dung. */
  include_details: boolean;
}

export interface NotificationDelivery {
  id: string;
  at: string;
  channel: 'telegram' | 'email' | 'webhook';
  kind: 'digest' | 'reminder' | 'test' | 'publish';
  target: string;
  status: 'sent' | 'failed' | 'skipped';
  error: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  action: string;
  entity: string;
  entity_id: string;
  detail: string;
  /** Tên đăng nhập của người thao tác; null với các dòng ghi trước khi có đăng nhập (schema <= 4). */
  actor: string | null;
  ip: string | null;
}

export type UserRole = 'admin' | 'editor' | 'viewer';

/** Trạng thái thư mục Google Drive mà chính tài khoản này đã kết nối. */
export interface DriveSetupRecord {
  connected: boolean;
  folder_id: string;
  folder_name: string;
  folder_url: string;
  connected_at: string | null;
}

export const DEFAULT_DRIVE_SETUP: DriveSetupRecord = {
  connected: false,
  folder_id: '',
  folder_name: '',
  folder_url: '',
  connected_at: null,
};

export interface UserRecord {
  id: string;
  /** Đã lower-case, dùng để đăng nhập. */
  username: string;
  display_name: string;
  role: UserRole;
  /** Định dạng `scrypt$N$r$p$salt$hash` — không bao giờ lưu mật khẩu gốc. */
  password_hash: string;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
  /** 'local' là tài khoản admin tạo; 'google' tự sinh khi đăng nhập bằng Gmail. */
  auth_provider: 'local' | 'google';
  email: string;
  /** `sub` trong token Google — danh tính ổn định, không đổi khi người dùng đổi email. */
  google_sub: string;
  drive_setup: DriveSetupRecord;
}

export interface SessionRecord {
  id: string;
  user_id: string;
  role: UserRole;
  created_at: string;
  expires_at: string;
  last_seen_at: string;
  user_agent: string;
  ip: string;
}

export interface AuthMeta {
  /** Mã khởi tạo in ra console lần chạy đầu; trống khi đã có tài khoản. */
  setup_code: string;
  setup_code_created_at: string | null;
}

export type WebhookEvent =
  | 'week.published'
  | 'week.revoked'
  | 'event.created'
  | 'event.updated'
  | 'event.moved'
  | 'proposal.created'
  | 'conflict.opened';

export interface WebhookConfig {
  enabled: boolean;
  url: string;
  /** Key ký HMAC cho body; server này tự sinh một lần và giữ trong file dữ liệu. */
  secret: string;
  events: WebhookEvent[];
  /** Tắt = chỉ gửi ngày/giờ/tuần, không gửi tên lãnh đạo, địa điểm, nội dung. */
  include_details: boolean;
}

export interface WebhookDelivery {
  id: string;
  at: string;
  event: WebhookEvent;
  /** Không lưu URL đầy đủ vì URL có thể chứa token. */
  target: string;
  status: 'sent' | 'failed' | 'skipped';
  http_status: number | null;
  attempts: number;
  error: string;
}

export interface BrainNodeRecord {
  id: string;
  title: string;
  summary: string;
  category: string;
  directives: string[];
  source: string;
  updated_at: string;
}

/** Nhật ký ban hành: mỗi lần bấm "Ban hành tuần" lưu lại một dòng để truy vết. */
export interface PublicationRecord {
  id: string;
  week_number: number;
  year: number;
  week_start: string;
  week_end: string;
  document_number: string;
  signer: string;
  unit_name: string;
  published_at: string;
  event_ids: string[];
  /** Chuỗi ngẫu nhiên để mở trang chia sẻ công khai; trống = chưa chia sẻ. */
  share_token: string;
}

/** Sự kiện đã xoá vẫn giữ nguyên bản ghi để khôi phục khi xoá nhầm. */
export interface TrashRecord {
  id: string;
  deleted_at: string;
  deleted_by: string | null;
  event: EventRecord;
}

/** Nhật ký truy cập trang chia sẻ: chỉ lưu lúc xem, không lưu IP hay nội dung. */
export interface ShareAccessRecord {
  token: string;
  week_start: string;
  viewed_at: string;
}

export interface DriveConfig {
  folder_id: string;
  folder_name: string;
  folder_url: string;
  connected: boolean;
}

export interface StoreState {
  schema_version: number;
  sources: SourceRecord[];
  events: EventRecord[];
  conflicts: ConflictRecord[];
  agency_schedules: AgencyScheduleRecord[];
  personnel: PersonnelRecord[];
  memory: MemoryRecord[];
  brain_nodes: BrainNodeRecord[];
  publications: PublicationRecord[];
  drive_config: DriveConfig;
  settings: SettingsRecord;
  audit_log: AuditEntry[];
  /** Bản sao sự kiện đã xoá, chờ khôi phục hoặc xoá vĩnh viễn. */
  trash: TrashRecord[];
  /** Lượt xem các trang chia sẻ công khai gần đây. */
  share_access: ShareAccessRecord[];
  users: UserRecord[];
  sessions: SessionRecord[];
  auth: AuthMeta;
  webhook_config: WebhookConfig;
  webhook_log: WebhookDelivery[];
  notifications: NotificationConfig;
  notification_log: NotificationDelivery[];
  /** Ngày (YYYY-MM-DD) đã gửi bản tin đầu ngày, chống gửi lặp. */
  last_digest_date: string;
  /** Các khóa nhắc đã gửi, dạng `eventId|mốc giờ`. */
  sent_reminders: string[];
}

export const DEFAULT_ADVISOR_UNIT = 'Ban Xây dựng Đảng';

export const DEFAULT_SETTINGS: SettingsRecord = {
  unit_name: 'Đảng ủy Phường Thủ Dầu Một',
  parent_org: 'Đảng bộ Thành phố Hồ Chí Minh',
  advisor_unit: DEFAULT_ADVISOR_UNIT,
  document_number: '',
  signer: '',
  officer_name: '',
  officer_role: '',
  travel_buffers: { sameBuilding: 5, sameWard: 15, sameCity: 30, outsideArea: 60 },
  signal_disabled_groups: [],
  signal_extra_keywords: {},
  signal_learned_assignments: {},
  working_hours: {
    morning_start: '07:30',
    morning_end: '11:30',
    afternoon_start: '13:30',
    afternoon_end: '17:00',
    workdays: [1, 2, 3, 4, 5, 6],
  },
};

export const DEFAULT_NOTIFICATION_CONFIG: NotificationConfig = {
  enabled: false,
  telegram: { enabled: false, bot_token: '', chat_id: '' },
  email: {
    enabled: false, smtp_host: '', smtp_port: 587, secure: false,
    user: '', pass: '', from: '', to: [],
  },
  daily_digest_enabled: true,
  daily_digest_time: '07:00',
  reminder_enabled: true,
  reminder_before_hours: [24, 2],
  include_details: false,
};

export const AUDIT_LIMIT = 500;
/** Số bài học tối đa giữ lại cho AI (few-shot); cái cũ nhất bị loại dần. */
export const MEMORY_LIMIT = 300;
export const PUBLICATION_LIMIT = 120;
/** Nhật ký gửi webhook: giữ 100 lần gần nhất. */
export const WEBHOOK_LOG_LIMIT = 100;
export const SESSION_LIMIT = 200;
export const USER_LIMIT = 50;
export const NOTIFICATION_LOG_LIMIT = 200;
export const SENT_REMINDER_LIMIT = 500;
/** Số đầu việc chuẩn bị tối đa ghi nhận cho một sự kiện. */
export const EVENT_TASK_LIMIT = 20;
/** Sự kiện đã xoá giữ lại để khôi phục. */
export const TRASH_LIMIT = 100;
export const SHARE_ACCESS_LIMIT = 300;

export const DEFAULT_WEBHOOK_CONFIG: WebhookConfig = {
  enabled: false,
  url: '',
  secret: '',
  events: ['week.published', 'conflict.opened'],
  include_details: false,
};

export const DEFAULT_DRIVE_CONFIG: DriveConfig = {
  folder_id: '',
  folder_name: '',
  folder_url: '',
  connected: false,
};
