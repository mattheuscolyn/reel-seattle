/**
 * Authoritative profile-data module (T-ACCOUNT-PROFILE-DATA-01).
 *
 * Owns profile row fetch recovery + display_name updates.
 * Always derives user id from the authenticated session — never from UI callers.
 */

import { getSupabaseClient } from './supabaseClient.js';
import {
  getAuthState,
  setAuthProfilePatch,
  bumpProfileFetchGeneration,
  getProfileFetchGeneration,
} from './authSessionStore.js';
import {
  normalizeEditableDisplayName,
  profileSeedFromAuthUser,
} from './profileIdentity.js';

const PROFILE_SELECT_BASE =
  'id, username, display_name, avatar_url, created_at, updated_at';
const PROFILE_SELECT =
  'id, username, display_name, avatar_url, is_admin, created_at, updated_at';

function withAdminFlag(row) {
  if (!row || typeof row !== 'object') return row;
  return { ...row, is_admin: row.is_admin === true };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} userId
 * @param {number} generation
 */
async function selectOwnProfile(client, userId, generation) {
  const { data, error } = await client
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('id', userId)
    .maybeSingle();
  if (generation !== getProfileFetchGeneration()) {
    return { stale: true, data: null, error: null };
  }
  if (error && /is_admin/i.test(String(error.message || ''))) {
    const fallback = await client
      .from('profiles')
      .select(PROFILE_SELECT_BASE)
      .eq('id', userId)
      .maybeSingle();
    if (generation !== getProfileFetchGeneration()) {
      return { stale: true, data: null, error: null };
    }
    return {
      stale: false,
      data: withAdminFlag(fallback.data ?? null),
      error: fallback.error ?? null,
    };
  }
  return {
    stale: false,
    data: withAdminFlag(data ?? null),
    error: error ?? null,
  };
}

/**
 * Fetch the signed-in user's profile row. Optional missing-row upsert recovery.
 *
 * @param {{
 *   client?: import('@supabase/supabase-js').SupabaseClient | null,
 *   env?: Record<string, string | undefined> | null,
 *   recoverMissing?: boolean,
 * }} [options]
 * @returns {Promise<{
 *   ok: boolean,
 *   profile: object | null,
 *   recovered?: boolean,
 *   reason?: string,
 *   message?: string,
 * }>}
 */
export async function refreshOwnProfile(options = {}) {
  const auth = getAuthState();
  const user = auth.user;
  if (!user?.id || auth.status !== 'signed_in') {
    setAuthProfilePatch({ profile: null, profileStatus: 'idle' });
    return { ok: false, profile: null, reason: 'signed_out' };
  }

  const client =
    options.client ??
    getSupabaseClient(
      options.env != null ? { env: options.env } : undefined,
    );
  if (!client) {
    setAuthProfilePatch({ profile: null, profileStatus: 'error' });
    return {
      ok: false,
      profile: null,
      reason: 'no_client',
      message: 'Could not load your profile.',
    };
  }

  const generation = bumpProfileFetchGeneration();
  const userId = user.id;
  setAuthProfilePatch({ profileStatus: 'loading' });

  try {
    let { stale, data, error } = await selectOwnProfile(
      client,
      userId,
      generation,
    );
    if (stale) {
      return { ok: false, profile: null, reason: 'stale' };
    }
    if (error) {
      setAuthProfilePatch({ profile: null, profileStatus: 'error' });
      return {
        ok: false,
        profile: null,
        reason: 'fetch_failed',
        message: 'Could not load your profile. Showing account details instead.',
      };
    }

    let recovered = false;
    if (!data && options.recoverMissing !== false) {
      const seed = profileSeedFromAuthUser(user);
      const { error: upsertError } = await client.from('profiles').upsert(
        {
          id: userId,
          display_name: seed.display_name,
          avatar_url: seed.avatar_url,
        },
        { onConflict: 'id' },
      );
      if (generation !== getProfileFetchGeneration()) {
        return { ok: false, profile: null, reason: 'stale' };
      }
      if (upsertError) {
        setAuthProfilePatch({ profile: null, profileStatus: 'error' });
        return {
          ok: false,
          profile: null,
          reason: 'recover_failed',
          message:
            'Your account is signed in, but the profile row could not be created yet.',
        };
      }
      recovered = true;
      ({ stale, data, error } = await selectOwnProfile(
        client,
        userId,
        generation,
      ));
      if (stale) {
        return { ok: false, profile: null, reason: 'stale' };
      }
      if (error) {
        setAuthProfilePatch({ profile: null, profileStatus: 'error' });
        return {
          ok: false,
          profile: null,
          reason: 'fetch_failed',
          message: 'Could not load your profile after recovery.',
        };
      }
    }

    setAuthProfilePatch({
      profile: withAdminFlag(data ?? null),
      profileStatus: 'ready',
    });
    return { ok: true, profile: withAdminFlag(data ?? null), recovered };
  } catch {
    if (generation !== getProfileFetchGeneration()) {
      return { ok: false, profile: null, reason: 'stale' };
    }
    setAuthProfilePatch({ profile: null, profileStatus: 'error' });
    return {
      ok: false,
      profile: null,
      reason: 'fetch_failed',
      message: 'Could not load your profile. Showing account details instead.',
    };
  }
}

