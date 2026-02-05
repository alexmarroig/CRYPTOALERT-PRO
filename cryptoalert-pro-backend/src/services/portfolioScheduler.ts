import { env } from '../config/env.js';
import { supabaseAdmin } from '../config/supabase.js';
import { syncPortfolioSnapshot } from './portfolioSync.js';
import { logger } from '../utils/logger.js';

let syncTimer: NodeJS.Timeout | null = null;

export function startPortfolioSyncScheduler() {
  const intervalMinutes = Number(process.env.PORTFOLIO_SYNC_INTERVAL_MINUTES ?? '30');
  if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) {
    logger.warn('portfolio.sync.scheduler.disabled.invalid_interval', { intervalMinutes });
    return;
  }

  const intervalMs = intervalMinutes * 60 * 1000;

  const run = async () => {
    try {
      const { data: connections, error } = await supabaseAdmin
        .from('exchange_connections')
        .select('user_id');

      if (error) {
        throw error;
      }

      const uniqueUsers = [...new Set((connections ?? []).map((connection) => connection.user_id))]
        .filter(Boolean);

      for (const userId of uniqueUsers) {
        try {
          await syncPortfolioSnapshot(userId);
        } catch (err) {
          logger.error('portfolio.sync.scheduler.user_failed', {
            user_id: userId,
            error: err instanceof Error ? err.message : 'unknown'
          });
        }
      }

      logger.info('portfolio.sync.scheduler.completed', { users: uniqueUsers.length, intervalMinutes });
    } catch (err) {
      logger.error('portfolio.sync.scheduler.failed', {
        error: err instanceof Error ? err.message : 'unknown'
      });
    }
  };

  void run();
  syncTimer = setInterval(() => {
    void run();
  }, intervalMs);

  logger.info('portfolio.sync.scheduler.started', {
    intervalMinutes,
    env: env.NODE_ENV
  });
}

export function stopPortfolioSyncScheduler() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}
