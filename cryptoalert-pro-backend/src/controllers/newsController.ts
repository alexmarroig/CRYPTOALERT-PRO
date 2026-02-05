import type { Request, Response } from 'express';
import { z } from 'zod';
import { ExternalProviderError, fetchFearGreed, fetchNews, fetchNewsCategories } from '../services/newsService.js';

const newsQuerySchema = z.object({
  limit: z.string().optional(),
  category: z.string().optional(),
  q: z.string().optional(),
  lang: z.enum(['pt', 'en']).optional()
});

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

function mapExternalError(error: unknown, fallbackMessage: string) {
  if (error instanceof ExternalProviderError) {
    return {
      status: 502,
      error: {
        code: error.code,
        message: fallbackMessage
      }
    };
  }

  return {
    status: 502,
    error: {
      code: 'EXTERNAL_PROVIDER_UNAVAILABLE',
      message: fallbackMessage
    }
  };
}

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

export async function getNews(req: Request, res: Response) {
  const parse = newsQuerySchema.safeParse(req.query);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.flatten() });
  }

  const limit = parseLimit(parse.data.limit);
  const category = sanitizeText(parse.data.category, 40);
  const query = sanitizeText(parse.data.q, 80);

  try {
    const { items, cached } = await fetchNews({
      limit,
      category,
      query,
      lang: parse.data.lang
    });

    return res.json({
      items,
      meta: {
        provider: 'free-crypto-news',
        cached
      }
    });
  } catch (error) {
    const mapped = mapExternalError(error, 'Falha ao consultar notícias externas');
    return res.status(mapped.status).json(mapped);
  }
}

export async function getNewsCategories(_req: Request, res: Response) {
  try {
    const { categories, cached } = await fetchNewsCategories();
    return res.json({
      categories,
      meta: {
        provider: 'free-crypto-news',
        cached
      }
    });
  } catch (error) {
    const mapped = mapExternalError(error, 'Falha ao consultar categorias externas');
    return res.status(mapped.status).json(mapped);
  }
}

export async function getFearGreed(req: Request, res: Response) {
  try {
    const result = await fetchFearGreed();
    return res.json({
      value: result.value,
      label: result.label,
      classification_en: result.classification_en,
      updated_at: result.updated_at,
      meta: {
        provider: 'free-crypto-news',
        cached: result.cached
      }
    });
  } catch (error) {
    const mapped = mapExternalError(error, 'Falha ao consultar índice fear-greed externo');
    return res.status(mapped.status).json(mapped);
  }
}
