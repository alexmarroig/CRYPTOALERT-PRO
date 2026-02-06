import type { NextFunction, Request, Response } from 'express';
import { buildRequestLogContext, logger } from '../utils/logger.js';
import { recordApiError } from '../observability/errorTracker.js';
import { recordApiUsage, updateUserLastSeen } from '../observability/usageTracker.js';

const auditedMethods = new Set(['POST', 'PATCH', 'PUT', 'DELETE', 'GET']);

export function auditLogger(req: Request, res: Response, next: NextFunction) {
  if (!auditedMethods.has(req.method)) {
    return next();
  }

  const startedAt = Date.now();
  res.on('finish', () => {
    const context = buildRequestLogContext(req);
    const route = `${req.method} ${req.baseUrl}${req.route?.path ?? req.path}`.replace(/\/+/g, '/');
    void recordApiUsage(route, res.statusCode, req.user?.id ?? null);
    if (req.user?.id) {
      void updateUserLastSeen(req.user.id);
    }
    if (res.statusCode >= 400) {
      const normalized = res.locals.normalizedError as { code: string; message: string } | undefined;
      recordApiError({
        request_id: req.requestId ?? null,
        endpoint: route,
        status: res.statusCode,
        code: normalized?.code ?? 'ERROR',
        message: normalized?.message ?? 'Erro',
        captured_at: new Date().toISOString()
      });
    }
    logger.info('request.completed', {
      ...context,
      status: res.statusCode,
      erro: null,
      duration_ms: Date.now() - startedAt
    });
  });

  return next();
}
