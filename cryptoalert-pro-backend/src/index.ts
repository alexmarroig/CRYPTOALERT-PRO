import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { apiRoutes } from './routes/index.js';
import { apiRateLimit } from './middleware/rateLimit.js';
import { logger } from './utils/logger.js';
import './utils/queue.js';

const app = express();
const jsonParser = express.json();

app.use(cors({
  origin: process.env.FRONTEND_URL ?? '*',
  credentials: true
}));

app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
app.use((req, res, next) => {
  if (req.originalUrl === '/api/payments/webhook') {
    return next();
  }
  return jsonParser(req, res, next);
});
app.use(apiRateLimit);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api', apiRoutes);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { message: err.message });
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(Number(env.PORT), () => {
  logger.info('Server started', { port: env.PORT });
});
