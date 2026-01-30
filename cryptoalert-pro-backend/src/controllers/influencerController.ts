import type { Request, Response } from 'express';
import type Stripe from 'stripe';
import { supabase } from '../config/supabase.js';
import { stripe } from '../config/stripe.js';
import { EarningsService } from '../services/earnings.js';

const earningsService = new EarningsService();
const STRIPE_PRICE_PRO = process.env.STRIPE_PRICE_PRO;
const STRIPE_PRICE_VIP = process.env.STRIPE_PRICE_VIP;

function resolveTierFromPrice(priceId?: string | null) {
  if (!priceId) {
    return 'unknown';
  }

  if (STRIPE_PRICE_PRO && priceId === STRIPE_PRICE_PRO) {
    return 'pro';
  }

  if (STRIPE_PRICE_VIP && priceId === STRIPE_PRICE_VIP) {
    return 'vip';
  }

  if (priceId.includes('vip')) {
    return 'vip';
  }

  if (priceId.includes('pro')) {
    return 'pro';
  }

  return 'unknown';
}

async function listStripeEvents(type: string, maxPages = 5) {
  const events: Stripe.Event[] = [];
  let startingAfter: string | undefined;

  for (let page = 0; page < maxPages; page += 1) {
    const response = await stripe.events.list({
      type,
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {})
    });

    events.push(...response.data);

    if (!response.has_more) {
      break;
    }

    startingAfter = response.data.at(-1)?.id;
    if (!startingAfter) {
      break;
    }
  }

  return events;
}

function extractCustomerId(event: Stripe.Event) {
  const payload = event.data.object as { customer?: string; customer_id?: string };
  return payload.customer ?? payload.customer_id ?? '';
}

export async function getEarnings(req: Request, res: Response) {
  const totals = await earningsService.calculateInfluencerEarnings(req.user?.id ?? '');
  return res.json(totals);
}

export async function requestPayout(req: Request, res: Response) {
  const { error } = await supabase
    .from('influencer_earnings')
    .update({ payout_status: 'requested' })
    .eq('influencer_id', req.user?.id)
    .eq('payout_status', 'pending');

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json({ status: 'requested' });
}

export async function getStats(req: Request, res: Response) {
  const influencerId = req.user?.id;

  const { data: signals } = await supabase
    .from('signals')
    .select('id, status, win_rate')
    .eq('influencer_id', influencerId);

  const { data: referred } = await supabase
    .from('users')
    .select('id, stripe_customer_id, subscription_tier, created_at')
    .eq('referred_by', influencerId);

  const totalSignals = signals?.length ?? 0;
  const winRate = signals?.reduce((sum, signal) => sum + Number(signal.win_rate ?? 0), 0) / (totalSignals || 1);
  const referredUsers = referred ?? [];
  const referredCustomers = referredUsers
    .map((user) => user.stripe_customer_id)
    .filter((customerId): customerId is string => Boolean(customerId));
  const customerSet = new Set(referredCustomers);

  let conversionStats = {
    total: 0,
    pro: 0,
    vip: 0,
    rate: 0
  };
  let churnStats = {
    total: 0,
    rate: 0
  };
  let ltvStats = {
    total: 0,
    averagePerPayingUser: 0,
    averagePerReferredUser: 0
  };

  if (customerSet.size > 0) {
    const [createdEvents, deletedEvents, paidEvents] = await Promise.all([
      listStripeEvents('customer.subscription.created'),
      listStripeEvents('customer.subscription.deleted'),
      listStripeEvents('invoice.paid')
    ]);

    const conversionByCustomer = new Map<
      string,
      { tier: 'pro' | 'vip' | 'unknown'; created: number }
    >();

    for (const event of createdEvents) {
      const customerId = extractCustomerId(event);
      if (!customerSet.has(customerId)) {
        continue;
      }

      const subscription = event.data.object as {
        customer?: string;
        items?: { data: Array<{ price?: { id?: string } }> };
      };
      const priceId = subscription.items?.data[0]?.price?.id ?? null;
      const tier = resolveTierFromPrice(priceId);
      const existing = conversionByCustomer.get(customerId);

      if (!existing || event.created > existing.created) {
        conversionByCustomer.set(customerId, { tier, created: event.created });
      }
    }

    for (const user of referredUsers) {
      if (!user.stripe_customer_id) {
        continue;
      }

      if (!conversionByCustomer.has(user.stripe_customer_id)) {
        const fallbackTier = user.subscription_tier === 'vip' ? 'vip' : user.subscription_tier === 'pro' ? 'pro' : 'unknown';
        if (fallbackTier !== 'unknown') {
          conversionByCustomer.set(user.stripe_customer_id, {
            tier: fallbackTier,
            created: Math.floor(new Date(user.created_at ?? Date.now()).getTime() / 1000)
          });
        }
      }
    }

    let proConversions = 0;
    let vipConversions = 0;

    for (const conversion of conversionByCustomer.values()) {
      if (conversion.tier === 'pro') {
        proConversions += 1;
      }

      if (conversion.tier === 'vip') {
        vipConversions += 1;
      }
    }

    const convertedTotal = proConversions + vipConversions;
    conversionStats = {
      total: convertedTotal,
      pro: proConversions,
      vip: vipConversions,
      rate: convertedTotal / (referredUsers.length || 1)
    };

    const churnedCustomers = new Set<string>();
    for (const event of deletedEvents) {
      const customerId = extractCustomerId(event);
      if (customerSet.has(customerId)) {
        churnedCustomers.add(customerId);
      }
    }

    churnStats = {
      total: churnedCustomers.size,
      rate: churnedCustomers.size / (convertedTotal || 1)
    };

    let totalPaid = 0;
    const payingCustomers = new Set<string>();

    for (const event of paidEvents) {
      const customerId = extractCustomerId(event);
      if (!customerSet.has(customerId)) {
        continue;
      }

      const invoice = event.data.object as { amount_paid?: number | null; customer?: string };
      const amountPaid = Number(invoice.amount_paid ?? 0) / 100;
      if (amountPaid > 0) {
        totalPaid += amountPaid;
        payingCustomers.add(customerId);
      }
    }

    ltvStats = {
      total: totalPaid,
      averagePerPayingUser: totalPaid / (payingCustomers.size || 1),
      averagePerReferredUser: totalPaid / (referredUsers.length || 1)
    };
  }

  return res.json({
    totalSignals,
    totalUsers: referred?.length ?? 0,
    conversionRate: (referred?.length ?? 0) / (totalSignals || 1),
    averageWinRate: Number.isFinite(winRate) ? winRate : 0,
    subscriptionConversions: conversionStats,
    churn: churnStats,
    ltv: ltvStats
  });
}
