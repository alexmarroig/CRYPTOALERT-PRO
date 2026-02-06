import type { Request, Response } from 'express';
import { z } from 'zod';
import { ExternalProviderError, fetchFearGreed, fetchNews, fetchNewsCategories } from '../services/newsService.js';

const newsQuerySchema = z.object({
  limit: z.string().optional(),
  category: z.string().optional(),
  q: z.string().optional(),
  assets: z.string().optional(),
  lang: z.enum(['pt', 'en']).optional()
});

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function parseLimit(value?: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_LIMIT);
}

function providerFailure(error: unknown, message: string) {
  const code = error instanceof ExternalProviderError ? error.code : 'EXTERNAL_PROVIDER_UNAVAILABLE';
  return {
    status: 503,
    payload: {
      error: {
        code,
        message,
        details: { hint: 'Provider indisponível no momento. Tente novamente em instantes.' }
      }
    }
  };
}

function parseAssets(value?: string) {
  if (!value) return undefined;
  return value
    .split(',')
    .map((asset) => asset.trim().toUpperCase())
    .filter((asset) => asset.length > 0);
}

export async function getNews(req: Request, res: Response) {
  const parse = newsQuerySchema.safeParse(req.query);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.flatten() });
  }

  try {
    const result = await fetchNews({
      limit: parseLimit(parse.data.limit),
      category: parse.data.category,
      query: parse.data.q,
      lang: parse.data.lang,
      assets: parseAssets(parse.data.assets)
    });

    return res.json({
      items: result.items,
      meta: result.meta
    });
  } catch (error) {
    const lang = parse.data.lang ?? 'pt';
    const mapped = providerFailure(error, lang === 'pt' ? 'Não foi possível carregar notícias agora.' : 'Unable to load news right now.');
    return res.status(mapped.status).json(mapped.payload);
  }
}

export async function getNewsCategories(_req: Request, res: Response) {
  try {
    const result = await fetchNewsCategories();
    return res.json({ categories: result.categories, meta: result.meta });
  } catch (error) {
    const mapped = providerFailure(error, 'Não foi possível carregar categorias agora.');
    return res.status(mapped.status).json(mapped.payload);
  }
}

export async function getFearGreed(_req: Request, res: Response) {
  try {
    const result = await fetchFearGreed();
    return res.json({ ...result, meta: result.meta });
  } catch (error) {
    const mapped = providerFailure(error, 'Não foi possível carregar o indicador de mercado agora.');
    return res.status(mapped.status).json(mapped.payload);
  }
}
