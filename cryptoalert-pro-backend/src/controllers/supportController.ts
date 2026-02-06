import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../errors/AppError.js';
import { logger } from '../utils/logger.js';

const createTicketSchema = z.object({
  type: z.enum(['bug', 'billing', 'feedback', 'expert_report']),
  title: z.string().min(4).max(120),
  message: z.string().min(8).max(3000),
  page_url: z.string().url().optional(),
  device: z.string().max(120).optional(),
  app_version: z.string().max(40).optional(),
  screenshots: z.array(z.string().url()).max(5).optional()
});

const adminQuerySchema = z.object({
  status: z.enum(['open', 'closed']).optional()
});

const adminUpdateSchema = z.object({
  status: z.enum(['open', 'closed']).optional(),
  internal_notes: z.string().max(2000).optional(),
  resolution: z.string().max(2000).optional()
});

export async function createSupportTicket(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = createTicketSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { data, error } = await supabaseAdmin.from('support_tickets').insert({
    user_id: req.user.id,
    type: parsed.data.type,
    title: parsed.data.title,
    message: parsed.data.message,
    page_url: parsed.data.page_url,
    device: parsed.data.device,
    app_version: parsed.data.app_version,
    screenshots: parsed.data.screenshots ?? [],
    status: 'open',
    created_at: new Date().toISOString()
  }).select('id, created_at, status').single();

  if (error) {
    logger.error('support.ticket.create_failed', { error: error.message });
    throw new AppError('Falha ao registrar ticket', 500, { code: 'SUPPORT_TICKET_CREATE_FAILED' });
  }

  return res.status(201).json({
    ticket: {
      id: data?.id,
      status: data?.status ?? 'open',
      created_at: data?.created_at ?? new Date().toISOString(),
      protocol: `SUP-${String(data?.id ?? '').slice(0, 8).toUpperCase()}`
    }
  });
}

export async function listMySupportTickets(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { data, error } = await supabaseAdmin
    .from('support_tickets')
    .select('id, type, title, status, created_at, updated_at, resolution')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json({ tickets: data ?? [] });
}

export async function listSupportTicketsAdmin(req: Request, res: Response) {
  const parsed = adminQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  let query = supabaseAdmin
    .from('support_tickets')
    .select('id, user_id, type, title, status, created_at, updated_at, page_url, app_version, device');

  if (parsed.data.status) {
    query = query.eq('status', parsed.data.status);
  }

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });

  return res.json({ tickets: data ?? [] });
}

export async function updateSupportTicketAdmin(req: Request, res: Response) {
  const parsed = adminUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { data, error } = await supabaseAdmin
    .from('support_tickets')
    .update({
      status: parsed.data.status,
      internal_notes: parsed.data.internal_notes,
      resolution: parsed.data.resolution,
      updated_at: new Date().toISOString()
    })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Ticket not found' });

  return res.json({ ticket: data });
}
