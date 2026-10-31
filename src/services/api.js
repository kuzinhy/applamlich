// Lớp dữ liệu frontend: mọi thứ đi qua API của server Node (server/routes.ts).
// Không còn dữ liệu mẫu hardcode — server báo lỗi thật thì UI hiển thị lỗi thật.

const BASE = '/api';

class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.status = status;
    this.payload = payload || {};
  }
}

async function request(path, { method = 'GET', body, query } = {}) {
  const url = new URL(BASE + path, window.location.origin);
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  const res = await fetch(url.pathname + url.search, {
    method,
    // Gửi cookie phiên tg_session. Server đặt SameSite nên trang web khác không gửi được.
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }
  if (!res.ok) {
    // Hết phiên khi đang làm việc: báo để App quay về màn hình đăng nhập, không mất dữ liệu đang gõ.
    if (res.status === 401 && path !== '/auth/status' && path !== '/auth/login') {
      window.dispatchEvent(new CustomEvent('tg:unauthorized'));
    }
    throw new ApiError(data.error || data.message || `HTTP ${res.status}`, res.status, data);
  }
  return data;
}

const pad = (n) => String(n).padStart(2, '0');

/** Thứ Hai của tuần chứa ngày cho trước (mặc định: hôm nay). */
export function mondayOf(dateOrIso) {
  const d = typeof dateOrIso === 'string' ? new Date(`${dateOrIso}T00:00:00`) : new Date(dateOrIso || Date.now());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function currentWeekStart() {
  return mondayOf(new Date());
}

/** Số tuần ISO 8601 của một ngày ISO (YYYY-MM-DD). */
export function isoWeekNumber(iso) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const yearStart = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - yearStart) / 86400000 - 3 + ((yearStart.getDay() + 6) % 7)) / 7);
}

/** Thứ Hai của tuần ISO cho trước. */
export function mondayOfIsoWeek(weekNumber, year) {
  const jan4 = new Date(year, 0, 4);
  const week1Monday = new Date(jan4);
  week1Monday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  week1Monday.setDate(week1Monday.getDate() + (weekNumber - 1) * 7);
  return `${week1Monday.getFullYear()}-${pad(week1Monday.getMonth() + 1)}-${pad(week1Monday.getDate())}`;
}

/** "2026-10-27" -> "27/10 – 02/11/2026". */
export function weekRangeLabel(mondayIso) {
  const end = new Date(`${mondayIso}T00:00:00`);
  end.setDate(end.getDate() + 6);
  const f = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  return `${f(new Date(`${mondayIso}T00:00:00`))} – ${f(end)}/${end.getFullYear()}`;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('Không đọc được tệp.'));
    reader.readAsDataURL(file);
  });
}

