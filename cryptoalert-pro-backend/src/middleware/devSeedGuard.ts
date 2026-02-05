import type { NextFunction, Request, Response } from 'express';

export function requireDevSeedAccess(req: Request, res: Response, next: NextFunction) {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Endpoint indisponível em produção.' });
  }

  const seedKey = process.env.DEV_SEED_KEY;
  const provided = req.header('X-Dev-Seed-Key');

  if (!seedKey || !provided || provided !== seedKey) {
    return res.status(403).json({ error: 'Acesso negado para seed de desenvolvimento.' });
  }

  return next();
}
