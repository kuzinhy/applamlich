import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  getDocFromServer
} from 'firebase/firestore';

/**
 * Cấu hình Firebase KHÔNG nằm trong git. Thứ tự tìm kiếm:
 * 1) biến môi trường VITE_FIREBASE_* (đặt trong .env.local khi chạy Google AI Studio);
 * 2) tệp firebase-applet-config.json ở thư mục dự án, server phục vụ qua /api/config/firebase.
 * Không có cả hai thì mọi hàm ở đây báo "chưa cấu hình" thay vì làm ứng dụng chết ngay lúc nạp.
 */
const NOT_CONFIGURED = 'Chưa cấu hình Firebase — thêm VITE_FIREBASE_API_KEY/PROJECT_ID vào .env.local hoặc đặt firebase-applet-config.json cạnh server.';

async function resolveConfig() {
  const env = import.meta.env;
  if (env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID) {
    return {
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || `${env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || `${env.VITE_FIREBASE_PROJECT_ID}.appspot.com`,
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
      appId: env.VITE_FIREBASE_APP_ID || '',
    };
  }
  const res = await fetch('/api/config/firebase');
  if (!res.ok) return null;
  const cfg = await res.json();
  return cfg?.apiKey ? cfg : null;
}

let handle = null;
let loading = null;
let configured = false;

async function ensure() {
  if (handle) return handle;
  if (!loading) {
    loading = resolveConfig()
      .then((cfg) => {
        if (!cfg) return null;
        configured = true;
        const app = initializeApp(cfg);
        handle = { app, auth: getAuth(app), db: getFirestore(app) };
        return handle;
      })
      .catch(() => null);
  }
  return loading;
}

export const firebaseConfigured = () => configured;

export const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
];

// Flag to indicate if we are in the middle of a sign-in flow.
let isSigningIn = false;
// Cache the access token in memory only (never in localStorage or sessionStorage).
let cachedAccessToken = null;

/**
 * Theo dõi trạng thái đăng nhập. Trả về hàm huỷ đăng ký dùng được kể cả khi
 * Firebase chưa kịp nạp xong.
 */
export const initAuth = (onAuthSuccess, onAuthFailure) => {
  let unsubscribed = false;
  let unsub = null;
  ensure().then((h) => {
    if (!h) {
      if (!unsubscribed && onAuthFailure) onAuthFailure(new Error(NOT_CONFIGURED));
      return;
    }
    if (unsubscribed) return;
    unsub = onAuthStateChanged(h.auth, async (user) => {
      if (user) {
        if (cachedAccessToken) {
          if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
        } else if (!isSigningIn) {
          cachedAccessToken = null;
          if (onAuthFailure) onAuthFailure();
        }
      } else {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    });
  });
  return () => {
    unsubscribed = true;
    if (typeof unsub === 'function') unsub();
  };
};

export const googleSignIn = async () => {
  const h = await ensure();
  if (!h) throw new Error(NOT_CONFIGURED);
  try {
    isSigningIn = true;
    const provider = new GoogleAuthProvider();
    SCOPES.forEach((scope) => provider.addScope(scope));
    const result = await signInWithPopup(h.auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Không lấy được access token từ Firebase Auth');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async () => cachedAccessToken;

export const logout = async () => {
  const h = await ensure();
  if (!h) return;
  await h.auth.signOut();
  cachedAccessToken = null;
};

// Connection Test — gọi thủ công khi cần kiểm tra; không chạy tự động lúc nạp module
// vì bản chạy máy nội bộ không cấu hình Firestore nên chỉ sinh cảnh báo lặp.
export async function testFirebaseConnection() {
  const h = await ensure();
  if (!h) return false;
  try {
    await getDocFromServer(doc(h.db, 'test', 'connection'));
    console.log('Firebase Firestore connection verified.');
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('offline')) {
      console.warn('Firebase is in offline mode or network restricted.');
    }
    return false;
  }
}

export {
  collection, doc, getDocs, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot, signInWithPopup, signOut, onAuthStateChanged
};
