import type { Request, Response } from 'express';
import { z } from 'zod';
import { stripe } from '../config/stripe.js';
import { env } from '../config/env.js';
import { supabaseAdmin } from '../config/supabase.js';
import { createCheckoutSession, handleStripeWebhook } from '../services/stripeService.js';

const checkoutSchema = z.object({
  plan: z.enum(['pro', 'vip']),
  referrerId: z.string().uuid().optional()
});

export const billingControllerDeps = {
  createCheckoutSession,
  handleStripeWebhook
};

export async function createCheckout(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parse = checkoutSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.flatten() });
  }

  const session = await billingControllerDeps.createCheckoutSession(req.user.email, req.user.id, parse.data.plan, parse.data.referrerId);
  return res.json({ checkout_url: session.url });
}

export async function billingStatus(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { data } = await supabaseAdmin
    .from('stripe_customers')
    .select('current_period_end')
    .eq('user_id', req.user.id)
    .single();

  return res.json({
    plan: req.user.plan,
    current_period_end: data?.current_period_end ?? null
  });
}

export async function webhook(req: Request, res: Response) {
  const signature = req.headers['stripe-signature'] as string;
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    return res.status(400).send('Webhook signature verification failed.');
  }

  await billingControllerDeps.handleStripeWebhook(event);
  return res.json({ received: true });
}
