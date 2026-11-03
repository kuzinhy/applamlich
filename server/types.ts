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
  /** Thứ tự sắp xếp thủ công khi kéo-thả trong cùng một ngày/buổi. */
  sort_order?: number;
  /** Đánh dấu lịch bổ sung (hiển thị màu chữ phân biệt với lịch ban đầu). */
  is_supplemental?: boolean;
  /** Ghi chú nguồn/lý do bổ sung lịch. */
  supplemental_note?: string;
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
  /** Người dự thay suy từ quy chế phân công; null khi hồ sơ cơ quan chưa đủ để suy ra. */
  suggested_substitute?: SubstituteSuggestion | null;
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
  /** Đánh dấu lịch bổ sung (hiển thị màu chữ phân biệt với lịch gốc). */
  is_supplemental?: boolean;
  /** Ghi chú nguồn/lý do bổ sung lịch. */
  supplemental_note?: string;
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

/** Một chức danh của cơ quan — nền tảng để suy ai phải dự, ai dự thay khi vắng. */
export interface OrgPost {
  id: string;
  /** Tên chức danh đúng như văn bản ghi, ví dụ "Bí thư Đảng ủy". */
  title: string;
  /** Người đang giữ chức danh; để trống nghĩa là chưa có người — engine không được tự bịa tên. */
  holder: string;
  /** 1 = cao nhất. Dùng để quyết định việc nào được giữ khi hai lịch trùng nhau. */
  seniority: number;
  /** Cách gọi tắt trong văn bản: "Bí thư", "Thường trực Đảng ủy", "Đ/c Bí thư". */
  aliases: string[];
  /** Chức danh được ủy quyền dự thay khi người giữ vắng; tham chiếu theo title. */
  deputy_title: string;
}

/** Cấp triệu tập → thành phần bắt buộc của cơ quan mình phải đi dự. */
export interface OrgConveningRule {
  id: string;
  /** Tên cấp triệu tập, ví dụ "Thành ủy", "UBND Quận". */
  convener: string;
  /** Từ khoá nhận dạng trong nơi triệu tập / tiêu đề văn bản. */
  keywords: string[];
  /** Chức danh bắt buộc dự, theo thứ tự ưu tiên giảm dần. */
  required_titles: string[];
}

/** Hồ sơ cơ quan: vừa để in header, vừa là căn cứ xếp lịch tham dự. */
export interface OrgProfile {
  /** Cấp hành chính của cơ quan: phuong / xa / thi_tran / quan / thanh_pho truc_thuoc / khac. */
  admin_level: string;
  /** Tên tiếng Việt đầy đủ của cấp hành chính để đưa vào prompt AI. */
  admin_level_label: string;
  /** Cách gọi tắt của chính cơ quan/đơn vị, dùng nhận diện phạm vi triệu tập. */
  aliases: string[];
  address: string;
  phone: string;
  email: string;
  /** Đầu mối liên hệ lịch công tác (Văn phòng, người phát ngôn). */
  liaison: string;
  posts: OrgPost[];
  convening_rules: OrgConveningRule[];
}

/** Người dự thay mà quy chế suy ra được cho một xung đột; chỉ đề xuất, không tự ghi. */
export interface SubstituteSuggestion {
  /** Sự kiện nên đổi người (thường là mục điểm ưu tiên thấp hơn). */
  event_id: string;
  event_title: string;
  /** Chức danh bận trùng và không thể có mặt. */
  absent_title: string;
  absent_holder: string;
  /** Chức danh + người được ủy quyền dự thay. */
  substitute_title: string;
  substitute_holder: string;
  /** Lý do nghiệp vụ, hiển thị nguyên văn cho cán bộ. */
  reason: string;
  /** Chuỗi ủy quyền đã lần theo, để người duyệt biết dựa vào đâu. */
  chain: string[];
  /** true nếu người dự thay cũng được cấp trên triệu tập bắt buộc trong cùng giờ. */
  substitute_also_busy: boolean;
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
  /** Hồ sơ cơ quan + quy chế phân công dự họp — căn cứ để xếp người tham dự. */
  org_profile: OrgProfile;
  /** Nhóm dấu hiệu nhận diện thành phần Ban mà quản trị viên tắt. */
  signal_disabled_groups: string[];
  /** Từ khóa quản trị tự thêm, gán theo mã nhóm dấu hiệu. */
  signal_extra_keywords: Record<string, string[]>;
  /** Quy tắc học từ lịch đã duyệt: mã nhóm dấu hiệu → mã cán bộ thường được phân công. */
  signal_learned_assignments: Record<string, string[]>;
  /**
   * Kho chung Google Sheet (hai chiều). Khai báo kiểu cấu trúc ở đây để types.ts không import
   * services/sheet_store.ts — hai bên khớp nhau theo hình dáng, tránh vòng phụ thuộc.
   */
  sheet_sync: {
    enabled: boolean;
    spreadsheet_id: string;
    gid: number;
    write_policy: 'APPROVED_PUBLISHED' | 'ALL';
    last_pushed_at: string;
    last_pulled_at: string;
  };
}

