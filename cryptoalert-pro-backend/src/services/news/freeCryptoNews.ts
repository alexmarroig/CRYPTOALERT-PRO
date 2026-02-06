import { LruCache } from '../../utils/lruCache.js';
import { ExternalProviderError } from '../newsService.js';

export type NormalizedNewsItem = {
  id: string;
  title: string;
  source: string;
  url: string;
  published_at: string;
  assets?: string[];
  summary?: string;
  sentiment?: string;
};

export type NewsMeta = {
  provider: string;
  cached: boolean;
  ttl_seconds: number;
  degraded: boolean;
  fetched_at: string;
  note?: string;
};

type CachedNews = { items: NormalizedNewsItem[]; meta: NewsMeta };

const PROVIDER = 'free-crypto-news';
const BASE_URL = process.env.NEWS_PRIMARY_BASE_URL ?? 'https://news-crypto.vercel.app/api';
const TIMEOUT_MS = Number(process.env.NEWS_REQUEST_TIMEOUT_MS ?? 8000);
const NEWS_TTL_SECONDS = Number(process.env.NEWS_TTL_SECONDS ?? 120);
const CATEGORIES_TTL_SECONDS = Number(process.env.NEWS_CATEGORIES_TTL_SECONDS ?? 86400);
const FALLBACK_TTL_SECONDS = Number(process.env.NEWS_FALLBACK_TTL_SECONDS ?? 3600);

const newsCache = new LruCache<CachedNews>(200);
const fallbackCache = new LruCache<CachedNews>(200);
const categoriesCache = new LruCache<string[]>(10);

const SUPPORTED_CATEGORIES = ['market', 'defi', 'bitcoin', 'ethereum', 'altcoins', 'nft', 'regulation'];

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new ExternalProviderError('EXTERNAL_PROVIDER_UNAVAILABLE', `Provider status ${response.status}`);
    }
    return await response.json() as T;
  } catch (error) {
    if (error instanceof ExternalProviderError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ExternalProviderError('EXTERNAL_PROVIDER_TIMEOUT', 'Provider timeout');
    }
    throw new ExternalProviderError('EXTERNAL_PROVIDER_UNAVAILABLE', 'Provider unavailable');
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeAssets(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const normalized = raw
    .filter((item) => typeof item === 'string')
    .map((item) => item.toUpperCase().trim())
    .filter((item) => item.length > 0);
  return normalized.length ? normalized : undefined;
}

function normalizeItem(item: Record<string, unknown>, index: number): NormalizedNewsItem {
  const published = typeof item.published_at === 'string'
    ? item.published_at
    : typeof item.date === 'string'
      ? item.date
      : new Date().toISOString();

  return {
    id: typeof item.id === 'string' ? item.id : `news-${index}-${String(item.url ?? '')}`,
    title: typeof item.title === 'string' ? item.title : 'Sem título',
    source: typeof item.source === 'string' ? item.source : String(item.site ?? 'unknown'),
    url: typeof item.url === 'string' ? item.url : String(item.link ?? ''),
    published_at: new Date(published).toISOString(),
    assets: normalizeAssets(item.assets ?? item.tickers),
    summary: typeof item.summary === 'string' ? item.summary : typeof item.description === 'string' ? item.description : undefined,
    sentiment: typeof item.sentiment === 'string' ? item.sentiment : undefined
  };
}

export async function fetchFreeCryptoNews(input: {
  limit: number;
  category?: string;
  query?: string;
  lang?: 'pt' | 'en';
  assets?: string[];
}): Promise<{ items: NormalizedNewsItem[]; meta: NewsMeta }> {
  const key = JSON.stringify(input);
  const cached = newsCache.get(key);
  if (cached) {
    return {
      items: cached.items,
      meta: { ...cached.meta, cached: true }
    };
  }

  const params = new URLSearchParams();
  params.set('limit', String(input.limit));
  if (input.category) params.set('category', input.category);
  if (input.query) params.set('q', input.query);
  if (input.lang) params.set('lang', input.lang);

  const fetchedAt = new Date().toISOString();
  try {
    const payload = await fetchJson<{ items?: Record<string, unknown>[]; data?: Record<string, unknown>[] }>(`${BASE_URL}/news?${params.toString()}`);
    const rawItems = payload.items ?? payload.data ?? [];
    let items = rawItems.map(normalizeItem);
    if (input.assets && input.assets.length > 0) {
      const assets = input.assets.map((asset) => asset.toUpperCase());
      items = items.filter((item) => item.assets?.some((asset) => assets.includes(asset)));
    }
    const meta: NewsMeta = {
      provider: PROVIDER,
      cached: false,
      ttl_seconds: NEWS_TTL_SECONDS,
      degraded: false,
      fetched_at: fetchedAt
    };
    const cachedPayload = { items, meta };
    newsCache.set(key, cachedPayload, NEWS_TTL_SECONDS * 1000);
    fallbackCache.set(key, cachedPayload, FALLBACK_TTL_SECONDS * 1000);
    return cachedPayload;
  } catch (error) {
    const fallback = fallbackCache.get(key);
    if (fallback) {
      return {
        items: fallback.items,
        meta: { ...fallback.meta, degraded: true, cached: true }
      };
    }
    throw error;
  }
}

export async function fetchFreeCryptoNewsCategories() {
  const cached = categoriesCache.get('categories');
  if (cached) {
    return {
      categories: cached,
      meta: {
        provider: PROVIDER,
        cached: true,
        ttl_seconds: CATEGORIES_TTL_SECONDS,
        degraded: false,
        fetched_at: new Date().toISOString()
      } satisfies NewsMeta
    };
  }

  try {
    const payload = await fetchJson<{ categories?: string[] }>(`${BASE_URL}/news/categories`);
    const categories = (payload.categories ?? []).filter((item): item is string => typeof item === 'string');
    const finalCategories = categories.length ? categories : SUPPORTED_CATEGORIES;
    categoriesCache.set('categories', finalCategories, CATEGORIES_TTL_SECONDS * 1000);
    return {
      categories: finalCategories,
      meta: {
        provider: PROVIDER,
        cached: false,
        ttl_seconds: CATEGORIES_TTL_SECONDS,
        degraded: false,
        fetched_at: new Date().toISOString()
      } satisfies NewsMeta
    };
  } catch (error) {
    if (cached) {
      return {
        categories: cached,
        meta: {
          provider: PROVIDER,
          cached: true,
          ttl_seconds: CATEGORIES_TTL_SECONDS,
          degraded: true,
          fetched_at: new Date().toISOString()
        } satisfies NewsMeta
      };
    }
    return {
      categories: SUPPORTED_CATEGORIES,
      meta: {
        provider: PROVIDER,
        cached: false,
        ttl_seconds: CATEGORIES_TTL_SECONDS,
        degraded: true,
        fetched_at: new Date().toISOString(),
        note: 'Lista de fallback local'
      } satisfies NewsMeta
    };
  }
}
