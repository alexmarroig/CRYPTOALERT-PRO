import { Queue, Worker } from 'bullmq';
import { redis } from '../config/redis.js';
import { supabase } from '../config/supabase.js';
import { getLivePrices } from './coingecko.js';
import {
  sendPushNotification,
  sendRiskAlertNotification,
  sendSignalClosedNotification,
  sendSignalUpdateNotification
} from '../services/notifications.js';
import { logger } from './logger.js';

export const signalQueue = new Queue('signals', { connection: redis });

const SIGNAL_UPDATE_INTERVAL_MS = 5 * 60 * 1000;
const RISK_ALERT_INTERVAL_MS = 60 * 60 * 1000;
const RISK_ALERT_THROTTLE_MS = 12 * 60 * 60 * 1000;

type SignalRow = {
  id: string;
  coin: string;
  direction: string;
  entry_price: number | null;
  tp1: number | null;
  tp2: number | null;
  sl_price: number | null;
  status: string;
};

type UserTradeRow = {
  id: string;
  user_id: string;
  signal_id: string;
  amount: number | null;
  entry_price: number | null;
  status: string | null;
  closed_at: string | null;
};

type UserRow = {
  id: string;
  fcm_token: string | null;
  notifications_enabled: boolean | null;
};

const riskAlertThrottle = new Map<string, number>();

async function ensureCronJobs() {
  await signalQueue.add(
    'check-signal-updates',
    {},
    {
      repeat: { every: SIGNAL_UPDATE_INTERVAL_MS },
      jobId: 'cron-check-signal-updates'
    }
  );

  await signalQueue.add(
    'check-risk-alerts',
    {},
    {
      repeat: { every: RISK_ALERT_INTERVAL_MS },
      jobId: 'cron-check-risk-alerts'
    }
  );
}

function calculatePnlPct(entryPrice: number, currentPrice: number, direction: string) {
  if (!entryPrice) {
    return 0;
  }
  return direction === 'short'
    ? (entryPrice - currentPrice) / entryPrice
    : (currentPrice - entryPrice) / entryPrice;
}

function isTpHit(direction: string, currentPrice: number, target: number | null) {
  if (!target) {
    return false;
  }
  return direction === 'short' ? currentPrice <= target : currentPrice >= target;
}

function isSlHit(direction: string, currentPrice: number, stop: number | null) {
  if (!stop) {
    return false;
  }
  return direction === 'short' ? currentPrice >= stop : currentPrice <= stop;
}

async function handleSignalUpdates() {
  const { data: trades, error: tradesError } = await supabase
    .from('user_trades')
    .select('id, user_id, signal_id, amount, entry_price, status, closed_at');

  if (tradesError) {
    throw tradesError;
  }

  const { data: signals, error: signalsError } = await supabase
    .from('signals')
    .select('id, coin, direction, entry_price, tp1, tp2, sl_price, status');

  if (signalsError) {
    throw signalsError;
  }

  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, fcm_token, notifications_enabled');

  if (usersError) {
    throw usersError;
  }

  const userMap = new Map((users ?? []).map((user) => [user.id, user]));
  const tradesBySignal = new Map<string, UserTradeRow[]>();

  (trades ?? [])
    .filter((trade) => trade.status !== 'closed')
    .forEach((trade) => {
      const list = tradesBySignal.get(trade.signal_id) ?? [];
      list.push(trade);
      tradesBySignal.set(trade.signal_id, list);
    });

  const coinIds = Array.from(new Set((signals ?? []).map((signal) => signal.coin.toLowerCase())));
  const prices = await getLivePrices(coinIds);

  for (const signal of signals ?? []) {
    if (signal.status === 'closed') {
      continue;
    }

    const signalTrades = tradesBySignal.get(signal.id) ?? [];
    if (signalTrades.length === 0) {
      continue;
    }

    const currentPrice = prices[signal.coin.toLowerCase()]?.usd;
    if (!currentPrice) {
      continue;
    }

    const tp1Hit = isTpHit(signal.direction, currentPrice, signal.tp1);
    const tp2Hit = isTpHit(signal.direction, currentPrice, signal.tp2);
    const slHit = isSlHit(signal.direction, currentPrice, signal.sl_price);

    if (tp2Hit || slHit) {
      const reason = tp2Hit ? 'TP2' : 'SL';

      await supabase
        .from('signals')
        .update({ status: 'closed', closed_at: new Date().toISOString() })
        .eq('id', signal.id);

      for (const trade of signalTrades) {
        if (trade.status === 'closed') {
          continue;
        }

        const entryPrice = Number(trade.entry_price ?? signal.entry_price ?? 0);
        const notional = Number(trade.amount ?? 0) * entryPrice;
        const pnlPct = calculatePnlPct(entryPrice, currentPrice, signal.direction);
        const pnlUsd = notional * pnlPct;

        await supabase
          .from('user_trades')
          .update({
            status: 'closed',
            pnl_pct: pnlPct,
            pnl_usd: pnlUsd,
            closed_at: new Date().toISOString()
          })
          .eq('id', trade.id);

        const user = userMap.get(trade.user_id);
        if (!user?.notifications_enabled) {
          continue;
        }

        await sendSignalUpdateNotification(user.fcm_token, {
          signalId: signal.id,
          coin: signal.coin,
          level: reason,
          direction: signal.direction,
          price: currentPrice
        });

        await sendSignalClosedNotification(user.fcm_token, {
          signalId: signal.id,
          coin: signal.coin,
          reason,
          price: currentPrice
        });
      }

      logger.info('Signal closed via TP/SL', { signalId: signal.id, reason });
      continue;
    }

    if (tp1Hit) {
      for (const trade of signalTrades) {
        if (trade.status !== 'active') {
          continue;
        }

        await supabase
          .from('user_trades')
          .update({ status: 'tp1_hit' })
          .eq('id', trade.id);

        const user = userMap.get(trade.user_id);
        if (!user?.notifications_enabled) {
          continue;
        }

        await sendSignalUpdateNotification(user.fcm_token, {
          signalId: signal.id,
          coin: signal.coin,
          level: 'TP1',
          direction: signal.direction,
          price: currentPrice
        });
      }

      logger.info('Signal TP1 updates sent', { signalId: signal.id });
    }
  }
}

