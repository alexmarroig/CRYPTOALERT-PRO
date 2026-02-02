import admin from 'firebase-admin';
import { env } from './env.js';

const serviceAccountRaw = env.FCM_SERVICE_ACCOUNT_JSON ?? env.FIREBASE_SERVICE_ACCOUNT ?? '';
const serviceAccount = JSON.parse(serviceAccountRaw);

if (!admin.apps.length) {
  const isTest = process.env.NODE_ENV === 'test';
  if (isTest) {
    admin.initializeApp({ projectId: env.FIREBASE_PROJECT_ID });
  } else {
    const serviceAccountRaw = env.FCM_SERVICE_ACCOUNT_JSON ?? env.FIREBASE_SERVICE_ACCOUNT ?? '';
    const serviceAccount = JSON.parse(serviceAccountRaw);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: env.FIREBASE_PROJECT_ID
    });
  }
}

export const firebaseAdmin = admin;
