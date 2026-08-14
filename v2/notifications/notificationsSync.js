/**
 * Authenticated notification fetch + read persistence (browser, publishable key).
 *
 * Does not insert/generate SHOWTIMES_AVAILABLE rows — that is service-role only.
 */

import { getSupabaseClient } from '../auth/supabaseClient.js';
import { notificationItemsFromSupabaseRows } from './notificationFromSupabase.js';

/**
 * @param {{ client?: import('@supabase/supabase-js').SupabaseClient | null }} [options]
 * @returns {Promise<{
 *   ok: boolean,
 *   items: import('./notificationModel.js').NotificationItem[],
 *   error?: string,
 * }>}
 */
export async function fetchUserNotifications(options = {}) {
  const client = options.client !== undefined ? options.client : getSupabaseClient();
  if (!client) {
    return { ok: false, items: [], error: 'supabase_unconfigured' };
  }

  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) {
    return { ok: false, items: [], error: sessionError.message };
  }
  if (!sessionData?.session?.user) {
    return { ok: true, items: [] };
  }

  const { data, error } = await client
    .from('user_notifications')
    .select(
      'id, user_id, type, film_key, film_id, showtime_film_key, occurrence_key, title_snapshot, body_snapshot, poster_url_snapshot, event_snapshot, created_at, read_at',
    )
    .order('created_at', { ascending: false });

  if (error) {
    return { ok: false, items: [], error: error.message };
  }

  return {
    ok: true,
    items: notificationItemsFromSupabaseRows(data ?? []),
  };
}

/**
 * @param {string} notificationId
 * @param {{
 *   client?: import('@supabase/supabase-js').SupabaseClient | null,
 *   readAtIso?: string,
 * }} [options]
 */
export async function markUserNotificationRead(notificationId, options = {}) {
  const client = options.client !== undefined ? options.client : getSupabaseClient();
  const id = typeof notificationId === 'string' ? notificationId.trim() : '';
  if (!client || !id) {
    return { ok: false, error: 'invalid_request' };
  }

  const readAt = options.readAtIso || new Date().toISOString();
  const { error } = await client
    .from('user_notifications')
    .update({ read_at: readAt })
    .eq('id', id)
    .is('read_at', null);

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, readAt };
}

/**
 * @param {{
 *   client?: import('@supabase/supabase-js').SupabaseClient | null,
 *   readAtIso?: string,
 * }} [options]
 */
export async function markAllUserNotificationsRead(options = {}) {
  const client = options.client !== undefined ? options.client : getSupabaseClient();
  if (!client) {
    return { ok: false, error: 'supabase_unconfigured' };
  }

  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) {
    return { ok: false, error: sessionError.message };
  }
  const userId = sessionData?.session?.user?.id;
  if (!userId) {
    return { ok: false, error: 'signed_out' };
  }

  const readAt = options.readAtIso || new Date().toISOString();
  const { error } = await client
    .from('user_notifications')
    .update({ read_at: readAt })
    .eq('user_id', userId)
    .is('read_at', null);

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, readAt };
}
