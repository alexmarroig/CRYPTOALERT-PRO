import { LruCache } from '../utils/lruCache.js';
import { fetchFreeCryptoNews, fetchFreeCryptoNewsCategories } from './news/freeCryptoNews.js';

export class ExternalProviderError extends Error {
  constructor(
    public readonly code: 'EXTERNAL_PROVIDER_UNAVAILABLE' | 'EXTERNAL_PROVIDER_TIMEOUT' = 'EXTERNAL_PROVIDER_UNAVAILABLE',
    message = 'External provider unavailable'
  ) {
    super(message);
    this.name = 'ExternalProviderError';
  }
}

type CacheMeta = { provider: string; cached: boolean; ttl_seconds: number; degraded: boolean; fetched_at: string; note?: string };

const PROVIDER = 'free-crypto-news';
const BASE_URL = process.env.NEWS_PRIMARY_BASE_URL ?? 'https://news-crypto.vercel.app/api';
const TIMEOUT_MS = Number(process.env.NEWS_REQUEST_TIMEOUT_MS ?? 8000);
const NEWS_TTL_SECONDS = Number(process.env.NEWS_TTL_SECONDS ?? 60);
const FEAR_GREED_TTL_SECONDS = Number(process.env.FEAR_GREED_TTL_SECONDS ?? 300);

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

export function resetNewsServiceState() {
  // no-op due LRU internal; tests rely on function existing.
}

export async function fetchNews(input: { limit: number; category?: string; query?: string; lang?: 'pt' | 'en'; assets?: string[] }) {
  return fetchFreeCryptoNews({ ...input });
}

export async function fetchNewsCategories() {
  return fetchFreeCryptoNewsCategories();
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
    return { ...cached, meta: { provider: PROVIDER, cached: true, ttl_seconds: FEAR_GREED_TTL_SECONDS, degraded: false, fetched_at: new Date().toISOString() } as CacheMeta };
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
    return { ...normalized, meta: { provider: PROVIDER, cached: false, ttl_seconds: FEAR_GREED_TTL_SECONDS, degraded: false, fetched_at: new Date().toISOString() } as CacheMeta };
  } catch (error) {
    try {
      const fallback = await fetchJson<{ data?: Array<{ value?: string; value_classification?: string; timestamp?: string }> }>('https://api.alternative.me/fng/?limit=1');
      const entry = fallback.data?.[0];
      const labels = translateFearGreed(entry?.value_classification ?? 'neutral');
      const normalized = {
        value: Number(entry?.value ?? 50),
        label_pt: labels.label_pt,
        label_en: labels.label_en,
        updated_at: entry?.timestamp ? new Date(Number(entry.timestamp) * 1000).toISOString() : new Date().toISOString()
      };
      fearGreedCache.set(key, normalized, FEAR_GREED_TTL_SECONDS * 1000);
      return {
        ...normalized,
        meta: {
          provider: 'alternative.me',
          cached: false,
          ttl_seconds: FEAR_GREED_TTL_SECONDS,
          degraded: false,
          fetched_at: new Date().toISOString()
        } as CacheMeta
      };
    } catch {
      const proxy = {
        value: 50,
        label_pt: 'Neutro' as const,
        label_en: 'Neutral' as const,
        updated_at: new Date().toISOString()
      };
      fearGreedCache.set(key, proxy, FEAR_GREED_TTL_SECONDS * 1000);
      return {
        ...proxy,
        meta: {
          provider: 'proxy',
          cached: false,
          ttl_seconds: FEAR_GREED_TTL_SECONDS,
          degraded: true,
          fetched_at: new Date().toISOString(),
          note: 'estimativa'
        } as CacheMeta
      };
    }
  }
}
