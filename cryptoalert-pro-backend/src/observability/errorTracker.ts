type ErrorSample = {
  request_id: string | null;
  endpoint: string;
  status: number;
  code: string;
  message: string;
  captured_at: string;
};

type ErrorAggregate = {
  endpoint: string;
  code: string;
  count: number;
  last_seen_at: string;
  sample: ErrorSample;
};

const MAX_ERRORS = 2000;
const errorSamples: ErrorSample[] = [];

export function recordApiError(sample: ErrorSample) {
  if (errorSamples.length >= MAX_ERRORS) {
    errorSamples.shift();
  }
  errorSamples.push(sample);
}

export function getTopErrors(sinceMs: number, limit = 10): ErrorAggregate[] {
  const cutoff = Date.now() - sinceMs;
  const aggregates = new Map<string, ErrorAggregate>();

  for (const sample of errorSamples) {
    if (Date.parse(sample.captured_at) < cutoff) continue;
    const key = `${sample.endpoint}:${sample.code}`;
    const existing = aggregates.get(key);
    if (existing) {
      existing.count += 1;
      existing.last_seen_at = sample.captured_at;
      if (sample.captured_at > existing.sample.captured_at) {
        existing.sample = sample;
      }
    } else {
      aggregates.set(key, {
        endpoint: sample.endpoint,
        code: sample.code,
        count: 1,
        last_seen_at: sample.captured_at,
        sample
      });
    }
  }

  return [...aggregates.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}
