import { LruCache } from '../utils/lruCache.js';
import { instrumentDependency } from '../observability/telemetry.js';

type NewsItem = {
  id: string;
  title: string;
  source: string;
  url: string;
  published_at: string;
  assets: string[];
  summary: string | null;
};

type NewsResult = {
  items: NewsItem[];
  cached: boolean;
};

type FearGreedResult = {
  value: number;
  label: 'Medo' | 'Neutro' | 'Ganância';
  classification_en: 'Fear' | 'Neutral' | 'Greed';
  updated_at: string;
  cached: boolean;
};

const NEWS_BASE_URL = 'https://news-crypto.vercel.app/api';
const NEWS_FALLBACK_BASE_URL = process.env.NEWS_FALLBACK_BASE_URL;
const newsCache = new LruCache<NewsItem[]>(100);
const categoriesCache = new LruCache<string[]>(5);
const fearGreedCache = new LruCache<Omit<FearGreedResult, 'cached'>>(5);

const NEWS_TTL_MS = 60 * 1000;
const FEAR_GREED_TTL_MS = 5 * 60 * 1000;
const CATEGORIES_TTL_MS = 24 * 60 * 60 * 1000;
const EXTERNAL_TIMEOUT_MS = 8_000;

export class ExternalProviderError extends Error {
  constructor(
    message: string,
    readonly code: 'EXTERNAL_PROVIDER_UNAVAILABLE' | 'EXTERNAL_PROVIDER_TIMEOUT' = 'EXTERNAL_PROVIDER_UNAVAILABLE'
  ) {
    super(message);
    this.name = 'ExternalProviderError';
  }
}

async function fetchJsonWithTimeout<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EXTERNAL_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new ExternalProviderError(`Provider returned status ${response.status}`);
    }
    return await response.json() as T;
  } catch (error) {
    if (error instanceof ExternalProviderError) {
      throw error;
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ExternalProviderError('Provider request timeout', 'EXTERNAL_PROVIDER_TIMEOUT');
    }
    throw new ExternalProviderError('Provider request failed');
  } finally {
    clearTimeout(timeout);
  }
}

function getFallbackUrl(path: string): string | null {
  if (!NEWS_FALLBACK_BASE_URL) return null;
  return `${NEWS_FALLBACK_BASE_URL.replace(/\/$/, '')}${path}`;
}

function normalizeAssets(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          const candidate = (item as { symbol?: string; code?: string; name?: string }).symbol
            ?? (item as { code?: string }).code
            ?? (item as { name?: string }).name;
          return candidate ?? null;
        }
        return null;
      })
      .filter((item): item is string => Boolean(item));
  }
  return [];
}

function normalizeNewsItem(item: Record<string, unknown>, index: number): NewsItem {
  const url = typeof item.url === 'string' ? item.url : '';
  const id = typeof item.id === 'string' ? item.id : `${url}-${index}`;
  const publishedAt = typeof item.published_at === 'string'
    ? item.published_at
    : typeof item.publishedAt === 'string'
      ? item.publishedAt
      : new Date().toISOString();

  return {
    id,
    title: typeof item.title === 'string' ? item.title : 'Notícia',
    source: typeof item.source === 'string' ? item.source : 'unknown',
    url,
    published_at: publishedAt,
    assets: normalizeAssets(item.assets ?? item.coins ?? item.related_coins),
    summary: typeof item.summary === 'string'
      ? item.summary
      : typeof item.description === 'string'
        ? item.description
        : null
  };
}

function normalizeClassification(classification: string): { label: 'Medo' | 'Neutro' | 'Ganância'; classification_en: 'Fear' | 'Neutral' | 'Greed' } {
  const value = classification.toLowerCase();
  if (value.includes('fear')) {
    return { label: 'Medo', classification_en: 'Fear' as const };
  }
  if (value.includes('greed')) {
    return { label: 'Ganância', classification_en: 'Greed' as const };
  }
  return { label: 'Neutro', classification_en: 'Neutral' as const };
}

