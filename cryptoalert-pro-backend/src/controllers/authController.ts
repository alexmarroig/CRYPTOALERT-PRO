import type { Request, Response } from 'express';
import { z } from 'zod';
import { acceptInvite } from '../services/inviteService.js';

const acceptInviteSchema = z.object({
  token: z.string().uuid()
});

export async function acceptInfluencerInvite(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parse = acceptInviteSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.flatten() });
  }

  try {
    const profile = await acceptInvite(req.user.id, req.user.email, parse.data.token);
    return res.json({ profile });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to accept invite';
    return res.status(400).json({ error: message });
  }
}
