import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export function requestContext(req: Request, res: Response, next: NextFunction) {
  const headerTraceId = req.header('x-trace-id');
  const traceId = headerTraceId && headerTraceId.trim().length > 0
    ? headerTraceId.trim()
    : crypto.randomUUID();

  req.traceId = traceId;
  res.setHeader('x-trace-id', traceId);
  return next();
}