async function handleRiskAlerts() {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  const { data: trades, error: tradesError } = await supabase
    .from('user_trades')
    .select('user_id, amount, entry_price, pnl_usd, closed_at')
    .gte('closed_at', startOfDay.toISOString());

  if (tradesError) {
    throw tradesError;
  }

  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, fcm_token, notifications_enabled');

  if (usersError) {
    throw usersError;
  }

  const totals = new Map<string, { pnlUsd: number; notional: number }>();
  for (const trade of trades ?? []) {
    if (!trade.user_id) {
      continue;
    }

    const entryPrice = Number(trade.entry_price ?? 0);
    const notional = Number(trade.amount ?? 0) * entryPrice;
    const pnlUsd = Number(trade.pnl_usd ?? 0);

    const current = totals.get(trade.user_id) ?? { pnlUsd: 0, notional: 0 };
    current.pnlUsd += pnlUsd;
    current.notional += notional;
    totals.set(trade.user_id, current);
  }

  for (const user of users ?? []) {
    if (!user.notifications_enabled) {
      continue;
    }

    const total = totals.get(user.id);
    if (!total || total.notional <= 0) {
      continue;
    }

    const pnlPct = total.pnlUsd / total.notional;
    if (pnlPct >= -0.05) {
      continue;
    }

    const lastAlert = riskAlertThrottle.get(user.id) ?? 0;
    if (Date.now() - lastAlert < RISK_ALERT_THROTTLE_MS) {
      continue;
    }

    await sendRiskAlertNotification(user.fcm_token, { pnlPct });
    riskAlertThrottle.set(user.id, Date.now());
  }
}

export const signalWorker = new Worker(
  'signals',
  async (job) => {
    if (job.name === 'notify-signal') {
      const { signalId } = job.data as { signalId: string };
      const { data: signal, error: signalError } = await supabase
        .from('signals')
        .select('*')
        .eq('id', signalId)
        .single();

      if (signalError) {
        throw signalError;
      }

      const { data: users, error } = await supabase
        .from('users')
        .select('id, fcm_token, subscription_tier')
        .in('subscription_tier', ['pro', 'vip']);

      if (error) {
        throw error;
      }

      await Promise.all(
        (users ?? []).map((user) =>
          sendPushNotification(user.fcm_token, signal)
        )
      );

      logger.info('Signal notifications dispatched', { signalId, usersNotified: users?.length ?? 0 });
      return;
    }

    if (job.name === 'check-signal-updates') {
      await handleSignalUpdates();
      return;
    }

    if (job.name === 'check-risk-alerts') {
      await handleRiskAlerts();
      return;
    }

    logger.warn('Unhandled job name', { jobName: job.name });
  },
  { connection: redis }
);

signalWorker.on('failed', (job, err) => {
  logger.error('Signal job failed', { jobId: job?.id, error: err.message });
});

ensureCronJobs().catch((error) => {
  logger.error('Failed to schedule notification cron jobs', { error: error.message });
});
