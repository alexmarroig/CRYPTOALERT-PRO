import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabase } from '../config/supabase.js';
import { signalQueue } from '../utils/queue.js';
import { getSubscriptionTier } from '../utils/subscription.js';

const createSignalSchema = z.object({
  coin: z.string().min(1),
  direction: z.enum(['long', 'short']),
  entry_price: z.number(),
  tp1: z.number().optional(),
  tp2: z.number().optional(),
  sl: z.number().optional(),
  confidence_pct: z.number().min(0).max(100),
  ai_analysis: z.string().optional()
});

const copySignalSchema = z.object({
  amount: z.number().positive(),
  leverage: z.number().min(1).default(1)
});

export async function createSignal(req: Request, res: Response) {
  const parse = createSignalSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.flatten() });
  }

  const tier = await getSubscriptionTier(req.user?.id);
  if (tier === 'free') {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);

    const { count, error: limitError } = await supabase
      .from('signals')
      .select('id', { count: 'exact', head: true })
      .eq('influencer_id', req.user?.id)
      .gte('created_at', weekStart.toISOString());

    if (limitError) {
      return res.status(500).json({ error: limitError.message });
    }

    if ((count ?? 0) >= 3) {
      return res.status(403).json({ error: 'Free tier limited to 3 signals per 7 days.' });
    }
  }

  const { error, data } = await supabase
    .from('signals')
    .insert({
      influencer_id: req.user?.id,
      coin: parse.data.coin,
      direction: parse.data.direction,
      entry_price: parse.data.entry_price,
      tp1: parse.data.tp1,
      tp2: parse.data.tp2,
      sl_price: parse.data.sl,
      confidence_pct: parse.data.confidence_pct,
      ai_analysis: parse.data.ai_analysis
    })
    .select()
    .single();

  if (error || !data) {
    return res.status(500).json({ error: error?.message ?? 'Failed to create signal' });
  }

  await signalQueue.add('notify-signal', { signalId: data.id });

  return res.status(201).json({ signal: data });
}

export async function getSignals(req: Request, res: Response) {
  const { status, coin, limit = '20', offset = '0' } = req.query as Record<string, string>;

  let query = supabase.from('signals').select('*', { count: 'exact' });

  if (status) {
    query = query.eq('status', status);
  }

  if (coin) {
    query = query.eq('coin', coin);
  }

  const { data, error, count } = await query
    .range(Number(offset), Number(offset) + Number(limit) - 1)
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json({ data, count });
}

export async function getSignal(req: Request, res: Response) {
  const { id } = req.params;
  const { data, error } = await supabase
    .from('signals')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    return res.status(404).json({ error: error.message });
  }

  return res.json({ signal: data });
}

export async function copySignal(req: Request, res: Response) {
  const parse = copySignalSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.flatten() });
  }

  const tier = await getSubscriptionTier(req.user?.id);
  if (tier === 'free') {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);

    const { count, error: limitError } = await supabase
      .from('user_trades')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', req.user?.id)
      .gte('created_at', weekStart.toISOString());

    if (limitError) {
      return res.status(500).json({ error: limitError.message });
    }

    if ((count ?? 0) >= 3) {
      return res.status(403).json({ error: 'Free tier limited to 3 copied signals per 7 days.' });
    }
  }

  const { id } = req.params;

  const { data: signal, error: signalError } = await supabase
    .from('signals')
    .select('*')
    .eq('id', id)
    .single();

  if (signalError || !signal) {
    return res.status(404).json({ error: 'Signal not found' });
  }

  const { data: trade, error } = await supabase
    .from('user_trades')
    .insert({
      user_id: req.user?.id,
      signal_id: signal.id,
      amount: parse.data.amount,
      entry_price: signal.entry_price
    })
    .select()
    .single();

  if (error || !trade) {
    return res.status(500).json({ error: error?.message ?? 'Failed to copy trade' });
  }

  return res.status(201).json({ trade });
}