/** Một bình luận/ý kiến trong quy trình duyệt lịch. */
export interface EventComment {
  id: string;
  event_id: string;
  author: string;
  text: string;
  created_at: string;
}

/** Ảnh chụp nhanh trước khi sửa, để đối soát ai đổi gì. */
export interface EventVersion {
  id: string;
  event_id: string;
  at: string;
  actor: string;
  action: string;
  changed: string[];
  snapshot: Partial<EventRecord>;
}

/** Thiết bị đã đồng ý nhận thông báo đẩy (Web Push, miễn phí, không cần dịch vụ ngoài). */
export interface PushSubscriptionRecord {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
}

/** Tùy chọn nhận tin riêng của từng tài khoản. */
export interface UserNotifyPrefs {
  enabled: boolean;
  digest: boolean;
  reminders: boolean;
  tasks: boolean;
  push: boolean;
}

export const DEFAULT_USER_NOTIFY_PREFS: UserNotifyPrefs = {
  enabled: true,
  digest: true,
  reminders: true,
  tasks: true,
  push: false,
};

export interface NotificationConfig {
  enabled: boolean;
  telegram: { enabled: boolean; bot_token: string; chat_id: string };
  /** Zalo OA: gửi tin qua API chính thức, dùng access token của OA. */
  zalo: { enabled: boolean; access_token: string; recipient_id: string };
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
  /** Tùy chọn nhận thông báo riêng của tài khoản này. */
  notify_prefs: UserNotifyPrefs;
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
  /** ISO hết hạn của link công khai; null = không đặt hạn. */
  share_expires_at: string | null;
  /** Mã PIN 4–6 số để mở link công khai; trống = ai có link cũng xem được. */
  share_pin: string;
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
  /** Ý kiến/ghi chú trong quy trình duyệt lịch. */
  event_comments: EventComment[];
  /** Lịch sử thay đổi của từng mục lịch (ảnh chụp trước khi sửa). */
  event_versions: EventVersion[];
  /** Thiết bị đã đăng ký nhận Web Push. */
  push_subscriptions: PushSubscriptionRecord[];
  /** Khoá bí mật của feed .ics dùng chung; đổi khoá = huỷ mọi đăng ký cũ. */
  ics_token: string;
}

export const DEFAULT_ADVISOR_UNIT = 'Ban Xây dựng Đảng';

/**
 * Bộ khung chức danh cấp phường theo thông lệ, để quản trị viên chỉ điền tên người giữ.
 * `holder` cố tình để trống: chưa có tên thì engine không được gợi ý ai đi dự thay.
 */
export const DEFAULT_ORG_POSTS: OrgPost[] = [
  { id: 'post_bt', title: 'Bí thư Đảng ủy', holder: '', seniority: 1, aliases: ['Bí thư Đảng ủy', 'Đ/c Bí thư', 'Bí thư'], deputy_title: 'Phó Bí thư Thường trực' },
  { id: 'post_pbttt', title: 'Phó Bí thư Thường trực', holder: '', seniority: 2, aliases: ['Phó Bí thư Thường trực', 'P.Bí thư TT', 'Phó Bí thư'], deputy_title: 'Chủ tịch UBND' },
  { id: 'post_ct', title: 'Chủ tịch UBND', holder: '', seniority: 3, aliases: ['Chủ tịch UBND', 'Đ/c Chủ tịch', 'Chủ tịch'], deputy_title: 'Phó Chủ tịch UBND' },
  { id: 'post_pct', title: 'Phó Chủ tịch UBND', holder: '', seniority: 4, aliases: ['Phó Chủ tịch UBND'], deputy_title: '' },
  { id: 'post_tbxd', title: 'Trưởng Ban Xây dựng Đảng', holder: '', seniority: 5, aliases: ['Trưởng Ban Xây dựng Đảng', 'Trưởng ban XDĐ', 'Trưởng Ban'], deputy_title: 'Phó Trưởng Ban Thường trực' },
  { id: 'post_cvp', title: 'Chánh Văn phòng Đảng ủy', holder: '', seniority: 6, aliases: ['Chánh Văn phòng', 'Chánh VP'], deputy_title: '' },
];

