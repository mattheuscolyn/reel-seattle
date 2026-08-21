/**
 * Admin-only film_identity_reviews access via user JWT + RLS.
 * Never trusts a client-supplied user id or email for authorization.
 */

import { getSupabaseClient } from '../../auth/supabaseClient.js';
import { normalizeReviewDecision } from './reviewDecisions.js';
import { sourceIdentityKey } from './sourceIdentity.js';

const REVIEW_SELECT = [
  'id',
  'source_identity_key',
  'source',
  'source_film_id',
  'showtime_film_key',
  'decision',
  'tmdb_id',
  'admin_note',
  'snapshot',
  'reviewed_by',
  'reviewed_at',
  'created_at',
  'updated_at',
  'active',
].join(', ');

/**
 * @param {{ client?: import('@supabase/supabase-js').SupabaseClient | null }} [options]
 */
export async function fetchFilmIdentityReviews(options = {}) {
  const client =
    options.client !== undefined ? options.client : getSupabaseClient();
  if (!client) {
    return { ok: false, reviews: [], error: 'supabase_unconfigured' };
  }

  const { data: sessionData, error: sessionError } =
    await client.auth.getSession();
  if (sessionError) {
    return { ok: false, reviews: [], error: sessionError.message };
  }
  if (!sessionData?.session?.user) {
    return { ok: false, reviews: [], error: 'signed_out' };
  }

  const { data, error } = await client
    .from('film_identity_reviews')
    .select(REVIEW_SELECT)
    .eq('active', true)
    .order('reviewed_at', { ascending: false });

  if (error) {
    return { ok: false, reviews: [], error: error.message };
  }
  return { ok: true, reviews: data ?? [] };
}

/**
 * @param {{
 *   sourceIdentityKey?: string,
 *   source: string,
 *   sourceFilmId?: string | null,
 *   showtimeFilmKey?: string | null,
 *   decision: string,
 *   tmdbId?: number | null,
 *   adminNote?: string | null,
 *   snapshot?: object | null,
 * }} payload
 * @param {{ client?: import('@supabase/supabase-js').SupabaseClient | null }} [options]
 */
export async function saveFilmIdentityReview(payload, options = {}) {
  const client =
    options.client !== undefined ? options.client : getSupabaseClient();
  if (!client) {
    return { ok: false, review: null, error: 'supabase_unconfigured' };
  }

  const { data: sessionData, error: sessionError } =
    await client.auth.getSession();
  if (sessionError) {
    return { ok: false, review: null, error: sessionError.message };
  }
  const user = sessionData?.session?.user;
  if (!user?.id) {
    return { ok: false, review: null, error: 'signed_out' };
  }

  const decision = normalizeReviewDecision(payload?.decision);
  if (!decision) {
    return { ok: false, review: null, error: 'invalid_decision' };
  }
  const tmdbId =
    typeof payload?.tmdbId === 'number' && payload.tmdbId >= 1
      ? payload.tmdbId
      : null;
  if (decision === 'matched' && !tmdbId) {
    return { ok: false, review: null, error: 'tmdb_id_required' };
  }

  const key =
    payload.sourceIdentityKey ||
    sourceIdentityKey({
      source: payload.source,
      sourceFilmId: payload.sourceFilmId,
      showtimeFilmKey: payload.showtimeFilmKey,
    });
  if (!key) {
    return { ok: false, review: null, error: 'invalid_identity' };
  }

  const row = {
    source_identity_key: key,
    source: String(payload.source || '').trim(),
    source_film_id: payload.sourceFilmId ?? null,
    showtime_film_key: payload.showtimeFilmKey ?? null,
    decision,
    tmdb_id: decision === 'matched' ? tmdbId : null,
    admin_note:
      typeof payload.adminNote === 'string' && payload.adminNote.trim()
        ? payload.adminNote.trim().slice(0, 500)
        : null,
    snapshot: payload.snapshot && typeof payload.snapshot === 'object'
      ? payload.snapshot
      : {},
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
    active: true,
  };

  const { data, error } = await client
    .from('film_identity_reviews')
    .upsert(row, { onConflict: 'source_identity_key' })
    .select(REVIEW_SELECT)
    .maybeSingle();

  if (error) {
    return { ok: false, review: null, error: error.message };
  }
  return { ok: true, review: data };
}