export const api = {
  // ---------------- Nền tảng ----------------
  getHealth: () => request('/health'),

  // ---------------- Đăng nhập & tài khoản ----------------
  getAuthStatus: () => request('/auth/status'),

  login: (username, password) => request('/auth/login', { method: 'POST', body: { username, password } }),

  /** Nộp ID token do Google Identity Services cấp; server tự kiểm tra chữ ký. */
  loginWithGoogle: (credential) => request('/auth/google', { method: 'POST', body: { credential } }),

  /** Lưu thư mục Google Drive dùng chung của chính tài khoản này. */
  saveMyDriveFolder: (payload) => request('/auth/me/drive', { method: 'PUT', body: payload }),

  /** Tạo tài khoản quản trị đầu tiên; code là mã 8 ký tự in ra console của máy chủ. */
  setupAccount: (payload) => request('/auth/setup', { method: 'POST', body: payload }),

  logout: () => request('/auth/logout', { method: 'POST' }),

  getMe: () => request('/auth/me'),

  changeOwnPassword: (currentPassword, newPassword) =>
    request('/auth/password', { method: 'POST', body: { current_password: currentPassword, new_password: newPassword } }),

  getMySessions: () => request('/auth/sessions'),

  revokeMySession: (id) => request(`/auth/sessions/${id}/revoke`, { method: 'POST' }),

  /** Chỉ quản trị viên. */
  getUsers: () => request('/users'),

  createUser: (payload) => request('/users', { method: 'POST', body: payload }),

  updateUser: (id, patch) => request(`/users/${id}`, { method: 'PATCH', body: patch }),

  deleteUser: (id) => request(`/users/${id}`, { method: 'DELETE' }),

  getAuditLog: (limit = 120) => request('/audit', { query: { limit } }),

  // ---------------- Webhook xuất (Apps Script / n8n) ----------------
  getWebhookConfig: () => request('/webhook/config'),

  saveWebhookConfig: (payload) => request('/webhook/config', { method: 'PUT', body: payload }),

  createWebhookSecret: (rotate = false) => request('/webhook/secret', { method: 'POST', body: { rotate } }),

  testWebhook: () => request('/webhook/test', { method: 'POST' }),

  getWebhookLog: () => request('/webhook/log'),

  getState: (week) => request('/state', { query: { week } }),

  getDashboard: async (week) => {
    const s = await request('/state', { query: { week } });
    return {
      total_sources: s.sources.length,
      approved_events: s.stats.total - s.stats.proposed,
      proposed_events: s.stats.proposed,
      open_conflicts: s.conflicts.filter((c) => c.status === 'OPEN').length,
    };
  },

  // ---------------- Văn bản nguồn ----------------
  getSources: async () => (await request('/sources')).sources,

  uploadSource: async (formData) => {
    const file = formData.get('file');
    if (!file) throw new ApiError('Chưa chọn tệp nào', 422);
    return request('/sources/upload', {
      method: 'POST',
      body: {
        file_name: file.name,
        content_base64: await fileToBase64(file),
        source_type: formData.get('source_type') || 'cap_tren',
        priority_level: Number(formData.get('priority_level') || 80),
        notes: formData.get('notes') || 'Tải lên từ giao diện',
        auto_extract: formData.get('auto_extract') === '1',
      },
    });
  },

  pasteSource: (data) => request('/sources/paste', { method: 'POST', body: data }),

  deleteSource: (id) => request(`/sources/${id}`, { method: 'DELETE' }),

  /** Bóc tách một văn bản thành sự kiện PROPOSED (cần GEMINI_API_KEY). */
  extractSource: (id, week) => request(`/sources/${id}/extract`, { method: 'POST', body: { week } }),

  // ---------------- Sự kiện ----------------
  getEvents: async (week) => (await request('/state', { query: { week } })).events,

  /** Toàn bộ đề xuất (mọi tuần) — màn duyệt không phụ thuộc tuần đang xem. */
  getProposedEvents: async (params = {}) => (await request('/proposals', { query: params })).proposals,

  getProposals: (params = {}) => request('/proposals', { query: params }),

  createEvent: (data) => request('/events', { method: 'POST', body: data }),

  updateEvent: (id, patch) => request(`/events/${id}`, { method: 'PATCH', body: patch }),

  deleteEvent: (id) => request(`/events/${id}`, { method: 'DELETE' }),

  approveEvent: (id) => request(`/events/${id}/status`, { method: 'POST', body: { status: 'APPROVED' } }),

  rejectEvent: (id) => request(`/events/${id}/status`, { method: 'POST', body: { status: 'REJECTED' } }),

  updateEventStatus: (id, status) => request(`/events/${id}/status`, { method: 'POST', body: { status } }),

  publishEvent: (id) => request(`/events/${id}/status`, { method: 'POST', body: { status: 'PUBLISHED' } }),

  /** Kéo-thả thẻ lịch: giữ nguyên thời lượng, server phân tích lại xung đột. */
  moveEvent: (id, targetDate, targetTime) =>
    request(`/events/${id}/move`, { method: 'POST', body: { event_date: targetDate, start_time: targetTime } }),

  rescheduleEvent: (id, targetDate, targetTime) =>
    request(`/events/${id}/move`, { method: 'POST', body: { event_date: targetDate, start_time: targetTime } }),

  aiFillEvent: (id) => request(`/events/${id}/ai-fill`, { method: 'POST', body: {} }),

  // ---------------- Việc chuẩn bị của một mục lịch ----------------
  addEventTask: (id, task) => request(`/events/${id}/tasks`, { method: 'POST', body: task }),

  updateEventTask: (id, taskId, patch) => request(`/events/${id}/tasks/${taskId}`, { method: 'PATCH', body: patch }),

  deleteEventTask: (id, taskId) => request(`/events/${id}/tasks/${taskId}`, { method: 'DELETE' }),

  /** Nhân bản mục lịch sang N tuần kế tiếp (sinh hoạt định kỳ). */
  repeatEvent: (id, weeks) => request(`/events/${id}/repeat`, { method: 'POST', body: { weeks } }),

  // ---------------- Thùng rác ----------------
  getTrash: async () => (await request('/trash')).trash,

  restoreFromTrash: (id) => request(`/trash/${id}/restore`, { method: 'POST', body: {} }),

  purgeTrashItem: (id) => request(`/trash/${id}`, { method: 'DELETE' }),

  emptyTrash: () => request('/trash', { method: 'DELETE' }),

  // ---------------- Nhập lịch .ics ----------------
  /** Đọc lịch Google Calendar/Outlook xuất ra; server chỉ lấy thông tin có trong tệp. */
  importIcs: async (file, range = {}) =>
    request('/import/ics', {
      method: 'POST',
      body: { file_name: file.name, content_base64: await fileToBase64(file), ...range },
    }),

  // ---------------- Lịch tuần / tháng ----------------
  /** Dựng lịch tuần từ payload /state đã tải — tránh gọi lại /state lần hai. */
  weekCalendarFromState: (s) => ({
    start_date: s.week.start,
    end_date: s.week.end,
    week_number: s.week.week_number,
    days: s.week.days.map((d) => ({
      ...d,
      isToday: d.is_today,
      events: s.events
        .filter((e) => e.event_date === d.date)
        .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || '')),
    })),
    stats: s.stats,
    conflicts: s.conflicts,
    settings: s.settings,
  }),

  getWeekCalendar: async (startDate = '') => {
    const s = await request('/state', { query: { week: startDate || currentWeekStart() } });
    return api.weekCalendarFromState(s);
  },

  getMonthCalendar: (month) => request('/calendar/month', { query: { month } }),

  // ---------------- Xung đột ----------------
  getConflicts: async () => (await request('/conflicts')).conflicts,

  reanalyzeConflicts: (week) => request('/conflicts/reanalyze', { method: 'POST', body: { week } }),

  resolveConflict: (id, resolution) => request(`/conflicts/${id}/resolve`, { method: 'POST', body: { resolution } }),

  aiSuggestConflictFix: (id) => request(`/conflicts/${id}/ai-suggest`, { method: 'POST', body: {} }),

  // ---------------- AI ----------------
  aiChat: (prompt, week) => request('/ai/chat', { method: 'POST', body: { prompt, week } }),

  /** Trạng thái Gemini / Ollama / OpenAI-compatible đang dùng được. */
  getAIStatus: () => request('/ai/status'),

  /** Lưu cấu hình API Key và nhà cung cấp AI. */
  saveAiConfig: (payload) => request('/ai/config', { method: 'POST', body: payload }),

  /**
   * Trợ lý có công cụ: tự tra lịch, tìm khung trống, kiểm tra xung đột rồi trả lời.
   * allow_write = true cho phép tạo đề xuất (vẫn ở trạng thái chờ duyệt, không tự ban hành).
   */
  runAgent: (message, week, allowWrite = false) =>
    request('/ai/agent', { method: 'POST', body: { message, week, allow_write: allowWrite } }),

  /** Bóc tách nhanh đoạn văn bản dán tay; không lưu vào cơ sở dữ liệu. */
  aiParseText: (text, week) => request('/ai/parse-text', { method: 'POST', body: { text, week } }),

  aiWeekDraft: (week, save = true) => request('/ai/week-draft', { method: 'POST', body: { week_start: week, save } }),

  // ---------------- Khung giờ trống & xếp lại lịch ----------------
  getFreeSlots: ({ date, duration = 90, people = [], location = '', preferStart = '', limit = 5 }) =>
    request('/calendar/free-slots', {
      query: { date, duration, people: people.join(','), location, prefer_start: preferStart, limit },
    }),

  /** Gợi ý giữ việc ưu tiên cao, dời việc thấp sang khung trống (không tự ghi). */
  autoPlanConflicts: (week, daysAhead = 3) =>
    request('/conflicts/auto-plan', { method: 'POST', body: { week, days_ahead: daysAhead } }),

  // ---------------- Nhắc việc ----------------
  getNotifyConfig: () => request('/notify/config'),

  saveNotifyConfig: (payload) => request('/notify/config', { method: 'PUT', body: payload }),

  testNotify: () => request('/notify/test', { method: 'POST' }),

  getNotifyLog: () => request('/notify/log'),

  sendDigestNow: (date) => request('/notify/digest', { method: 'POST', body: { date } }),

  // ---------------- Ban Xây dựng Đảng ----------------
  /** Một tuần lịch nội bộ Ban, kèm danh sách cán bộ và trí nhớ phân công. */
  getAgencyWeek: (weekNumber, year) => request('/agency', { query: { week_number: weekNumber, year } }),

  addAgencyInternalTask: (data) => request('/agency', { method: 'POST', body: data }),

  updateAgencyItem: (id, patch) => request(`/agency/${id}`, { method: 'PATCH', body: patch }),

  deleteAgencyItem: (id) => request(`/agency/${id}`, { method: 'DELETE' }),

  updateAgencyApprovalStep: (id, status) => request(`/agency/${id}`, { method: 'PATCH', body: { approval_status: status } }),

  /** AI lập dự thảo lịch Ban từ các văn bản nguồn đã nạp trong hệ thống. */
  agencyAiDraft: (weekNumber, year) => request('/agency/ai-draft', { method: 'POST', body: { week_number: weekNumber, year } }),

  /** Đối soát từng công việc nội bộ với văn bản nguồn (không cần AI). */
  agencyTraceCheck: (weekNumber, year) => request('/agency/trace-check', { method: 'POST', body: { week_number: weekNumber, year } }),

  runAgencyQCReview: async (weekNumber, year) => {
    const res = await request('/agency/qc-review', { method: 'POST', body: { week_number: weekNumber, year } });
    return { ...res, total_warnings: res.findings.length };
  },

  /** Nạp tệp văn bản Đảng rồi bóc tách thành công việc nội bộ Ban. */
  analyzePartyFile: async (formData) => {
    const file = formData.get('file');
    if (!file) throw new ApiError('Chưa chọn tệp nào', 422);
    return request('/agency/analyze-file', {
      method: 'POST',
      body: {
        file_name: file.name,
        content_base64: await fileToBase64(file),
        week_number: Number(formData.get('week_number') || 0) || undefined,
        year: Number(formData.get('year') || new Date().getFullYear()),
      },
    });
  },

  // ---------------- Nhận diện thành phần Ban Xây dựng Đảng ----------------
  /** Cấu hình bộ dấu hiệu, quy tắc đã học và danh bạ cán bộ. */
  getSignalConfig: () => request('/signals/config'),

  updateSignalConfig: (patch) => request('/signals/config', { method: 'PATCH', body: patch }),

  /** Chạy nhận diện trên một tuần (hoặc một văn bản nguồn); chỉ đề xuất, không ghi lịch. */
  detectSignals: (payload) => request('/signals/detect', { method: 'POST', body: payload }),

  learnSignalRules: () => request('/signals/learn', { method: 'POST', body: {} }),

  addPersonnel: (data) => request('/personnel', { method: 'POST', body: data }),

  updatePersonnel: (id, patch) => request(`/personnel/${id}`, { method: 'PATCH', body: patch }),

  deletePersonnel: (id) => request(`/personnel/${id}`, { method: 'DELETE' }),

  // ---------------- Bộ não tri thức ----------------
  getBrainNodes: async () => (await request('/brain')).nodes,

  saveBrainNode: (node) => request('/brain', { method: 'POST', body: node }),

  deleteBrainNode: (id) => request(`/brain/${id}`, { method: 'DELETE' }),

  analyzeTextForBrain: (payload) => request('/brain/analyze', { method: 'POST', body: payload }),

  // ---------------- Google Drive (thư mục nhập offline) ----------------
  getDriveConfig: async () => (await request('/drive/config')).drive_config,

  saveDriveConfig: (config) => request('/drive/config', { method: 'PUT', body: config }),

  getDriveIncomingFiles: () => request('/drive/incoming'),

  syncDriveIncoming: () => request('/sources/ingest-dir', { method: 'POST' }),

  // ---------------- Phân tích ----------------
  getWorkloadAnalytics: (weekNumber, year) => request('/analytics/workload', { query: { week_number: weekNumber, year } }),

  getDeadlineMatrix: async (weekNumber, year) => {
    const res = await request('/analytics/deadlines', { query: { week_number: weekNumber, year } });
    return { ...res, tasks: res.deadlines };
  },

  // ---------------- Cài đặt ----------------
  getSettings: async () => (await request('/settings')).settings,

  updateSettings: (patch) => request('/settings', { method: 'PUT', body: patch }),

  triggerBackup: () => request('/backup', { method: 'POST' }),

  /** Nạp lại toàn bộ kho từ một tệp sao lưu; server ghi snapshot an toàn trước khi đè. */
  restoreBackup: async (file) =>
    request('/backup/restore', {
      method: 'POST',
      body: { confirm: 'PHUC HOI', content_base64: await fileToBase64(file) },
    }),

  // ---------------- Phát hành & xuất ----------------
  publishWeek: (week) => request('/publish', { method: 'POST', body: { week } }),

  /** Nhật ký ban hành, mới nhất trước. */
  getPublications: (week) => request('/publications', { query: week ? { week } : {} }),

  /** Thu hồi một lượt ban hành: các mục đã ban hành quay về trạng thái đã duyệt. */
  revokePublication: (id) => request(`/publications/${id}/revoke`, { method: 'POST' }),

  /** Bật link tra cứu công khai cho một tuần đã ban hành (không cần tài khoản để xem). */
  enableWeekShare: (publicationId, payload = {}) =>
    request(`/publications/${publicationId}/share`, { method: 'POST', body: payload }),

  disableWeekShare: (publicationId) => request(`/publications/${publicationId}/share`, { method: 'DELETE' }),

  /** Mã QR + liên kết in của một lượt ban hành đã bật chia sẻ. */
  getPublicationQr: (publicationId) => request(`/publications/${publicationId}/qr`),

  // ---------------- Đăng ký lịch .ics tự cập nhật ----------------
  getIcsSubscription: () => request('/ics/subscription'),

  rotateIcsSubscription: () => request('/ics/subscription/rotate', { method: 'POST', body: {} }),

  // ---------------- Ý kiến duyệt & lịch sử phiên bản ----------------
  getEventComments: (id) => request(`/events/${id}/comments`),

  addEventComment: (id, text) => request(`/events/${id}/comments`, { method: 'POST', body: { text } }),

  getEventVersions: (id) => request(`/events/${id}/versions`),

  /** Soi thể thức văn bản theo Nghị định 30/2020 + ngày lễ trùng tuần. */
  getFormatCheck: (week) => request('/util/format-check', { query: { week } }),

  /** Số liệu báo cáo tuần/tháng dạng JSON để vẽ biểu đồ hoặc đối chiếu. */
  getWeekReport: (week) => request('/reports/week', { query: { week: mondayOf(week) } }),

  getMonthReport: (month) => request('/reports/month', { query: { month } }),

  exportUrls: {
    document: (week) => `${BASE}/export/document?week=${mondayOf(week)}`,
    ics: (week) => `${BASE}/export/ics?week=${mondayOf(week)}`,
    json: (week) => `${BASE}/export/week.json?week=${mondayOf(week)}`,
    docx: (week) => `${BASE}/export/docx?week=${mondayOf(week)}`,
    xlsx: (week) => `${BASE}/export/xlsx?week=${mondayOf(week)}`,
    pdf: (week) => `${BASE}/export/pdf?week=${mondayOf(week)}`,
    backup: () => `${BASE}/backup/download`,
    /** Trang in công khai của một tuần đã chia sẻ — mở được không cần đăng nhập. */
    weekSharePrint: (token) => `${BASE}/public/week/${token}/print`,
  },
};

export { ApiError };
