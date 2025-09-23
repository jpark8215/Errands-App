import admin from 'firebase-admin';
import { logger } from '../utils/logger';
import { config } from '../utils/config';

let initialized = false;

export function initFirebase() {
  if (initialized) return;
  if (
    !config.FIREBASE_PROJECT_ID ||
    !config.FIREBASE_CLIENT_EMAIL ||
    !config.FIREBASE_PRIVATE_KEY
  ) {
    logger.warn('Firebase Admin not fully configured; push notifications disabled');
    return;
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: config.FIREBASE_PROJECT_ID,
      clientEmail: config.FIREBASE_CLIENT_EMAIL,
      privateKey: config.FIREBASE_PRIVATE_KEY,
    } as admin.ServiceAccount),
  });
  initialized = true;
  logger.info('Firebase Admin initialized');
}

export async function sendPush(
  tokens: string[],
  payload: admin.messaging.MessagingPayload,
  options?: admin.messaging.MessagingOptions
) {
  if (!initialized) {
    logger.warn('sendPush called but Firebase not initialized');
    return { successCount: 0, failureCount: tokens.length, results: [] };
  }
  try {
    const res = await admin.messaging().sendToDevice(tokens, payload, options);
    const failed = res.results.filter((r) => !!r.error);
    if (failed.length) {
      logger.warn(`FCM send had ${failed.length} failures`, { failed });
    }
    return res;
  } catch (err) {
    logger.error('FCM sendToDevice error', { err });
    throw err;
  }
}
