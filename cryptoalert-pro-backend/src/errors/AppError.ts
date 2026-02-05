export class AppError extends Error {
  readonly statusCode: number;

  readonly code?: string;

  readonly details?: unknown;

  constructor(message: string, statusCode = 500, options?: { code?: string; details?: unknown }) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = options?.code;
    this.details = options?.details;
  }
}
