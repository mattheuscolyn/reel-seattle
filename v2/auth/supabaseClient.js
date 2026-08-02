/**
 * Supabase browser client boundary (T-AUTH-01).
 *
 * Uses only public Vite env vars. Never reads service-role or DB passwords.
 * Safe when unconfigured — does not throw at import time.
 */

import { createClient } from '@supabase/supabase-js';

/** @typedef {import('@supabase/supabase-js').SupabaseClient} SupabaseClient */

/**
 * @param {ImportMetaEnv | Record<string, string | undefined> | null | undefined} [env]
 * @returns {{ url: string | null, publishableKey: string | null }}
 */
export function readSupabasePublicConfig(env = import.meta.env) {
  const source = env && typeof env === 'object' ? env : {};
  const url =
    typeof source.VITE_SUPABASE_URL === 'string'
      ? source.VITE_SUPABASE_URL.trim()
      : '';
  const publishableKey =
    typeof source.VITE_SUPABASE_PUBLISHABLE_KEY === 'string'
      ? source.VITE_SUPABASE_PUBLISHABLE_KEY.trim()
      : '';
  return {
    url: url || null,
    publishableKey: publishableKey || null,
  };
}

/**
 * @param {ImportMetaEnv | Record<string, string | undefined> | null | undefined} [env]
 * @returns {boolean}
 */
export function isSupabaseConfigured(env = import.meta.env) {
  const { url, publishableKey } = readSupabasePublicConfig(env);
  return Boolean(url && publishableKey);
}

/** @type {SupabaseClient | null} */
let cachedClient = null;
/** @type {string | null} */
let cachedKey = null;

/**
 * Return a singleton Supabase client, or null when public env is absent/invalid.
 * Never throws for missing configuration.
 *
 * @param {{
 *   env?: ImportMetaEnv | Record<string, string | undefined> | null,
 *   createClientFn?: typeof createClient,
 * }} [options]
 * @returns {SupabaseClient | null}
 */
export function getSupabaseClient(options = {}) {
  const env = options.env ?? import.meta.env;
  const createClientFn = options.createClientFn ?? createClient;
  const { url, publishableKey } = readSupabasePublicConfig(env);
  if (!url || !publishableKey) {
    cachedClient = null;
    cachedKey = null;
    return null;
  }

  const cacheKey = `${url}\0${publishableKey}`;
  if (cachedClient && cachedKey === cacheKey) {
    return cachedClient;
  }

  try {
    cachedClient = createClientFn(url, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    });
    cachedKey = cacheKey;
    return cachedClient;
  } catch {
    cachedClient = null;
    cachedKey = null;
    return null;
  }
}

/** Test helper — clears the singleton between cases. */
export function resetSupabaseClientForTests() {
  cachedClient = null;
  cachedKey = null;
}
