import Stripe from 'stripe';
import { env } from './env.js';

const stripeSecret = env.STRIPE_SECRET ?? env.STRIPE_SECRET_KEY;

export const stripe = new Stripe(stripeSecret ?? '', {
  apiVersion: '2023-10-16'
});
