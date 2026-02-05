import { startTelemetry, shutdownTelemetry } from './observability/telemetry.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { createApp } from './app.js';
import { evaluateDegradation, getAlerts } from './observability/degradation.js';

await startTelemetry();
import { startPortfolioSyncScheduler } from './services/portfolioScheduler.js';

const app = createApp();

const server = app.listen(Number(env.PORT), () => {
  logger.info('Server started', { port: env.PORT });
  startPortfolioSyncScheduler();
});

setInterval(() => {
  evaluateDegradation();
  const latest = getAlerts()[0];
  if (latest) {
    logger.warn('Degradação detectada', latest);
  }
}, 60_000).unref();

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    logger.info('Shutting down telemetry', { signal });
    server.close();
    await shutdownTelemetry();
    process.exit(0);
  });
}