/** Hai quy chế triệu tập phổ biến nhất; khai báo thêm/xoá ở màn Cài đặt. */
export const DEFAULT_ORG_CONVENING_RULES: OrgConveningRule[] = [
  { id: 'cv_cap_tren_dang', convener: 'Thành ủy / Quận ủy', keywords: ['thành ủy', 'quận ủy', 'tỉnh ủy'], required_titles: ['Bí thư Đảng ủy', 'Phó Bí thư Thường trực'] },
  { id: 'cv_cap_tren_chinhquyen', convener: 'UBND cấp trên', keywords: ['ubnd quận', 'ubnd thành phố', 'ubnd tỉnh'], required_titles: ['Chủ tịch UBND', 'Phó Chủ tịch UBND'] },
];

/** Cấp hành chính chọn ở màn Cài đặt; quyết cách xưng hô và cấp trên thường gặp. */
export const ORG_ADMIN_LEVELS: Array<{ id: string; label: string }> = [
  { id: 'xa', label: 'Xã' },
  { id: 'phuong', label: 'Phường' },
  { id: 'thi_tran', label: 'Thị trấn' },
  { id: 'quan', label: 'Quận / Thành phố trực thuộc tỉnh' },
  { id: 'tinh', label: 'Tỉnh / Thành phố trực thuộc Trung ương' },
  { id: 'khac', label: 'Khác' },
];

export const DEFAULT_ORG_PROFILE: OrgProfile = {
  admin_level: 'phuong',
  admin_level_label: 'Phường',
  aliases: [],
  address: '',
  phone: '',
  email: '',
  liaison: '',
  posts: DEFAULT_ORG_POSTS,
  convening_rules: DEFAULT_ORG_CONVENING_RULES,
};

/** Bản sao sâu để không ai vô tình sửa hằng số chung khi mutate kho. */
export function cloneOrgProfile(profile: OrgProfile = DEFAULT_ORG_PROFILE): OrgProfile {
  return {
    ...profile,
    aliases: [...(profile.aliases || [])],
    posts: (profile.posts || []).map((p) => ({ ...p, aliases: [...(p.aliases || [])] })),
    convening_rules: (profile.convening_rules || []).map((r) => ({
      ...r,
      keywords: [...(r.keywords || [])],
      required_titles: [...(r.required_titles || [])],
    })),
  };
}

export const DEFAULT_SETTINGS: SettingsRecord = {
  unit_name: 'Đảng ủy Phường Thủ Dầu Một',
  parent_org: 'Đảng bộ Thành phố Hồ Chí Minh',
  advisor_unit: DEFAULT_ADVISOR_UNIT,
  document_number: '',
  signer: '',
  officer_name: '',
  officer_role: '',
  travel_buffers: { sameBuilding: 5, sameWard: 15, sameCity: 30, outsideArea: 60 },
  org_profile: cloneOrgProfile(),
  signal_disabled_groups: [],
  signal_extra_keywords: {},
  signal_learned_assignments: {},
  /** Mặc định TẮT: không có sheet nào của cơ quan được đụng tới trước khi cán bộ dán đường dẫn và bật đồng bộ. */
  sheet_sync: {
    enabled: false,
    spreadsheet_id: '',
    gid: 0,
    write_policy: 'APPROVED_PUBLISHED',
    last_pushed_at: '',
    last_pulled_at: '',
  },
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
  zalo: { enabled: false, access_token: '', recipient_id: '' },
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
/** Số ý kiến tối đa lưu cho mỗi mục lịch. */
export const EVENT_COMMENT_LIMIT = 100;
/** Số phiên bản tối đa lưu cho mỗi mục lịch. */
export const EVENT_VERSION_LIMIT = 30;
/** Số thiết bị nhận Web Push tối đa. */
export const PUSH_SUBSCRIPTION_LIMIT = 100;

export const DEFAULT_WEBHOOK_CONFIG: WebhookConfig = {
  enabled: false,
  url: '',
  secret: '',
  events: ['week.published', 'conflict.opened'],
  include_details: false,
};

export const DEFAULT_DRIVE_CONFIG: DriveConfig = {
  folder_id: '1C7iaZI9vATK64FwXMLN3f9S4x_NonE5v',
  folder_name: 'Bộ não tri thức Lịch công tác Phường Chánh Hiệp',
  folder_url: 'https://drive.google.com/drive/folders/1C7iaZI9vATK64FwXMLN3f9S4x_NonE5v?hl=vi',
  connected: true,
};
