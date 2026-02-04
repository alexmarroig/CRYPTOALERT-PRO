import express from 'express';
import cors from 'cors';
import { v1Routes } from './routes/v1/index.js';
import { apiRateLimit } from './middleware/rateLimit.js';
import { auditLogger } from './middleware/audit.js';
import { logger } from './utils/logger.js';

export function createApp() {
  const app = express();
  const jsonParser = express.json();

  app.use(cors({
    origin: process.env.FRONTEND_URL ?? 'https://cryptoalert.pro',
    credentials: true
  }));

  app.use('/v1/billing/webhook', express.raw({ type: 'application/json' }));
  app.use((req, res, next) => {
    if (req.originalUrl === '/v1/billing/webhook') {
      return next();
    }
    return jsonParser(req, res, next);
  });

  app.use(apiRateLimit);
  app.use(auditLogger);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/v1', v1Routes);

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error('Unhandled error', { message: err.message });
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
