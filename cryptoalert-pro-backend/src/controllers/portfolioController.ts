import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../errors/AppError.js';
import {
  getPortfolioSnapshotByUserId,
  getPortfolioVisibilityByUserId,
  getProfileByUsername,
  getPublicPortfolioSnapshotByUserId,
  upsertPortfolioVisibility
} from '../repositories/portfolioRepository.js';
import { enforcePortfolioVisibilityPolicy, buildPercentVisibilitySnapshot } from '../services/portfolioPolicyService.js';
import { connectExchange, syncPortfolioSnapshot, testExchangeConnection } from '../services/portfolioSync.js';
import { logger } from '../utils/logger.js';

const connectSchema = z.object({
  exchange: z.enum(['binance', 'okx']),
  apiKey: z.string().min(1),
  apiSecret: z.string().min(1)
});

const visibilitySchema = z.object({
  visibility: z.enum(['private', 'friends', 'public', 'percent'])
});

export async function connectPortfolio(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      throw new AppError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
    }

    const parse = connectSchema.safeParse(req.body);
    if (!parse.success) {
      throw new AppError('Invalid payload', 400, { code: 'VALIDATION_ERROR', details: parse.error.flatten() });
    }

    await connectExchange(req.user.id, parse.data.exchange, parse.data.apiKey, parse.data.apiSecret);
    logger.info('audit.portfolio.connect', { user_id: req.user.id, exchange: parse.data.exchange });
    return res.status(201).json({ connected: true });
  } catch (error) {
    return next(error);
  }
}

export async function testPortfolioConnection(req: Request, res: Response, next: NextFunction) {
  try {
    const parse = connectSchema.safeParse(req.body);
    if (!parse.success) {
      throw new AppError('Invalid payload', 400, { code: 'VALIDATION_ERROR', details: parse.error.flatten() });
    }

    await testExchangeConnection(parse.data.exchange, parse.data.apiKey, parse.data.apiSecret);
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
}

export async function syncPortfolio(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      throw new AppError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
    }

    const snapshot = await syncPortfolioSnapshot(req.user.id);
    return res.json({ snapshot });
  } catch (error) {
    return next(error);
  }
}

export async function getMyPortfolio(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      throw new AppError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
    }

    const data = await getPortfolioSnapshotByUserId(req.user.id);
    return res.json({ snapshot: data });
  } catch (error) {
    return next(error);
  }
}

export async function updatePortfolioVisibility(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      throw new AppError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
    }

    const parse = visibilitySchema.safeParse(req.body);
    if (!parse.success) {
      throw new AppError('Invalid payload', 400, { code: 'VALIDATION_ERROR', details: parse.error.flatten() });
    }

    const data = await upsertPortfolioVisibility(req.user.id, parse.data.visibility);

    logger.info('audit.portfolio.visibility', { user_id: req.user.id, visibility: parse.data.visibility });

    return res.json({ visibility: data });
  } catch (error) {
    return next(error);
  }
}

export async function getPublicPortfolio(req: Request, res: Response, next: NextFunction) {
  try {
    const { username } = req.params;

    const profile = await getProfileByUsername(username);
    if (!profile) {
      throw new AppError('Profile not found', 404, { code: 'PROFILE_NOT_FOUND' });
    }

    const mode = await getPortfolioVisibilityByUserId(profile.id);
    const currency = process.env.PORTFOLIO_CURRENCY ?? 'USD';

    await enforcePortfolioVisibilityPolicy({
      mode,
      viewerId: req.user?.id,
      profileId: profile.id
    });

    const snapshot = await getPublicPortfolioSnapshotByUserId(profile.id);

    if (mode === 'percent') {
      const percentSnapshot = buildPercentVisibilitySnapshot(snapshot ?? {});
      return res.json({
        username: profile.username,
        change_pct_30d: percentSnapshot.change_pct_30d,
        top_assets_percent: percentSnapshot.top_assets_percent,
        currency,
        as_of: percentSnapshot.as_of
      });
    }

    return res.json({
      username: profile.username,
      snapshot,
      currency,
      as_of: snapshot?.updated_at ?? new Date().toISOString()
    });
  } catch (error) {
    return next(error);
  }
}
