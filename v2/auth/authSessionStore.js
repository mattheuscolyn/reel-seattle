/**
 * Auth session controller (T-AUTH-01).
 *
 * External-store style (subscribe + getSnapshot) matching other v2 stores.
 * Does not touch Saved/Seen/NI/Favorites/Plans/Schedule local stores.
 */

import {
  getSupabaseClient,
  isSupabaseConfigured,
} from './supabaseClient.js';

/** @typedef {'unconfigured' | 'loading' | 'signed_out' | 'signed_in' | 'error'} AuthStatus */

/**
 * @typedef {{
 *   status: AuthStatus,
 *   session: object | null,
 *   user: object | null,
 *   profile: object | null,
 *   profileStatus: 'idle' | 'loading' | 'ready' | 'error',
 *   errorMessage: string | null,
 *   configured: boolean,
 * }} AuthState
 */

/** @type {AuthState} */
let state = createInitialState();
/** @type {Set<(s: AuthState) => void>} */
const listeners = new Set();
/** @type {null | (() => void)} */
let authSubscriptionTeardown = null;
/** @type {boolean} */
let started = false;
/** @type {number} */
let startGeneration = 0;

/**
 * @returns {AuthState}
 */
function createInitialState() {
  return {
    status: 'loading',
    session: null,
    user: null,
    profile: null,
    profileStatus: 'idle',
    errorMessage: null,
    configured: false,
  };
}

/**
 * @returns {AuthState}
 */
export function getAuthState() {
  return state;
}

/**
 * @param {(s: AuthState) => void} listener
 * @returns {() => void}
 */
export function subscribeAuth(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * @param {Partial<AuthState>} patch
 */
function setState(patch) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener(state);
}

/**
 * User-facing error copy — never dump raw SDK stacks.
 * @param {unknown} error
 * @param {string} fallback
 */
function friendlyError(error, fallback) {
  if (!error) return fallback;
  const message =
    typeof error === 'object' &&
    error &&
    'message' in error &&
    typeof error.message === 'string'
      ? error.message.trim()
      : '';
  if (!message) return fallback;
  const lower = message.toLowerCase();
  if (
    lower.includes('popup') ||
    lower.includes('cancelled') ||
    lower.includes('canceled') ||
    lower.includes('user denied')
  ) {
    return 'Sign-in was cancelled.';
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return 'Could not reach the account service. Try again when you are online.';
  }
  return fallback;
}

/**
 * @param {object | null | undefined} user
 * @returns {string | null}
 */
export function resolveAuthDisplayName(user, profile = null) {
  const profileName =
    profile && typeof profile.display_name === 'string'
      ? profile.display_name.trim()
      : '';
  if (profileName) return profileName;

  const meta = user?.user_metadata;
  const metaName =
    meta && typeof meta === 'object'
      ? typeof meta.full_name === 'string'
        ? meta.full_name.trim()
        : typeof meta.name === 'string'
          ? meta.name.trim()
          : typeof meta.display_name === 'string'
            ? meta.display_name.trim()
            : ''
      : '';
  if (metaName) return metaName;

  const email = typeof user?.email === 'string' ? user.email.trim() : '';
  return email || null;
}

/**
 * @param {string | null | undefined} displayName
 * @returns {string}
 */
export function initialsFromDisplayName(displayName) {
  const raw = typeof displayName === 'string' ? displayName.trim() : '';
  if (!raw) return '?';
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
  }
  return raw.slice(0, 1).toUpperCase();
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} userId
 */
async function fetchOwnProfile(client, userId) {
  setState({ profileStatus: 'loading' });
  try {
    const { data, error } = await client
      .from('profiles')
      .select('id, username, display_name, avatar_url, created_at, updated_at')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      setState({
        profile: null,
        profileStatus: 'error',
      });
      return null;
    }
    setState({
      profile: data ?? null,
      profileStatus: 'ready',
    });
    return data ?? null;
  } catch {
    setState({
      profile: null,
      profileStatus: 'error',
    });
    return null;
  }
}

/**
 * Apply a session from Supabase without clearing local film/planner stores.
 * @param {object | null} session
 * @param {import('@supabase/supabase-js').SupabaseClient | null} client
 */
async function applySession(session, client) {
  if (!session?.user) {
    setState({
      status: 'signed_out',
      session: null,
      user: null,
      profile: null,
      profileStatus: 'idle',
      errorMessage: null,
    });
    return;
  }

  setState({
    status: 'signed_in',
    session,
    user: session.user,
    errorMessage: null,
  });

  if (client) {
    await fetchOwnProfile(client, session.user.id);
  }
}

/**
 * Start session restoration + auth listener. Idempotent.
 *
 * @param {{
 *   env?: Record<string, string | undefined> | null,
 *   getClient?: typeof getSupabaseClient,
 * }} [options]
 */
