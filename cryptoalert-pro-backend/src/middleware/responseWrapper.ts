import type { NextFunction, Request, Response } from 'express';
import { wrapJsonResponse } from '../utils/response.js';

export function responseWrapper(req: Request, res: Response, next: NextFunction) {
  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => originalJson(wrapJsonResponse(req, res, body));
  return next();
}
