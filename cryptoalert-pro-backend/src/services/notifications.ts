import { firebaseAdmin } from '../config/firebase.js';
import { logger } from '../utils/logger.js';

export async function sendPushNotification(token: string | null, signal: Record<string, unknown>) {
  if (!token) {
    return;
  }

  await firebaseAdmin.messaging().send({
    token,
    notification: {
      title: `🔴 NEW SIGNAL | ${signal.coin ?? ''}`,
      body: `${String(signal.direction ?? '').toUpperCase()} ${signal.entry_price ?? ''}`
    },
    data: {
      signal_id: String(signal.id ?? '')
    }
  });
}

export class NotificationService {
  async newSignal(signal: Record<string, unknown>) {
    logger.info('Enqueued signal notification', { signalId: signal.id });
  }
}
