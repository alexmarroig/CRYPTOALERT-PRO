import type { NextFunction, Request, Response } from 'express';
import { supabase } from '../config/supabase.js';

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  req.user = data.user;
  return next();
}

export function requireInfluencer(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'influencer') {
    return res.status(403).json({ error: 'Influencer access required' });
  }
  return next();
}
