import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.string().default('3000'),
  FRONTEND_URL: z.string().url().optional(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(10),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10),
  STRIPE_SECRET: z.string().min(10).optional(),
  STRIPE_SECRET_KEY: z.string().min(10).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(10),
  STRIPE_PRICE_PRO: z.string().min(3).optional(),
  STRIPE_PRICE_VIP: z.string().min(3).optional(),
  FIREBASE_PROJECT_ID: z.string().min(1),
  FIREBASE_SERVICE_ACCOUNT: z.string().min(10).optional(),
  FCM_SERVICE_ACCOUNT_JSON: z.string().min(10).optional(),
  REDIS_URL: z.string().min(10).optional(),
  JWT_SECRET: z.string().min(16),
  ENCRYPTION_KEY: z.string().min(32),
  COINGECKO_API_KEY: z.string().optional()
}).refine((data) => data.STRIPE_SECRET || data.STRIPE_SECRET_KEY, {
  message: 'Missing Stripe secret key',
  path: ['STRIPE_SECRET']
}).refine((data) => data.FIREBASE_SERVICE_ACCOUNT || data.FCM_SERVICE_ACCOUNT_JSON, {
  message: 'Missing Firebase service account JSON',
  path: ['FCM_SERVICE_ACCOUNT_JSON']
});

export const env = envSchema.parse(process.env);
