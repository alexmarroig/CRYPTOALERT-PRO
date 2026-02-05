import type { NextFunction, Request, Response } from 'express';

export function requireRole(...roles: Array<'user' | 'influencer' | 'admin'>) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Você não tem permissão para acessar este recurso.' });
    }
    return next();
  };
}
