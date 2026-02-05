import { stripe } from '../config/stripe.js';
import { env } from '../config/env.js';
import { supabaseAdmin } from '../config/supabase.js';
import { instrumentDependency } from '../observability/telemetry.js';

type Plan = 'pro' | 'vip';

export async function createCheckoutSession(email: string, userId: string, plan: Plan, referrerId?: string) {
  const priceId = plan === 'pro' ? env.STRIPE_PRICE_PRO : env.STRIPE_PRICE_VIP;
  if (!priceId) {
    throw new Error('Missing Stripe price configuration');
  }

  return instrumentDependency('stripe', 'checkout_session_create', () => stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    customer_email: email,
    client_reference_id: userId,
    subscription_data: {
      metadata: {
        user_id: userId,
        plan,
        referrer_id: referrerId ?? ''
      }
    },
    success_url: `${env.FRONTEND_URL ?? 'https://cryptoalert.pro'}/billing/success`,
    cancel_url: `${env.FRONTEND_URL ?? 'https://cryptoalert.pro'}/billing/cancel`,
    metadata: {
      user_id: userId,
      plan,
      referrer_id: referrerId ?? ''
    }
  }));
}

export async function handleStripeWebhook(event: any) {
  return instrumentDependency('stripe', 'webhook_handler', async () => {
    if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
      const subscription = event.data.object as {
        id: string;
        customer: string;
        current_period_end: number;
        items: { data: Array<{ price: { id: string } }> };
        metadata?: { user_id?: string };
      };
      const priceId = subscription.items.data[0]?.price.id ?? '';
      const plan = priceId.includes('pro') ? 'pro' : 'vip';

      const { data: customer } = await supabaseAdmin
        .from('stripe_customers')
        .select('user_id')
        .eq('stripe_customer_id', subscription.customer)
        .single();

      const userId = subscription.metadata?.user_id ?? customer?.user_id;

      if (userId) {
        await supabaseAdmin
          .from('profiles')
          .update({ plan })
          .eq('id', userId);

        await supabaseAdmin
          .from('stripe_customers')
          .upsert({
            user_id: userId,
            stripe_customer_id: subscription.customer,
            subscription_id: subscription.id,
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString()
          });
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as { customer: string };

      const { data: customer } = await supabaseAdmin
        .from('stripe_customers')
        .select('user_id')
        .eq('stripe_customer_id', subscription.customer)
        .single();

      if (customer?.user_id) {
        await supabaseAdmin
          .from('profiles')
          .update({ plan: 'free' })
          .eq('id', customer.user_id);
      }
    }
  });
}
