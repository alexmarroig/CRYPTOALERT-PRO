import { LruCache } from '../utils/lruCache.js';

export class ExternalProviderError extends Error {
  constructor(
    public readonly errorCode: 'UPSTREAM_TIMEOUT' | 'UPSTREAM_UNAVAILABLE',
    message: string,
    public readonly retryable: boolean
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
  assets: string[];
  summary: string | null;
};

type NewsResult = {
  items: NewsItem[];
  cached: boolean;
  degraded: boolean;
  provider: string;
};

type FearGreedResult = {
  value: number;
  label: 'Medo' | 'Neutro' | 'Ganância';
  classification_en: 'Fear' | 'Neutral' | 'Greed';
  updated_at: string;
  cached: boolean;
  degraded: boolean;
  provider: string;
};

type Provider = { name: string; baseUrl: string };

const PROVIDERS: Provider[] = [
  {
    name: 'free-crypto-news-primary',
    baseUrl: process.env.NEWS_PRIMARY_BASE_URL ?? 'https://news-crypto.vercel.app/api'
  },
  {
    name: 'free-crypto-news-secondary',
    baseUrl: process.env.NEWS_SECONDARY_BASE_URL ?? 'https://news-crypto-backup.vercel.app/api'
  }
];
const REQUEST_TIMEOUT_MS = Number(process.env.NEWS_REQUEST_TIMEOUT_MS ?? 5000);
const newsCache = new LruCache<NewsItem[]>(100);
const categoriesCache = new LruCache<string[]>(5);
const fearGreedCache = new LruCache<Omit<FearGreedResult, 'cached' | 'degraded' | 'provider'>>(5);
const staleNewsCache = new Map<string, NewsItem[]>();
const staleCategoriesCache = new Map<string, string[]>();
const staleFearGreedCache = new Map<string, Omit<FearGreedResult, 'cached' | 'degraded' | 'provider'>>();

const NEWS_TTL_MS = 60 * 1000;
const FEAR_GREED_TTL_MS = 5 * 60 * 1000;
const CATEGORIES_TTL_MS = 24 * 60 * 60 * 1000;

type ProviderMetrics = {
  calls: number;
  errors: number;
  totalLatencyMs: number;
};

const providerMetrics = new Map<string, ProviderMetrics>();
let cacheHits = 0;
let cacheMisses = 0;

function getProviderMetrics(provider: string): ProviderMetrics {
  const current = providerMetrics.get(provider);
  if (current) return current;
  const initial = { calls: 0, errors: 0, totalLatencyMs: 0 };
  providerMetrics.set(provider, initial);
  return initial;
}

function recordCacheHit(hit: boolean) {
  if (hit) {
    cacheHits += 1;
    return;
  }
  cacheMisses += 1;
}

function recordProviderSuccess(provider: string, latencyMs: number) {
  const metrics = getProviderMetrics(provider);
  metrics.calls += 1;
  metrics.totalLatencyMs += latencyMs;
}

function recordProviderError(provider: string, latencyMs: number) {
  const metrics = getProviderMetrics(provider);
  metrics.calls += 1;
  metrics.errors += 1;
  metrics.totalLatencyMs += latencyMs;
}

export function getNewsMetricsSnapshot() {
  const providers = [...providerMetrics.entries()].reduce<Record<string, {
    average_latency_ms: number;
    error_rate: number;
    calls: number;
  }>>((acc, [provider, metrics]) => {
    const averageLatency = metrics.calls > 0 ? metrics.totalLatencyMs / metrics.calls : 0;
    const errorRate = metrics.calls > 0 ? metrics.errors / metrics.calls : 0;
    acc[provider] = {
      average_latency_ms: Number(averageLatency.toFixed(2)),
      error_rate: Number(errorRate.toFixed(4)),
      calls: metrics.calls
    };
    return acc;
  }, {});

  const totalCacheLookups = cacheHits + cacheMisses;

  return {
    providers,
    cache: {
      hit_ratio: totalCacheLookups > 0 ? Number((cacheHits / totalCacheLookups).toFixed(4)) : 0,
      hits: cacheHits,
      misses: cacheMisses
    }
  };
}

export function resetNewsServiceState() {
  providerMetrics.clear();
  cacheHits = 0;
  cacheMisses = 0;
  staleNewsCache.clear();
  staleCategoriesCache.clear();
  staleFearGreedCache.clear();
}

async function fetchProviderJson<T>(provider: Provider, endpoint: string, params?: URLSearchParams): Promise<T> {
  const url = new URL(`${provider.baseUrl}${endpoint}`);
  if (params) {
    url.search = params.toString();
  }

  const controller = new AbortController();
  const startedAt = Date.now();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url.toString(), { signal: controller.signal });
    const latency = Date.now() - startedAt;
    if (!response.ok) {
      recordProviderError(provider.name, latency);
      throw new ExternalProviderError('UPSTREAM_UNAVAILABLE', `Provider ${provider.name} returned ${response.status}`, true);
    }
    recordProviderSuccess(provider.name, latency);
    return await response.json() as T;
  } catch (error) {
    const latency = Date.now() - startedAt;
    if (error instanceof ExternalProviderError) {
      throw error;
    }
    recordProviderError(provider.name, latency);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ExternalProviderError('UPSTREAM_TIMEOUT', `Provider ${provider.name} timed out`, true);
    }
    throw new ExternalProviderError('UPSTREAM_UNAVAILABLE', `Provider ${provider.name} unavailable`, true);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchWithFallback<T>(endpoint: string, params?: URLSearchParams) {
  let lastError: ExternalProviderError | null = null;
  for (const provider of PROVIDERS) {
    try {
      const payload = await fetchProviderJson<T>(provider, endpoint, params);
      return { payload, provider: provider.name };
    } catch (error) {
      if (error instanceof ExternalProviderError) {
        lastError = error;
        continue;
      }
      lastError = new ExternalProviderError('UPSTREAM_UNAVAILABLE', 'Unexpected upstream failure', true);
    }
  }

  throw lastError ?? new ExternalProviderError('UPSTREAM_UNAVAILABLE', 'No providers available', true);
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
  recordCacheHit(Boolean(cached));
  if (cached) {
    return { items: cached, cached: true, degraded: false, provider: 'cache' };
  }

  const params = new URLSearchParams();
  if (query) {
    params.set('q', query);
  } else {
    params.set('limit', String(limit));
    if (category) {
      params.set('category', category);
    }
  }
  if (lang) {
    params.set('lang', lang);
  }

  try {
    const endpoint = query ? '/search' : '/news';
    const { payload, provider } = await fetchWithFallback<{ data?: Record<string, unknown>[]; items?: Record<string, unknown>[] }>(endpoint, params);
    const rawItems = payload.items ?? payload.data ?? [];
    const items = rawItems.map((item, index) => normalizeNewsItem(item, index));

    newsCache.set(key, items, NEWS_TTL_MS);
    staleNewsCache.set(key, items);
    return { items, cached: false, degraded: false, provider };
  } catch (error) {
    const stale = staleNewsCache.get(key);
    if (stale) {
      return { items: stale, cached: true, degraded: true, provider: 'stale-cache' };
    }
    throw error;
  }
}

