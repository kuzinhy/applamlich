/**
 * Đăng nhập Google Identity Services + truy cập Google Drive bằng quyền drive.file.
 * Toàn bộ token chỉ nằm trong bộ nhớ trình duyệt và hết hạn sau ~1 giờ; server không
 * giữ refresh token, chỉ lưu mã thư mục do người dùng xác nhận.
 */

const GIS_SRC = 'https://accounts.google.com/gsi/client';
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

let gisPromise = null;

/** Nạp script GSI một lần; báo lỗi rõ khi máy chủ không ra được internet. */
export function loadGoogleIdentity() {
  if (window.google?.accounts?.gsi) return Promise.resolve(window.google);
  if (!gisPromise) {
    gisPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = GIS_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve(window.google);
      script.onerror = () => {
        gisPromise = null;
        reject(new Error('Trình duyệt không tải được Google Identity (google.com/gsi). Kiểm tra kết nối mạng.'));
      };
      document.head.appendChild(script);
    });
  }
  return gisPromise;
}

/** Bẻ nút "继续 with Google" chính chủ của Google vào khung chứa. */
export async function renderGoogleSignInButton(container, clientId, onSelect) {
  const google = await loadGoogleIdentity();
  google.accounts.id.initialize({
    client_id: clientId,
    ux_mode: 'popup',
    callback: (response) => onSelect(response?.credential || ''),
  });
  google.accounts.id.renderButton(container, {
    theme: 'outline',
    size: 'large',
    width: 300,
    text: 'signin_with',
    locale: 'vi',
  });
}

/**
 * Xin access token cho scope đã chỉ định. bắt buộc gọi từ cú click của người dùng,
 * nếu không trình duyệt chặn popup.
 */
export function requestAccessToken(clientId, scope = DRIVE_SCOPE) {
  return loadGoogleIdentity().then((google) => new Promise((resolve, reject) => {
    let settled = false;
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope,
      ux_mode: 'popup',
      callback: (response) => {
        if (settled) return;
        settled = true;
        if (response.error) {
          reject(new Error(response.error_description || response.error));
          return;
        }
        resolve({ access_token: response.access_token, expires_in: Number(response.expires_in) || 3600 });
      },
    });
    client.requestAccessToken();
    // Hộp thoại consent bị đóng hoặc chặn popup thì callback không chạy — đặt trần thời gian để báo lại.
    window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('Chưa cấp quyền Google Drive (hộp thoại bị đóng hoặc chặn popup).'));
    }, 120000);
  }));
}

async function driveFetch(path, accessToken, init = {}) {
  const res = await fetch(`https://www.googleapis.com/drive/v3${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...(init.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.error?.message || `Google Drive trả lỗi ${res.status}`;
    throw new Error(message);
  }
  return data;
}

const FOLDER_FIELDS = 'id,name,parents,webViewLink,shared,modifiedTime';

/** Tìm thư mục "Lịch công tác …" đã có trong Drive của người dùng (quyền drive.file chỉ thấy tệp do app tạo). */
export async function listWorkFolders(accessToken, keyword = 'Lịch công tác') {
  const q = `mimeType = 'application/vnd.google-apps.folder' and name contains '${keyword.replace(/'/g, "")}' and trashed = false`;
  const data = await driveFetch(
    `/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(`files(${FOLDER_FIELDS})`)}&pageSize=50&supportsAllDrives=true`,
    accessToken,
  );
  return data.files || [];
}

export async function createWorkFolder(accessToken, name, parentId = '') {
  const metadata = { name, mimeType: 'application/vnd.google-apps.folder' };
  if (parentId) metadata.parents = [parentId];
  const data = await driveFetch(
    `/files?fields=${encodeURIComponent(FOLDER_FIELDS)}&supportsAllDrives=true`,
    accessToken,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(metadata) },
  );
  return data;
}

/** Chia sẻ thư mục cho một email; mặc định Editor để đồng nghiệp nạp văn bản về máy chủ. */
export async function shareWorkFolder(accessToken, folderId, email, role = 'writer') {
  const body = { type: 'user', role, emailAddress: String(email).trim().toLowerCase() };
  return driveFetch(
    `/files/${encodeURIComponent(folderId)}/permissions?supportsAllDrives=true&sendNotificationEmail=true`,
    accessToken,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  );
}

/** Suy ra mã thư mục từ đường dẫn Drive người dùng dán vào. */
export function extractFolderId(input = '') {
  const text = String(input).trim();
  const byPath = text.match(/folders\/([a-zA-Z0-9_-]{6,})/);
  if (byPath) return byPath[1];
  const byQuery = text.match(/[?&]id=([a-zA-Z0-9_-]{6,})/);
  if (byQuery) return byQuery[1];
  return /^[a-zA-Z0-9_-]{6,}$/.test(text) ? text : '';
}
