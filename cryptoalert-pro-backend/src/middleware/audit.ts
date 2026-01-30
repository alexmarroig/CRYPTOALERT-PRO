import type { NextFunction, Request, Response } from 'express';
import { logger } from '../utils/logger.js';

const auditedMethods = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

export function auditLogger(req: Request, res: Response, next: NextFunction) {
  if (!auditedMethods.has(req.method)) {
    return next();
  }

  const startedAt = Date.now();
  res.on('finish', () => {
    logger.info('audit', {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      user_id: req.user?.id ?? null,
      duration_ms: Date.now() - startedAt
    });
  });

  return next();
}
