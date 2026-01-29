import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.string().default('3000'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(10),
  STRIPE_SECRET_KEY: z.string().min(10),
  STRIPE_WEBHOOK_SECRET: z.string().min(10),
  FIREBASE_PROJECT_ID: z.string().min(1),
  FIREBASE_SERVICE_ACCOUNT: z.string().min(10),
  REDIS_URL: z.string().min(10),
  JWT_SECRET: z.string().min(16),
  ENCRYPTION_KEY: z.string().min(32),
  COINGECKO_API_KEY: z.string().optional()
});

export const env = envSchema.parse(process.env);
