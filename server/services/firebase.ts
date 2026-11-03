// import { initializeApp, cert, getApps, applicationDefault } from 'firebase-admin/app';
// import { getFirestore } from 'firebase-admin/firestore';
// import { getAuth } from 'firebase-admin/auth';
//
// // Initialize Firebase Admin
// if (!getApps().length) {
//   initializeApp({
//     credential: applicationDefault(),
//     projectId: 'ai-studio-applamlich-f9d6dda5-4a32-496f-a22a-e4205e2af56f',
//   });
// }
//
// export const db = getFirestore();
// export const auth = getAuth();
//
// export async function getSession(sessionId: string) {
//   const doc = await db.collection('sessions').doc(sessionId).get();
//   if (!doc.exists) return null;
//   return doc.data();
// }
//
// export async function saveSession(session: any) {
//   await db.collection('sessions').doc(session.id).set(session);
// }
//
// export async function deleteSession(sessionId: string) {
//   await db.collection('sessions').doc(sessionId).delete();
// }

export async function getSession(sessionId: string) { return null; }
export async function saveSession(session: any) { return; }
export async function deleteSession(sessionId: string) { return; }