export async function fetchNews({
  limit,
  category,
  query,
  lang
}: {
  limit: number;
  category?: string;
  query?: string;
  lang?: 'pt' | 'en';
}): Promise<NewsResult> {
  const key = JSON.stringify({ limit, category, query, lang });
  const cached = newsCache.get(key);
  if (cached) {
    return { items: cached, cached: true };
  }

  const url = new URL(query ? `${NEWS_BASE_URL}/search` : `${NEWS_BASE_URL}/news`);
  if (query) {
    url.searchParams.set('q', query);
  } else {
    url.searchParams.set('limit', String(limit));
    if (category) {
      url.searchParams.set('category', category);
    }
  }
  if (lang) {
    url.searchParams.set('lang', lang);
  }

  const response = await instrumentDependency('news_provider', query ? 'search' : 'news', () => fetch(url.toString()));
  if (!response.ok) {
    throw new Error('Failed to fetch news');
  let payload: { data?: Record<string, unknown>[]; items?: Record<string, unknown>[] };
  try {
    payload = await fetchJsonWithTimeout(url.toString());
  } catch {
    const fallbackUrl = getFallbackUrl(query ? '/search' : '/news');
    if (!fallbackUrl) {
      throw new ExternalProviderError('Failed to fetch news');
    }

    const fallback = new URL(fallbackUrl);
    for (const [name, value] of url.searchParams.entries()) {
      fallback.searchParams.set(name, value);
    }
    payload = await fetchJsonWithTimeout(fallback.toString());
  }

  const rawItems = payload.items ?? payload.data ?? [];
  const items = rawItems.map((item, index) => normalizeNewsItem(item, index));

  newsCache.set(key, items, NEWS_TTL_MS);
  return { items, cached: false };
}

export async function fetchNewsCategories(): Promise<{ categories: string[]; cached: boolean }> {
  const cached = categoriesCache.get('categories');
  if (cached) {
    return { categories: cached, cached: true };
  }

  const response = await instrumentDependency('news_provider', 'categories', () => fetch(`${NEWS_BASE_URL}/news/categories`));
  if (!response.ok) {
    throw new Error('Failed to fetch categories');
  let payload: { data?: string[]; categories?: string[] };
  try {
    payload = await fetchJsonWithTimeout(`${NEWS_BASE_URL}/news/categories`);
  } catch {
    const fallbackUrl = getFallbackUrl('/news/categories');
    if (!fallbackUrl) {
      throw new ExternalProviderError('Failed to fetch categories');
    }
    payload = await fetchJsonWithTimeout(fallbackUrl);
  }

  const categories = payload.categories ?? payload.data ?? [];

  categoriesCache.set('categories', categories, CATEGORIES_TTL_MS);
  return { categories, cached: false };
}

export async function fetchFearGreed(): Promise<FearGreedResult> {
  const cached = fearGreedCache.get('fear-greed');
  if (cached) {
    return { ...cached, cached: true };
  }

  const response = await instrumentDependency('news_provider', 'fear_greed', () => fetch(`${NEWS_BASE_URL}/market/fear-greed`));
  if (!response.ok) {
    throw new Error('Failed to fetch fear/greed');
  }
  const payload = await response.json() as {
  let payload: {
    data?: { value?: number | string; value_classification?: string; timestamp?: string; updated_at?: string };
  };
  try {
    payload = await fetchJsonWithTimeout(`${NEWS_BASE_URL}/market/fear-greed`);
  } catch {
    const fallbackUrl = getFallbackUrl('/market/fear-greed');
    if (!fallbackUrl) {
      throw new ExternalProviderError('Failed to fetch fear/greed');
    }
    payload = await fetchJsonWithTimeout(fallbackUrl);
  }

  const data = payload.data ?? {};
  const classification = typeof data.value_classification === 'string' ? data.value_classification : 'Neutral';
  const { label, classification_en } = normalizeClassification(classification);
  const value = Number(data.value ?? 0);
  const updatedAt = typeof data.updated_at === 'string'
    ? data.updated_at
    : typeof data.timestamp === 'string'
      ? new Date(Number(data.timestamp) * 1000).toISOString()
      : new Date().toISOString();

  const result: Omit<FearGreedResult, 'cached'> = {
    value: Number.isFinite(value) ? value : 0,
    label,
    classification_en,
    updated_at: updatedAt
  };

  fearGreedCache.set('fear-greed', result, FEAR_GREED_TTL_MS);
  return { ...result, cached: false };
}