export async function startAuthController(options = {}) {
  const generation = ++startGeneration;
  const getClient = options.getClient ?? getSupabaseClient;
  const env = options.env;

  if (authSubscriptionTeardown) {
    authSubscriptionTeardown();
    authSubscriptionTeardown = null;
  }

  if (!isSupabaseConfigured(env ?? import.meta.env)) {
    started = true;
    setState({
      ...createInitialState(),
      status: 'unconfigured',
      configured: false,
      errorMessage: null,
    });
    return getAuthState();
  }

  started = true;
  setState({
    status: 'loading',
    configured: true,
    errorMessage: null,
  });

  const client = getClient(env != null ? { env } : {});
  if (!client) {
    setState({
      status: 'error',
      configured: true,
      errorMessage: 'Account sign-in could not be initialized.',
      session: null,
      user: null,
      profile: null,
      profileStatus: 'idle',
    });
    return getAuthState();
  }

  try {
    const { data, error } = await client.auth.getSession();
    if (generation !== startGeneration) return getAuthState();
    if (error) {
      setState({
        status: 'error',
        errorMessage: friendlyError(
          error,
          'Could not restore your account session.',
        ),
        session: null,
        user: null,
        profile: null,
        profileStatus: 'idle',
      });
    } else {
      await applySession(data.session ?? null, client);
    }
  } catch (error) {
    if (generation !== startGeneration) return getAuthState();
    setState({
      status: 'error',
      errorMessage: friendlyError(
        error,
        'Could not restore your account session.',
      ),
      session: null,
      user: null,
      profile: null,
      profileStatus: 'idle',
    });
  }

  const { data: subData } = client.auth.onAuthStateChange(
    async (_event, session) => {
      if (generation !== startGeneration) return;
      await applySession(session ?? null, client);
    },
  );

  authSubscriptionTeardown = () => {
    subData.subscription.unsubscribe();
  };

  return getAuthState();
}

/**
 * Stop listeners (tests / hot reload).
 */
export function stopAuthController() {
  startGeneration += 1;
  if (authSubscriptionTeardown) {
    authSubscriptionTeardown();
    authSubscriptionTeardown = null;
  }
  started = false;
  state = createInitialState();
  for (const listener of listeners) listener(state);
}

/**
 * @returns {boolean}
 */
export function isAuthControllerStarted() {
  return started;
}

/**
 * @param {{
 *   env?: Record<string, string | undefined> | null,
 *   getClient?: typeof getSupabaseClient,
 *   redirectTo?: string,
 * }} [options]
 */
export async function signInWithGoogle(options = {}) {
  if (!isSupabaseConfigured(options.env ?? import.meta.env)) {
    setState({
      status: 'unconfigured',
      configured: false,
      errorMessage: 'Account sign-in is not configured in this build.',
    });
    return { ok: false, reason: 'unconfigured' };
  }

  const getClient = options.getClient ?? getSupabaseClient;
  const client = getClient(options.env != null ? { env: options.env } : {});
  if (!client) {
    setState({
      status: 'error',
      errorMessage: 'Account sign-in could not be initialized.',
    });
    return { ok: false, reason: 'init' };
  }

  const redirectTo =
    options.redirectTo ??
    (typeof window !== 'undefined'
      ? `${window.location.origin}/`
      : undefined);

  try {
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: {
          access_type: 'offline',
          prompt: 'select_account',
        },
      },
    });
    if (error) {
      const message = friendlyError(
        error,
        'Google sign-in could not be started.',
      );
      setState({ errorMessage: message });
      return { ok: false, reason: 'oauth', message };
    }
    return { ok: true };
  } catch (error) {
    const message = friendlyError(
      error,
      'Google sign-in could not be started.',
    );
    setState({ errorMessage: message });
    return { ok: false, reason: 'oauth', message };
  }
}

/**
 * @param {{
 *   env?: Record<string, string | undefined> | null,
 *   getClient?: typeof getSupabaseClient,
 * }} [options]
 */
export async function signOut(options = {}) {
  const getClient = options.getClient ?? getSupabaseClient;
  const client = getClient(options.env != null ? { env: options.env } : {});
  if (!client) {
    setState({
      status: state.configured ? 'signed_out' : 'unconfigured',
      session: null,
      user: null,
      profile: null,
      profileStatus: 'idle',
      errorMessage: null,
    });
    return { ok: true };
  }

  try {
    const { error } = await client.auth.signOut();
    if (error) {
      const message = friendlyError(error, 'Could not sign out. Try again.');
      setState({ errorMessage: message });
      return { ok: false, message };
    }
    // onAuthStateChange will clear session; also clear immediately for UX.
    setState({
      status: 'signed_out',
      session: null,
      user: null,
      profile: null,
      profileStatus: 'idle',
      errorMessage: null,
    });
    return { ok: true };
  } catch (error) {
    const message = friendlyError(error, 'Could not sign out. Try again.');
    setState({ errorMessage: message });
    return { ok: false, message };
  }
}

/** Test helper */
export function resetAuthControllerForTests() {
  stopAuthController();
}
