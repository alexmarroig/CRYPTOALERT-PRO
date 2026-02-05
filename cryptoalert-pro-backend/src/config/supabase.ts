import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';
import { instrumentDependency } from '../observability/telemetry.js';

function instrumentBuilder<T extends object>(builder: T, table: string): T {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      if (prop === 'then') {
        return (onFulfilled: unknown, onRejected: unknown) => instrumentDependency('supabase', table, async () => {
          const thenFn = Reflect.get(target as object, 'then') as ((ok: unknown, fail: unknown) => Promise<unknown>) | undefined;
          if (!thenFn) return target;
          return thenFn.call(target, onFulfilled, onRejected);
        });
      }

      const value = Reflect.get(target as object, prop, receiver);
      if (typeof value !== 'function') {
        return value;
      }

      return (...args: unknown[]) => {
        const next = value.apply(target, args);
        if (next && typeof next === 'object') {
          return instrumentBuilder(next, table);
        }
        return next;
      };
    }
  });
}

function instrumentClient<T extends { from: (...args: any[]) => any }>(client: T): T {
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === 'from') {
        return (table: string) => {
          const builder = target.from(table);
          return instrumentBuilder(builder, table);
        };
      }

      return Reflect.get(target as object, prop, receiver);
    }
  });
}

const rawSupabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false
  }
});

const rawSupabaseAnon = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false
  }
});

export const supabaseAdmin = instrumentClient(rawSupabaseAdmin);
export const supabaseAnon = instrumentClient(rawSupabaseAnon);

export function createUserClient(token: string) {
  const rawClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });
  return instrumentClient(rawClient);
}
