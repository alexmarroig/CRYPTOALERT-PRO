import type { Request, Response } from 'express';

type ErrorPayload = {
  code: string;
  message: string;
  details?: unknown;
};

function normalizeError(body: unknown): ErrorPayload {
  if (body && typeof body === 'object') {
    const asRecord = body as Record<string, unknown>;
    const error = asRecord.error;
    if (error && typeof error === 'object' && (error as Record<string, unknown>).code) {
      const errorRecord = error as Record<string, unknown>;
      return {
        code: String(errorRecord.code ?? 'ERROR'),
        message: String(errorRecord.message ?? 'Erro inesperado'),
        details: errorRecord.details
      };
    }

    if (typeof asRecord.code === 'string' && typeof asRecord.error === 'string') {
      return {
        code: asRecord.code,
        message: asRecord.error,
        details: asRecord.details
      };
    }

    if (typeof asRecord.error === 'string') {
      return {
        code: String(asRecord.code ?? 'ERROR'),
        message: asRecord.error,
        details: asRecord.details ?? asRecord.hint
      };
    }

    if (typeof asRecord.error === 'object') {
      return {
        code: 'VALIDATION_ERROR',
        message: 'Payload inválido',
        details: asRecord.error
      };
    }
  }

  if (typeof body === 'string') {
    return { code: 'ERROR', message: body };
  }

  return { code: 'ERROR', message: 'Erro inesperado' };
}

export function wrapJsonResponse(req: Request, res: Response, body: unknown) {
  const requestId = req.requestId ?? req.traceId ?? null;
  if (body && typeof body === 'object' && 'request_id' in body) {
    return body;
  }

  if (res.statusCode >= 400) {
    const error = normalizeError(body);
    res.locals.normalizedError = error;
    return { request_id: requestId, error };
  }

  return { request_id: requestId, data: body };
}
