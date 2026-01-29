import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabase } from '../config/supabase.js';
import { generateReferralCode } from '../utils/referral.js';

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  referred_by: z.string().optional()
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export async function signup(req: Request, res: Response) {
  const parse = signupSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.flatten() });
  }

  const { email, password, referred_by } = parse.data;

  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error || !data.user) {
    return res.status(400).json({ error: error?.message ?? 'Signup failed' });
  }

  const referralCode = generateReferralCode();

  const { error: insertError } = await supabase.from('users').insert({
    id: data.user.id,
    email,
    referral_code: referralCode,
    referred_by
  });

  if (insertError) {
    return res.status(500).json({ error: insertError.message });
  }

  return res.status(201).json({ user: data.user, jwt_token: data.session?.access_token });
}

export async function login(req: Request, res: Response) {
  const parse = loginSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.flatten() });
  }

  const { email, password } = parse.data;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    return res.status(401).json({ error: error?.message ?? 'Invalid credentials' });
  }

  return res.json({ user: data.user, jwt_token: data.session.access_token });
}

export async function me(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', req.user.id)
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json({ user: data });
}
