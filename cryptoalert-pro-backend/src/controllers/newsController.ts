import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../errors/AppError.js';
import { getFearGreedIndex, getNewsCategoriesList, getNewsFeed } from '../services/newsService.js';

const newsQuerySchema = z.object({
  limit: z.string().optional(),
  category: z.string().optional(),
  q: z.string().optional(),
  lang: z.enum(['pt', 'en']).optional()
});

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

function sanitizeText(value?: string, maxLength = 60) {
  if (!value) return undefined;
  const cleaned = value.trim().replace(/[^\p{L}\p{N}\s-]/gu, '');
  if (!cleaned) return undefined;
  return cleaned.slice(0, maxLength);
}

function parseLimit(value?: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_LIMIT);
}

export async function getNews(req: Request, res: Response, next: NextFunction) {
  try {
    const parse = newsQuerySchema.safeParse(req.query);
    if (!parse.success) {
      throw new AppError('Invalid query params', 400, { code: 'VALIDATION_ERROR', details: parse.error.flatten() });
    }

    const limit = parseLimit(parse.data.limit);
    const category = sanitizeText(parse.data.category, 40);
    const query = sanitizeText(parse.data.q, 80);

    const { items, cached, fallback } = await getNewsFeed({
      limit,
      category,
      query,
      lang: parse.data.lang
    });

    return res.json({
      items,
      meta: {
        provider: 'free-crypto-news',
        cached,
        fallback
      }
    });
  } catch (error) {
    return next(error);
  }
}

export async function getNewsCategories(_req: Request, res: Response, next: NextFunction) {
  try {
    const { categories, cached, fallback } = await getNewsCategoriesList();
    return res.json({
      categories,
      meta: {
        provider: 'free-crypto-news',
        cached,
        fallback
      }
    });
  } catch (error) {
    return next(error);
  }
}

export async function getFearGreed(_req: Request, res: Response, next: NextFunction) {
  try {
    const result = await getFearGreedIndex();
    return res.json({
      value: result.value,
      label: result.label,
      classification_en: result.classification_en,
      updated_at: result.updated_at,
      meta: {
        provider: 'free-crypto-news',
        cached: result.cached,
        fallback: result.fallback
      }
    });
  } catch (error) {
    return next(error);
  }
}
