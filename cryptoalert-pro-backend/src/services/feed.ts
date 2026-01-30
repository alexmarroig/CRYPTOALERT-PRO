import fetch from 'node-fetch';

type FearGreedIndex = {
  value: number;
  valueClassification: string;
  timestamp: string;
  source: string;
};

type HeadlineItem = {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
};

type FeedPayload = {
  fearGreed: FearGreedIndex | null;
  headlines: HeadlineItem[];
  updatedAt: string;
};

type CacheEntry = {
  data: FeedPayload;
  expiresAt: number;
};

const DEFAULT_FEAR_GREED_URL = 'https://api.alternative.me/fng/?limit=1&format=json';
const DEFAULT_CRYPTOPANIC_URL = 'https://cryptopanic.com/api/v1/posts/';
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

export class FeedService {
  private cache: CacheEntry | null = null;

  async getFeed(): Promise<FeedPayload> {
    const now = Date.now();
    if (this.cache && now < this.cache.expiresAt) {
      return this.cache.data;
    }

    const [fearGreed, headlines] = await Promise.all([
      this.fetchFearGreed(),
      this.fetchHeadlines()
    ]);

    const data: FeedPayload = {
      fearGreed,
      headlines,
      updatedAt: new Date().toISOString()
    };

    this.cache = {
      data,
      expiresAt: now + this.cacheTtlMs
    };

    return data;
  }

  private get cacheTtlMs() {
    const ttl = Number(process.env.FEED_CACHE_TTL_MS ?? DEFAULT_CACHE_TTL_MS);
    return Number.isFinite(ttl) && ttl > 0 ? ttl : DEFAULT_CACHE_TTL_MS;
  }

  private async fetchFearGreed(): Promise<FearGreedIndex | null> {
    const url = process.env.FEAR_GREED_API_URL ?? DEFAULT_FEAR_GREED_URL;
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    const payload = await response.json() as {
      data?: Array<{ value?: string; value_classification?: string; timestamp?: string }>;
    };
    const item = payload.data?.[0];
    if (!item?.value || !item.value_classification || !item.timestamp) {
      return null;
    }

    const timestampMs = Number(item.timestamp) * 1000;
    return {
      value: Number(item.value),
      valueClassification: item.value_classification,
      timestamp: Number.isFinite(timestampMs) ? new Date(timestampMs).toISOString() : new Date().toISOString(),
      source: 'alternative.me'
    };
  }

  private async fetchHeadlines(): Promise<HeadlineItem[]> {
    const token = process.env.CRYPTOPANIC_TOKEN;
    if (!token) {
      return [];
    }
    const baseUrl = process.env.CRYPTOPANIC_URL ?? DEFAULT_CRYPTOPANIC_URL;
    const url = new URL(baseUrl);
    url.searchParams.set('auth_token', token);
    url.searchParams.set('public', 'true');

    const response = await fetch(url.toString());
    if (!response.ok) {
      return [];
    }
    const payload = await response.json() as {
      results?: Array<{
        title?: string;
        url?: string;
        published_at?: string;
        source?: { title?: string };
      }>;
    };

    return (payload.results ?? [])
      .filter((item) => item.title && item.url)
      .map((item) => ({
        title: item.title ?? '',
        url: item.url ?? '',
        source: item.source?.title ?? 'unknown',
        publishedAt: item.published_at ?? new Date().toISOString()
      }));
  }
}
