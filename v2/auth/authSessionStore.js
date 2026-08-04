/**
 * Auth session controller (T-AUTH-01 / T-ACCOUNT-CLOUD-AUTH-01).
 *
 * External-store style (subscribe + getSnapshot) matching other v2 stores.
 * Does not touch Saved/Seen/NI/Favorites/Plans/Schedule local stores.
 */

import {
  getSupabaseClient,
  isSupabaseConfigured,
} from './supabaseClient.js';
import {
  cleanAuthCallbackUrl,
  markAuthReturnToProfile,
  resolveOAuthRedirectTo,
  sanitizeExplicitOAuthRedirectTo,
} from './oauthRedirect.js';
import { getCloudSyncStatus } from './cloudSyncStatus.js';
import {
  setFilmPreferencesAuthContext,
  startFilmPreferencesSyncController,
  subscribeFilmPreferencesSync,
} from './filmPreferencesSync.js';
import {
  setScheduleAuthContext,
  startScheduleSyncController,
  subscribeScheduleSync,
} from './scheduleSync.js';
import {
  initialsFromDisplayName as initialsFromDisplayNameImpl,
  resolveProfileAvatarUrl,
  resolveProfileDisplayName,
} from './profileIdentity.js';
import { refreshOwnProfile } from './profileData.js';

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
 *   signedIn: boolean,
 *   authActionBusy: boolean,
 *   cloudSyncStatus: import('./cloudSyncStatus.js').CloudSyncStatus,
 * }} AuthState
 */

/** @type {AuthState} */
let state = createInitialState();
/** @type {Set<(s: AuthState) => void>} */
const listeners = new Set();
/** @type {null | (() => void)} */
let authSubscriptionTeardown = null;
/** @type {null | (() => void)} */
let filmSyncSubscriptionTeardown = null;
/** @type {null | (() => void)} */
let scheduleSyncSubscriptionTeardown = null;
/** @type {boolean} */
let started = false;
/** @type {number} */
let startGeneration = 0;
/** @type {number} */
let profileFetchGeneration = 0;
/** @type {boolean} */
let oauthInFlight = false;

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
    signedIn: false,
    authActionBusy: false,
    cloudSyncStatus: getCloudSyncStatus(),
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
  if ('status' in patch || 'user' in patch || 'session' in patch) {
    state = {
      ...state,
      signedIn: state.status === 'signed_in' && Boolean(state.user),
    };
  }
  for (const listener of listeners) listener(state);
}

/**
 * Narrow profile-field patch for profileData module (own-row only).
 * @param {Partial<Pick<AuthState, 'profile' | 'profileStatus' | 'errorMessage'>>} patch
 */
export function setAuthProfilePatch(patch) {
  setState(patch);
}

/** @returns {number} */
export function bumpProfileFetchGeneration() {
  profileFetchGeneration += 1;
  return profileFetchGeneration;
}

