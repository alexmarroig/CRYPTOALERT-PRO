import { firebaseAdmin } from '../config/firebase.js';
import { logger } from '../utils/logger.js';

type NotificationPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

function formatPrice(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '';
  }
  return Number(value).toFixed(4);
}

async function sendPushMessage(token: string | null, payload: NotificationPayload) {
  if (!token) {
    return;
  }

  await firebaseAdmin.messaging().send({
    token,
    notification: {
      title: payload.title,
      body: payload.body
    },
    data: payload.data ?? {}
  });
}

export async function sendPushNotification(token: string | null, signal: Record<string, unknown>) {
  await sendPushMessage(token, {
    title: `🔴 NEW SIGNAL | ${signal.coin ?? ''}`,
    body: `${String(signal.direction ?? '').toUpperCase()} ${signal.entry_price ?? ''}`,
    data: {
      signal_id: String(signal.id ?? '')
    }
  });
}

export async function sendSignalUpdateNotification(
  token: string | null,
  payload: { signalId: string; coin: string; level: string; direction: string; price: number }
) {
  await sendPushMessage(token, {
    title: `📈 SIGNAL UPDATE | ${payload.coin}`,
    body: `${payload.level} atingido (${payload.direction.toUpperCase()}) @ ${formatPrice(payload.price)}`,
    data: {
      signal_id: payload.signalId,
      level: payload.level
    }
  });
}

export async function sendSignalClosedNotification(
  token: string | null,
  payload: { signalId: string; coin: string; reason: string; price: number }
) {
  await sendPushMessage(token, {
    title: `✅ SIGNAL FECHADO | ${payload.coin}`,
    body: `Encerrado por ${payload.reason} @ ${formatPrice(payload.price)}`,
    data: {
      signal_id: payload.signalId,
      reason: payload.reason
    }
  });
}

export async function sendRiskAlertNotification(
  token: string | null,
  payload: { pnlPct: number }
) {
  const pct = (payload.pnlPct * 100).toFixed(2);
  await sendPushMessage(token, {
    title: '⚠️ ALERTA DE RISCO',
    body: `PnL diário em ${pct}%. Considere reduzir exposição.`,
    data: {
      pnl_pct: pct
    }
  });
}

export class NotificationService {
  async newSignal(signal: Record<string, unknown>) {
    logger.info('Enqueued signal notification', { signalId: signal.id });
  }
}
