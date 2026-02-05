import { LruCache } from '../utils/lruCache.js';

export class ExternalProviderError extends Error {
  constructor(
    public readonly code: 'EXTERNAL_PROVIDER_UNAVAILABLE' | 'EXTERNAL_PROVIDER_TIMEOUT' = 'EXTERNAL_PROVIDER_UNAVAILABLE',
    message = 'External provider unavailable'
  ) {
    super(message);
    this.name = 'ExternalProviderError';
  }
}

type NewsItem = {
  id: string;
  title: string;
  source: string;
  url: string;
  published_at: string;
  assets?: string[];
  summary?: string;
};

type CacheMeta = { provider: string; cached: boolean; ttl_seconds: number };

const PROVIDER = 'free-crypto-news';
const BASE_URL = process.env.NEWS_PRIMARY_BASE_URL ?? 'https://news-crypto.vercel.app/api';
const TIMEOUT_MS = Number(process.env.NEWS_REQUEST_TIMEOUT_MS ?? 8000);
const NEWS_TTL_SECONDS = Number(process.env.NEWS_TTL_SECONDS ?? 60);
const FEAR_GREED_TTL_SECONDS = Number(process.env.FEAR_GREED_TTL_SECONDS ?? 300);
const CATEGORIES_TTL_SECONDS = Number(process.env.NEWS_CATEGORIES_TTL_SECONDS ?? 86400);

const newsCache = new LruCache<NewsItem[]>(100);
const categoriesCache = new LruCache<string[]>(10);
const fearGreedCache = new LruCache<{ value: number; label_pt: 'Medo' | 'Neutro' | 'Ganância'; label_en: 'Fear' | 'Neutral' | 'Greed'; updated_at: string }>(5);

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

function normalizeNewsItem(item: Record<string, unknown>, index: number): NewsItem {
  return {
    id: typeof item.id === 'string' ? item.id : `news-${index}-${String(item.url ?? '')}`,
    title: typeof item.title === 'string' ? item.title : 'Sem título',
    source: typeof item.source === 'string' ? item.source : 'unknown',
    url: typeof item.url === 'string' ? item.url : '',
    published_at: typeof item.published_at === 'string' ? item.published_at : new Date().toISOString(),
    assets: Array.isArray(item.assets) ? item.assets.filter((a): a is string => typeof a === 'string') : undefined,
    summary: typeof item.summary === 'string' ? item.summary : undefined
  };
}

export function resetNewsServiceState() {
  // no-op due LRU internal; tests rely on function existing.
}

export async function fetchNews(input: { limit: number; category?: string; query?: string; lang?: 'pt' | 'en' }) {
  const key = JSON.stringify(input);
  const cached = newsCache.get(key);
  if (cached) {
    return { items: cached, meta: { provider: PROVIDER, cached: true, ttl_seconds: NEWS_TTL_SECONDS } as CacheMeta };
  }

  const params = new URLSearchParams();
  params.set('limit', String(input.limit));
  if (input.category) params.set('category', input.category);
  if (input.query) params.set('q', input.query);
  if (input.lang) params.set('lang', input.lang);

  try {
    const payload = await fetchJson<{ items?: Record<string, unknown>[]; data?: Record<string, unknown>[] }>(`${BASE_URL}/news?${params.toString()}`);
    const rawItems = payload.items ?? payload.data ?? [];
    const items = rawItems.map(normalizeNewsItem);
    newsCache.set(key, items, NEWS_TTL_SECONDS * 1000);
    return { items, meta: { provider: PROVIDER, cached: false, ttl_seconds: NEWS_TTL_SECONDS } as CacheMeta };
  } catch (error) {
    if (cached) {
      return { items: cached, meta: { provider: PROVIDER, cached: true, ttl_seconds: NEWS_TTL_SECONDS } as CacheMeta };
    }
    throw error;
  }
}

export async function fetchNewsCategories() {
  const key = 'news-categories';
  const cached = categoriesCache.get(key);
  if (cached) {
    return { categories: cached, meta: { provider: PROVIDER, cached: true, ttl_seconds: CATEGORIES_TTL_SECONDS } as CacheMeta };
  }

  try {
    const payload = await fetchJson<{ categories?: string[] }>(`${BASE_URL}/news/categories`);
    const categories = (payload.categories ?? []).filter((i): i is string => typeof i === 'string');
    categoriesCache.set(key, categories, CATEGORIES_TTL_SECONDS * 1000);
    return { categories, meta: { provider: PROVIDER, cached: false, ttl_seconds: CATEGORIES_TTL_SECONDS } as CacheMeta };
  } catch (error) {
    if (cached) {
      return { categories: cached, meta: { provider: PROVIDER, cached: true, ttl_seconds: CATEGORIES_TTL_SECONDS } as CacheMeta };
    }
    throw error;
  }
}

function translateFearGreed(classification: string): { label_pt: 'Medo' | 'Neutro' | 'Ganância'; label_en: 'Fear' | 'Neutral' | 'Greed' } {
  const value = classification.toLowerCase();
  if (value.includes('greed')) return { label_pt: 'Ganância', label_en: 'Greed' };
  if (value.includes('fear')) return { label_pt: 'Medo', label_en: 'Fear' };
  return { label_pt: 'Neutro', label_en: 'Neutral' };
}

export async function fetchFearGreed() {
  const key = 'fear-greed';
  const cached = fearGreedCache.get(key);
  if (cached) {
    return { ...cached, meta: { provider: PROVIDER, cached: true, ttl_seconds: FEAR_GREED_TTL_SECONDS } as CacheMeta };
  }

  try {
    const payload = await fetchJson<{ value?: number; classification?: string; updated_at?: string }>(`${BASE_URL}/market/fear-greed`);
    const labels = translateFearGreed(payload.classification ?? 'neutral');
    const normalized = {
      value: Number(payload.value ?? 50),
      label_pt: labels.label_pt,
      label_en: labels.label_en,
      updated_at: payload.updated_at ?? new Date().toISOString()
    };
    fearGreedCache.set(key, normalized, FEAR_GREED_TTL_SECONDS * 1000);
    return { ...normalized, meta: { provider: PROVIDER, cached: false, ttl_seconds: FEAR_GREED_TTL_SECONDS } as CacheMeta };
  } catch (error) {
    throw error;
  }
}

