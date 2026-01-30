import type { Request, Response } from 'express';
import { z } from 'zod';
import { stripe } from '../config/stripe.js';
import { env } from '../config/env.js';
import { supabase } from '../config/supabase.js';
import { getSubscriptionTier } from '../utils/subscription.js';

const checkoutSchema = z.object({
  tier: z.enum(['pro', 'vip'])
});

export async function createCheckout(req: Request, res: Response) {
  const parse = checkoutSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.flatten() });
  }

  const currentTier = await getSubscriptionTier(req.user?.id);
  if (currentTier === 'vip') {
    return res.status(400).json({ error: 'Already on VIP tier.' });
  }
  if (currentTier === 'pro' && parse.data.tier === 'pro') {
    return res.status(400).json({ error: 'Already on Pro tier.' });
  }

  const priceId = parse.data.tier === 'pro' ? process.env.STRIPE_PRICE_PRO : process.env.STRIPE_PRICE_VIP;
  if (!priceId) {
    return res.status(500).json({ error: 'Missing Stripe price configuration' });
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    customer_email: req.user?.email,
    success_url: `${process.env.FRONTEND_URL ?? 'https://cryptoalert.pro'}/billing/success`,
    cancel_url: `${process.env.FRONTEND_URL ?? 'https://cryptoalert.pro'}/billing/cancel`
  });

  return res.json({ url: session.url });
}

export async function createPortal(req: Request, res: Response) {
  const currentTier = await getSubscriptionTier(req.user?.id);
  if (currentTier === 'free') {
    return res.status(403).json({ error: 'Only paid subscribers can access the billing portal.' });
  }

  const { data } = await supabase
    .from('users')
    .select('stripe_customer_id')
    .eq('id', req.user?.id)
    .single();

  if (!data?.stripe_customer_id) {
    return res.status(400).json({ error: 'Missing Stripe customer id' });
  }

  const portal = await stripe.billingPortal.sessions.create({
    customer: data.stripe_customer_id,
    return_url: `${process.env.FRONTEND_URL ?? 'https://cryptoalert.pro'}/billing`
  });

  return res.json({ url: portal.url });
}

export async function webhook(req: Request, res: Response) {
  const signature = req.headers['stripe-signature'] as string;
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    return res.status(400).send('Webhook signature verification failed.');
  }

  if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
    const subscription = event.data.object as { customer: string; items: { data: Array<{ price: { id: string } }> } };
    const priceId = subscription.items.data[0]?.price.id ?? '';
    const tier = priceId.includes('pro') ? 'pro' : 'vip';

    await supabase
      .from('users')
      .update({ subscription_tier: tier })
      .eq('stripe_customer_id', subscription.customer);
  }

  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as { customer: string };
    await supabase
      .from('users')
      .update({ subscription_tier: 'free' })
      .eq('stripe_customer_id', subscription.customer);
  }

  return res.json({ received: true });
}
