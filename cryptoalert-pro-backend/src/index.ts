import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { createApp } from './app.js';
import { checkRSI, checkVolumeSpike } from './services/marketMonitor.js';

const app = createApp();

// Simple background task simulation (real apps would use BullMQ/Cron)
if (process.env.NODE_ENV !== 'test') {
  setInterval(async () => {
    try {
      await checkRSI('BTC/USDT');
      await checkVolumeSpike('BTC/USDT');
    } catch (error) {
      logger.error('Background task error', { error });
    }
  }, 5 * 60 * 1000); // 5 minutes
}

app.listen(Number(env.PORT), () => {
  logger.info('Server started', { port: env.PORT });
});
