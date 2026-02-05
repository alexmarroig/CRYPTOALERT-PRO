import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
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
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{32,64}$/, 'ENCRYPTION_KEY must be 32-64 hex characters'),
  COINGECKO_API_KEY: z.string().optional(),
  DEV_SEED_KEY: z.string().optional(),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(6).optional(),
  EXPERT_EMAIL: z.string().email().optional(),
  EXPERT_PASSWORD: z.string().min(6).optional(),
  PREMIUM_EMAIL: z.string().email().optional(),
  PREMIUM_PASSWORD: z.string().min(6).optional(),
  PREMIUM_PLAN: z.enum(['pro', 'vip']).optional(),
  PORTFOLIO_CURRENCY: z.string().optional()
}).refine((data) => data.STRIPE_SECRET || data.STRIPE_SECRET_KEY, {
  message: 'Missing Stripe secret key',
  path: ['STRIPE_SECRET']
}).refine((data) => data.FIREBASE_SERVICE_ACCOUNT || data.FCM_SERVICE_ACCOUNT_JSON, {
  message: 'Missing Firebase service account JSON',
  path: ['FCM_SERVICE_ACCOUNT_JSON']
}).refine((data) => {
  const blockedValues = new Set(['changeme', 'replace-me', 'test', 'dummy', 'placeholder']);
  const secretFields = [
    data.SUPABASE_SERVICE_ROLE_KEY,
    data.JWT_SECRET,
    data.STRIPE_SECRET ?? data.STRIPE_SECRET_KEY ?? '',
    data.STRIPE_WEBHOOK_SECRET
  ];

  return secretFields.every((value) => {
    const normalized = value.trim().toLowerCase();
    return !blockedValues.has(normalized);
  });
}, {
  message: 'One or more secrets are using placeholder values',
  path: ['JWT_SECRET']
});

export const env = envSchema.parse(process.env);
