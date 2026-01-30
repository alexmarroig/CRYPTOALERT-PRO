import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../config/supabase.js';
import { notifyFollowers } from '../services/notifyService.js';

const registerSchema = z.object({
  fcmToken: z.string().min(1),
  device: z.string().min(1)
});

export async function registerPushToken(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parse = registerSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.flatten() });
  }

  const { error } = await supabaseAdmin
    .from('push_tokens')
    .upsert({
      user_id: req.user.id,
      fcm_token: parse.data.fcmToken,
      device: parse.data.device
    }, { onConflict: 'user_id,fcm_token' });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(201).json({ registered: true });
}

export async function testNotification(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  await notifyFollowers(req.user.id, {
    title: 'Teste de notificação',
    body: 'Se você recebeu isso, o push está configurado.'
  });

  return res.json({ sent: true });
}
