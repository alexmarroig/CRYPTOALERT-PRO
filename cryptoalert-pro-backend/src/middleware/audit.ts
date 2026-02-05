import type { NextFunction, Request, Response } from 'express';
import { buildRequestLogContext, logger } from '../utils/logger.js';

const auditedMethods = new Set(['POST', 'PATCH', 'PUT', 'DELETE', 'GET']);

export function auditLogger(req: Request, res: Response, next: NextFunction) {
  if (!auditedMethods.has(req.method)) {
    return next();
  }

  const startedAt = Date.now();
  res.on('finish', () => {
    const context = buildRequestLogContext(req);
    logger.info('request.completed', {
      ...context,
      status: res.statusCode,
      erro: null,
      duration_ms: Date.now() - startedAt
    });
  });

  return next();
}