/**
 * Update own display_name under RLS. userId always from session.
 *
 * @param {unknown} nextDisplayName
 * @param {{
 *   client?: import('@supabase/supabase-js').SupabaseClient | null,
 *   env?: Record<string, string | undefined> | null,
 * }} [options]
 */
export async function updateOwnDisplayName(nextDisplayName, options = {}) {
  const normalized = normalizeEditableDisplayName(nextDisplayName);
  if (!normalized.ok) {
    return { ok: false, reason: 'validation', message: normalized.error };
  }

  const auth = getAuthState();
  const user = auth.user;
  if (!user?.id || auth.status !== 'signed_in') {
    return {
      ok: false,
      reason: 'signed_out',
      message: 'Sign in to edit your display name.',
    };
  }

  const client =
    options.client ??
    getSupabaseClient(options.env != null ? { env: options.env } : {});
  if (!client) {
    return {
      ok: false,
      reason: 'no_client',
      message: 'Could not save your display name.',
    };
  }

  const userId = user.id;
  const prior = auth.profile;

  // Optimistic local patch
  setAuthProfilePatch({
    profile: {
      ...(prior && typeof prior === 'object' ? prior : { id: userId }),
      id: userId,
      display_name: normalized.value,
    },
    profileStatus: 'ready',
  });

  try {
    let data = null;
    let error = null;
    if (prior?.id === userId) {
      const updated = await client
        .from('profiles')
        .update({ display_name: normalized.value })
        .eq('id', userId)
        .select(PROFILE_SELECT)
        .maybeSingle();
      data = updated.data;
      error = updated.error;
    } else {
      const seed = profileSeedFromAuthUser(user);
      const upserted = await client
        .from('profiles')
        .upsert(
          {
            id: userId,
            display_name: normalized.value ?? seed.display_name,
            avatar_url: seed.avatar_url,
          },
          { onConflict: 'id' },
        )
        .select(PROFILE_SELECT)
        .maybeSingle();
      data = upserted.data;
      error = upserted.error;
    }

    if (getAuthState().user?.id !== userId) {
      return { ok: false, reason: 'user_switched' };
    }

    if (error) {
      setAuthProfilePatch({
        profile: prior ?? null,
        profileStatus: prior ? 'ready' : 'error',
      });
      return {
        ok: false,
        reason: 'update_failed',
        message: 'Could not save your display name. Try again.',
      };
    }

    setAuthProfilePatch({
      profile: withAdminFlag(
        data ?? {
          ...(prior && typeof prior === 'object' ? prior : {}),
          id: userId,
          display_name: normalized.value,
        },
      ),
      profileStatus: 'ready',
    });
    return { ok: true, profile: getAuthState().profile };
  } catch {
    if (getAuthState().user?.id !== userId) {
      return { ok: false, reason: 'user_switched' };
    }
    setAuthProfilePatch({
      profile: prior ?? null,
      profileStatus: prior ? 'ready' : 'error',
    });
    return {
      ok: false,
      reason: 'update_failed',
      message: 'Could not save your display name. Try again.',
    };
  }
}
