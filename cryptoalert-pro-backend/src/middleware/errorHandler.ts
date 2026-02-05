import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError.js';
import { logger } from '../utils/logger.js';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error('App error', { message: err.message, code: err.code, details: err.details });
    }

    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      details: err.details
    });
  }

  const message = err instanceof Error ? err.message : 'Unknown error';
  logger.error('Unhandled error', { message });
  return res.status(500).json({ error: 'Internal server error' });
}
