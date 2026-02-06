import express from 'express';
import cors from 'cors';
import { v1Routes } from './routes/v1/index.js';
import { apiRateLimit } from './middleware/rateLimit.js';
import { auditLogger } from './middleware/audit.js';
import { errorHandler } from './middleware/errorHandler.js';
import { logger } from './utils/logger.js';
import { createRouteMetricMiddleware } from './observability/metrics.js';
import { createTraceMiddleware } from './observability/telemetry.js';
import { buildRequestLogContext, logStructuredError } from './utils/logger.js';
import { requestContext } from './middleware/requestContext.js';
import { responseWrapper } from './middleware/responseWrapper.js';
import { classifyFailureType } from './services/incidentService.js';

export function createApp() {
  const app = express();
  const jsonParser = express.json();

  app.use(requestContext);
  app.use(responseWrapper);

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

  app.use(createTraceMiddleware());
  app.use(apiRateLimit);
  app.use(auditLogger);
  app.use(createRouteMetricMiddleware());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/v1', v1Routes);

  app.use(errorHandler);
  app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const context = buildRequestLogContext(req);
    const status = res.statusCode >= 400 ? res.statusCode : 500;
    logStructuredError({
      ...context,
      status,
      erro: err.message,
      failure_type: classifyFailureType(err.message, req.originalUrl, status)
    });

    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  });

  return app;
}
