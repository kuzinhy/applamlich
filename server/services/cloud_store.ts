/**
 * Kho cloud Firestore: toàn bộ nội dung nghiệp vụ của một cơ quan nằm trong
 * MỘT document, nên mọi máy chủ/trình duyệt đọc cùng một bản.
 *
 * Module này cố ý KHÔNG import store.ts (tránh phụ thuộc vòng): nó chỉ nhận và
 * trả object thuần, để store.ts quyết định lúc nào nạp/ghi.
 */
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

export const CLOUD_COLLECTION = 'app_state';

/** Trường ở lại máy: phiên đăng nhập, nhật ký chứa IP, log gửi — đưa lên cloud là lộ dữ liệu. */
export const LOCAL_ONLY_FIELDS = [
  'sessions',
  'audit_log',
  'notification_log',
  'webhook_log',
  'share_access',
  'push_subscriptions',
] as const;

/** Bản đọc được từ cloud. */
export type RemoteSnapshot = {
  revision: number;
  updated_at: string;
  payload: Record<string, any>;
};

export type CommitResult =
  | { ok: true; revision: number }
  | { ok: false; reason: 'conflict'; remote: RemoteSnapshot };

export interface CloudAdapter {
  fetch(docKey: string): Promise<RemoteSnapshot | null>;
  commit(docKey: string, payload: Record<string, any>, baseRevision: number): Promise<CommitResult>;
  /** Theo dõi document; trả hàm huỷ đăng ký. */
  watch(docKey: string, onChange: (snap: RemoteSnapshot | null) => void): () => void;
}

export function cloudConfig(): { projectId: string; docKey: string; credential: string | null } | null {
  const projectId = String(process.env.FIREBASE_PROJECT_ID || '').trim();
  if (!projectId) return null;
  const inline = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  const file = String(process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim();
  const docKey = String(process.env.SYNC_DOC_KEY || '').trim() || 'co-quan';
  return { projectId, docKey, credential: inline || file || null };
}

export function cloudEnabled(): boolean {
  return Boolean(cloudConfig()) || Boolean(activeAdapter && activeAdapter !== firestoreAdapter);
}

let activeAdapter: CloudAdapter | null = null;
let firestoreDb: Firestore | null = null;

function db(): Firestore {
  if (firestoreDb) return firestoreDb;
  const cfg = cloudConfig();
  if (!cfg) throw new Error('Chưa cấu hình FIREBASE_PROJECT_ID');
  if (!getApps().length) {
    if (!cfg.credential) throw new Error('Chưa có service account (FIREBASE_SERVICE_ACCOUNT_JSON hoặc GOOGLE_APPLICATION_CREDENTIALS)');
    initializeApp({
      credential: cert(cfg.credential.trim().startsWith('{') ? JSON.parse(cfg.credential) : cfg.credential),
      projectId: cfg.projectId,
    });
  }
  firestoreDb = getFirestore();
  return firestoreDb;
}

/** Adapter thật dùng Firestore + transaction để so khớp revision khi ghi. */
const firestoreAdapter: CloudAdapter = {
  async fetch(docKey) {
    const snap = await db().collection(CLOUD_COLLECTION).doc(docKey).get();
    if (!snap.exists) return null;
    const data = snap.data() || {};
    return {
      revision: Number(data.revision || 0),
      updated_at: String(data.updated_at || ''),
      payload: (data.payload || {}) as Record<string, any>,
    };
  },
  async commit(docKey, payload, baseRevision) {
    const ref = db().collection(CLOUD_COLLECTION).doc(docKey);
    return db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const current = snap.exists ? Number((snap.data() || {}).revision || 0) : 0;
      if (current !== baseRevision) {
        return {
          ok: false as const,
          reason: 'conflict' as const,
          remote: {
            revision: current,
            updated_at: snap.exists ? String((snap.data() || {}).updated_at || '') : '',
            payload: (snap.data() || {}).payload || {},
          },
        };
      }
      const revision = current + 1;
      tx.set(ref, { revision, updated_at: new Date().toISOString(), payload }, { merge: true });
      return { ok: true as const, revision };
    });
  },
  watch(docKey, onChange) {
    const ref = db().collection(CLOUD_COLLECTION).doc(docKey);
    return ref.onSnapshot(
      (snap) => {
        if (!snap.exists) return onChange(null);
        const data = snap.data() || {};
        onChange({
          revision: Number(data.revision || 0),
          updated_at: String(data.updated_at || ''),
          payload: (data.payload || {}) as Record<string, any>,
        });
      },
      () => onChange(null),
    );
  },
};

