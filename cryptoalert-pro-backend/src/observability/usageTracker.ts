import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

type UsageKey = {
  date: string;
  route: string;
};

type UsageBucket = {
  requests: number;
  errors: number;
  uniqueUsers: Set<string>;
};

const usageMap = new Map<string, UsageBucket>();
const userLastSeenCache = new Map<string, number>();
const FLUSH_INTERVAL_MS = 60_000;
const USER_SEEN_TTL_MS = 60 * 60 * 1000;

let lastFlush = Date.now();

function keyFor(key: UsageKey) {
  return `${key.date}:${key.route}`;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export async function recordApiUsage(route: string, status: number, userId?: string | null) {
  const date = todayKey();
  const key = keyFor({ date, route });
  const bucket = usageMap.get(key) ?? { requests: 0, errors: 0, uniqueUsers: new Set<string>() };
  bucket.requests += 1;
  if (status >= 500) bucket.errors += 1;
  if (userId) bucket.uniqueUsers.add(userId);
  usageMap.set(key, bucket);

  if (Date.now() - lastFlush > FLUSH_INTERVAL_MS) {
    await flushUsage();
  }
}

export async function updateUserLastSeen(userId: string) {
  const lastSeen = userLastSeenCache.get(userId);
  if (lastSeen && Date.now() - lastSeen < USER_SEEN_TTL_MS) return;
  userLastSeenCache.set(userId, Date.now());

  const { error } = await supabaseAdmin.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', userId);
  if (error) {
    logger.warn('usage.last_seen.update_failed', { user_id: userId, error: error.message });
  }
}

export async function flushUsage() {
  if (usageMap.size === 0) return;
  const rows = [...usageMap.entries()].map(([key, value]) => {
    const [date, route] = key.split(':');
    return {
      date,
      route,
      requests: value.requests,
      errors: value.errors,
      unique_users: value.uniqueUsers.size,
      updated_at: new Date().toISOString()
    };
  });
  usageMap.clear();
  lastFlush = Date.now();

  const { error } = await supabaseAdmin.from('api_usage_daily').upsert(rows, { onConflict: 'date,route' });
  if (error) {
    logger.warn('usage.flush_failed', { error: error.message });
  }
}
