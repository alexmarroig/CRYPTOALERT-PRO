import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export function requestContext(req: Request, res: Response, next: NextFunction) {
  const headerRequestId = req.header('x-request-id');
  const headerTraceId = req.header('x-trace-id');
  const requestId = headerRequestId && headerRequestId.trim().length > 0
    ? headerRequestId.trim()
    : headerTraceId && headerTraceId.trim().length > 0
      ? headerTraceId.trim()
      : crypto.randomUUID();
  const traceId = headerTraceId && headerTraceId.trim().length > 0 ? headerTraceId.trim() : requestId;

  req.requestId = requestId;
  req.traceId = traceId;
  res.setHeader('x-trace-id', traceId);
  res.setHeader('x-request-id', requestId);
  return next();
}