export async function fetchNewsCategories(): Promise<{ categories: string[]; cached: boolean; degraded: boolean; provider: string }> {
  const cached = categoriesCache.get('categories');
  recordCacheHit(Boolean(cached));
  if (cached) {
    return { categories: cached, cached: true, degraded: false, provider: 'cache' };
  }

  try {
    const { payload, provider } = await fetchWithFallback<{ data?: string[]; categories?: string[] }>('/news/categories');
    const categories = payload.categories ?? payload.data ?? [];

    categoriesCache.set('categories', categories, CATEGORIES_TTL_MS);
    staleCategoriesCache.set('categories', categories);
    return { categories, cached: false, degraded: false, provider };
  } catch (error) {
    const stale = staleCategoriesCache.get('categories');
    if (stale) {
      return { categories: stale, cached: true, degraded: true, provider: 'stale-cache' };
    }
    throw error;
  }
}

export async function fetchFearGreed(): Promise<FearGreedResult> {
  const cached = fearGreedCache.get('fear-greed');
  recordCacheHit(Boolean(cached));
  if (cached) {
    return { ...cached, cached: true, degraded: false, provider: 'cache' };
  }

  try {
    const { payload, provider } = await fetchWithFallback<{
      data?: { value?: number | string; value_classification?: string; timestamp?: string; updated_at?: string };
    }>('/market/fear-greed');
    const data = payload.data ?? {};
    const classification = typeof data.value_classification === 'string' ? data.value_classification : 'Neutral';
    const { label, classification_en } = normalizeClassification(classification);
    const value = Number(data.value ?? 0);
    const updatedAt = typeof data.updated_at === 'string'
      ? data.updated_at
      : typeof data.timestamp === 'string'
        ? new Date(Number(data.timestamp) * 1000).toISOString()
        : new Date().toISOString();

    const result: Omit<FearGreedResult, 'cached' | 'degraded' | 'provider'> = {
      value: Number.isFinite(value) ? value : 0,
      label,
      classification_en,
      updated_at: updatedAt
    };

    fearGreedCache.set('fear-greed', result, FEAR_GREED_TTL_MS);
    staleFearGreedCache.set('fear-greed', result);
    return { ...result, cached: false, degraded: false, provider };
  } catch (error) {
    const stale = staleFearGreedCache.get('fear-greed');
    if (stale) {
      return { ...stale, cached: true, degraded: true, provider: 'stale-cache' };
    }
    throw error;
  }
}