/** Nạp adapter khác (cho test) — truyền null để quay lại Firestore. */
export function setCloudAdapter(adapter: CloudAdapter | null): void {
  activeAdapter = adapter;
}

function adapter(): CloudAdapter {
  return activeAdapter || firestoreAdapter;
}

/**
 * Tách phần được lên cloud.
 * `users.password_hash` được giữ lại: document Firestore chỉ server (Admin SDK) đọc được,
 * và mỗi instance phải xác minh được mật khẩu dự phòng — bỏ nó là làm hỏng đăng nhập ở máy khác.
 * Thứ bị cắt là token phiên và nhật ký có IP, vì chúng vô ích với instance khác và chỉ thêm đường mạo danh.
 */
export function buildCloudPayload(state: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(state || {})) {
    if ((LOCAL_ONLY_FIELDS as readonly string[]).includes(key)) continue;
    out[key] = value;
  }
  return out;
}

function timestampOf(row: Record<string, any>): string {
  return String(row.updated_at || row.created_at || row.published_at || row.at || '');
}

/**
 * Gộp hai bản theo id: không mục nào biến mất. Cùng id thì bản mới hơn thắng;
 * bằng thời gian thì cloud thắng (cloud là nguồn chuẩn khi hai máy cùng mở app).
 */
function rowId(row: unknown): string {
  return row && typeof row === 'object' ? String((row as Record<string, any>).id ?? '') : '';
}

/**
 * Gộp hai bản theo id: không mục nào biến mất. Cùng id thì bản mới hơn thắng;
 * bằng thời gian thì cloud thắng (cloud là nguồn chuẩn khi hai máy cùng mở app).
 * Dòng không có id và chuỗi (vd `sent_reminders`) được giữ nguyên thứ tự và loại trùng theo nội dung,
 * vì mỗi lần kéo - đẩy lại sẽ thấy lại đúng dòng đó.
 */
export function mergeById(local: unknown, remote: unknown): any[] {
  const l = Array.isArray(local) ? local : [];
  const r = Array.isArray(remote) ? remote : [];
  const byId = new Map<string, any>();
  for (const row of l) {
    const id = rowId(row);
    if (id) byId.set(id, row);
  }
  for (const row of r) {
    const id = rowId(row);
    if (!id) continue;
    const mine = byId.get(id);
    if (!mine || timestampOf(row) >= timestampOf(mine)) byId.set(id, row);
  }
  const extras: any[] = [];
  const seen = new Set<string>();
  for (const row of [...l, ...r]) {
    if (rowId(row)) continue;
    const fingerprint = JSON.stringify(row) ?? String(row);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    extras.push(row);
  }
  return [...byId.values(), ...extras];
}

/** Mây là nguồn chuẩn; phần chỉ có ở máy local được giữ lại để không mất việc đang làm. */
export function mergeCloudState(local: Record<string, any>, remotePayload: Record<string, any>): Record<string, any> {
  const merged: Record<string, any> = { ...local };
  for (const [key, remoteValue] of Object.entries(remotePayload || {})) {
    if ((LOCAL_ONLY_FIELDS as readonly string[]).includes(key)) continue;
    if (Array.isArray(remoteValue)) {
      merged[key] = mergeById(local[key], remoteValue);
    } else if (remoteValue && typeof remoteValue === 'object') {
      merged[key] = { ...(local[key] || {}), ...remoteValue };
    } else if (remoteValue !== undefined && remoteValue !== null && remoteValue !== '') {
      merged[key] = remoteValue;
    }
  }
  return merged;
}

export function fetchRemote(): Promise<RemoteSnapshot | null> {
  const cfg = cloudConfig();
  return adapter().fetch(cfg ? cfg.docKey : 'co-quan');
}

export function commitRemote(payload: Record<string, any>, baseRevision: number): Promise<CommitResult> {
  const cfg = cloudConfig();
  return adapter().commit(cfg ? cfg.docKey : 'co-quan', payload, baseRevision);
}

export function watchRemote(onChange: (snap: RemoteSnapshot | null) => void): () => void {
  const cfg = cloudConfig();
  return adapter().watch(cfg ? cfg.docKey : 'co-quan', onChange);
}