/** @returns {number} */
export function getProfileFetchGeneration() {
  return profileFetchGeneration;
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
 * @param {object | null} [profile]
 * @returns {string}
 */
export function resolveAuthDisplayName(user, profile = null) {
  return resolveProfileDisplayName(user, profile);
}

/**
 * Safe https avatar URL (profile override, then Auth metadata).
 * @param {object | null | undefined} profile
 * @param {object | null | undefined} [user]
 * @returns {string | null}
 */
export function resolveAuthAvatarUrl(profile, user = null) {
  return resolveProfileAvatarUrl(profile, user);
}

/**
 * @param {string | null | undefined} displayName
 * @returns {string}
 */
export function initialsFromDisplayName(displayName) {
  return initialsFromDisplayNameImpl(displayName);
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 */
async function fetchOwnProfile(client) {
  return refreshOwnProfile({ client, recoverMissing: true });
}

function refreshCloudSyncStatus() {
  setState({ cloudSyncStatus: getCloudSyncStatus() });
}

/**
 * Apply a session from Supabase without clearing local film/planner stores.
 * @param {object | null} session
 * @param {import('@supabase/supabase-js').SupabaseClient | null} client
 */
async function applySession(session, client) {
  const storage =
    typeof localStorage !== 'undefined' ? localStorage : null;
  if (!session?.user) {
    bumpProfileFetchGeneration();
    setFilmPreferencesAuthContext({
      userId: null,
      client,
      storage,
    });
    setScheduleAuthContext({
      userId: null,
      client,
      storage,
    });
    setState({
      status: 'signed_out',
      session: null,
      user: null,
      profile: null,
      profileStatus: 'idle',
      errorMessage: null,
      authActionBusy: false,
      cloudSyncStatus: getCloudSyncStatus(),
    });
    return;
  }

  bumpProfileFetchGeneration();
  setState({
    status: 'signed_in',
    session,
    user: session.user,
    errorMessage: null,
    authActionBusy: false,
    profile: null,
    profileStatus: 'loading',
  });

  setFilmPreferencesAuthContext({
    userId: session.user.id,
    client,
    storage,
  });
  setScheduleAuthContext({
    userId: session.user.id,
    client,
    storage,
  });
  setState({ cloudSyncStatus: getCloudSyncStatus() });

  if (client) {
    await fetchOwnProfile(client);
  }
}

/**
 * Start session restoration + auth listener. Idempotent.
 *
 * @param {{
 *   env?: Record<string, string | undefined> | null,
 *   getClient?: typeof getSupabaseClient,
 *   cleanCallbackUrl?: boolean,
 * }} [options]
 */
export async function startAuthController(options = {}) {
  const generation = ++startGeneration;
  const getClient = options.getClient ?? getSupabaseClient;
  const env = options.env;
  const shouldCleanCallback = options.cleanCallbackUrl !== false;

  if (authSubscriptionTeardown) {
    authSubscriptionTeardown();
    authSubscriptionTeardown = null;
  }

  if (!isSupabaseConfigured(env ?? import.meta.env)) {
    started = true;
    oauthInFlight = false;
    setState({
      ...createInitialState(),
      status: 'unconfigured',
      configured: false,
      errorMessage: null,
    });
    return getAuthState();
  }

  started = true;
  startFilmPreferencesSyncController();
  startScheduleSyncController();
  if (!filmSyncSubscriptionTeardown) {
    filmSyncSubscriptionTeardown = subscribeFilmPreferencesSync(() => {
      refreshCloudSyncStatus();
    });
  }
  if (!scheduleSyncSubscriptionTeardown) {
    scheduleSyncSubscriptionTeardown = subscribeScheduleSync(() => {
      refreshCloudSyncStatus();
    });
  }
  setState({
    status: 'loading',
    configured: true,
    errorMessage: null,
    authActionBusy: false,
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
      authActionBusy: false,
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
        authActionBusy: false,
      });
    } else {
      await applySession(data.session ?? null, client);
      if (shouldCleanCallback && data.session) {
        cleanAuthCallbackUrl();
      }
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
      authActionBusy: false,
    });
  }

  const { data: subData } = client.auth.onAuthStateChange(
    async (event, session) => {
      if (generation !== startGeneration) return;
      await applySession(session ?? null, client);
      if (
        shouldCleanCallback &&
        (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') &&
        session
      ) {
        cleanAuthCallbackUrl();
      }
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
  profileFetchGeneration += 1;
  oauthInFlight = false;
  if (authSubscriptionTeardown) {
    authSubscriptionTeardown();
    authSubscriptionTeardown = null;
  }
  if (filmSyncSubscriptionTeardown) {
    filmSyncSubscriptionTeardown();
    filmSyncSubscriptionTeardown = null;
  }
  if (scheduleSyncSubscriptionTeardown) {
    scheduleSyncSubscriptionTeardown();
    scheduleSyncSubscriptionTeardown = null;
  }
  setFilmPreferencesAuthContext({ userId: null, client: null });
  setScheduleAuthContext({ userId: null, client: null });
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
 *   storage?: Storage | null,
 * }} [options]
 */
export async function signInWithGoogle(options = {}) {
  if (oauthInFlight || state.authActionBusy) {
    return { ok: false, reason: 'busy' };
  }

  if (!isSupabaseConfigured(options.env ?? import.meta.env)) {
    setState({
      status: 'unconfigured',
      configured: false,
      errorMessage: 'Account sign-in is not configured in this build.',
      authActionBusy: false,
    });
    return { ok: false, reason: 'unconfigured' };
  }

  const getClient = options.getClient ?? getSupabaseClient;
  const client = getClient(options.env != null ? { env: options.env } : {});
  if (!client) {
    setState({
      status: 'error',
      errorMessage: 'Account sign-in could not be initialized.',
      authActionBusy: false,
    });
    return { ok: false, reason: 'init' };
  }

  const explicit = sanitizeExplicitOAuthRedirectTo(options.redirectTo);
  const redirectTo = explicit ?? resolveOAuthRedirectTo();

  oauthInFlight = true;
  setState({ authActionBusy: true, errorMessage: null });
  markAuthReturnToProfile(options.storage ?? undefined);

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
      oauthInFlight = false;
      const message = friendlyError(
        error,
        'Google sign-in could not be started.',
      );
      setState({ errorMessage: message, authActionBusy: false });
      return { ok: false, reason: 'oauth', message, redirectTo };
    }
    // Browser navigates away on success; keep busy until unload.
    return { ok: true, redirectTo };
  } catch (error) {
    oauthInFlight = false;
    const message = friendlyError(
      error,
      'Google sign-in could not be started.',
    );
    setState({ errorMessage: message, authActionBusy: false });
    return { ok: false, reason: 'oauth', message, redirectTo };
  }
}

/**
 * @param {{
 *   env?: Record<string, string | undefined> | null,
 *   getClient?: typeof getSupabaseClient,
 * }} [options]
 */
export async function signOut(options = {}) {
  if (state.authActionBusy) {
    return { ok: false, reason: 'busy' };
  }

  const getClient = options.getClient ?? getSupabaseClient;
  const client = getClient(options.env != null ? { env: options.env } : {});
  setState({ authActionBusy: true });

  if (!client) {
    setState({
      status: state.configured ? 'signed_out' : 'unconfigured',
      session: null,
      user: null,
      profile: null,
      profileStatus: 'idle',
      errorMessage: null,
      authActionBusy: false,
    });
    return { ok: true };
  }

  try {
    const { error } = await client.auth.signOut();
    if (error) {
      const message = friendlyError(error, 'Could not sign out. Try again.');
      setState({ errorMessage: message, authActionBusy: false });
      return { ok: false, message };
    }
    // onAuthStateChange will clear session; also clear immediately for UX.
    // Local film/planner stores are intentionally untouched.
    setFilmPreferencesAuthContext({
      userId: null,
      client,
      storage: typeof localStorage !== 'undefined' ? localStorage : null,
    });
    setScheduleAuthContext({
      userId: null,
      client,
      storage: typeof localStorage !== 'undefined' ? localStorage : null,
    });
    setState({
      status: 'signed_out',
      session: null,
      user: null,
      profile: null,
      profileStatus: 'idle',
      errorMessage: null,
      authActionBusy: false,
      cloudSyncStatus: getCloudSyncStatus(),
    });
    return { ok: true };
  } catch (error) {
    const message = friendlyError(error, 'Could not sign out. Try again.');
    setState({ errorMessage: message, authActionBusy: false });
    return { ok: false, message };
  }
}

/** Test helper */
export function resetAuthControllerForTests() {
  stopAuthController();
}
