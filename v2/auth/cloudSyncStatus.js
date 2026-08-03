/**
 * Cloud sync status for Account UI (T-ACCOUNT-CLOUD-SYNC-FILMS-01).
 *
 * Film preferences (Saved / Seen / Not Interested) sync after explicit
 * browser attachment. My Schedule / plans / favorites are still local-only.
 */

import {
  getFilmPreferencesSyncLabel,
  getFilmPreferencesSyncSnapshot,
} from './filmPreferencesSync.js';

/**
 * @typedef {'signed_out' | 'local_only' | 'prompt' | 'attaching' | 'synced' | 'degraded'} CloudSyncStatus
 */

/**
 * @returns {CloudSyncStatus}
 */
export function getCloudSyncStatus() {
  const snap = getFilmPreferencesSyncSnapshot();
  if (snap.uiStatus === 'signed_out') return 'local_only';
  return snap.uiStatus;
}

/**
 * Honest user-facing copy. Never claims My Schedule is synced.
 * @returns {string}
 */
export function getCloudSyncStatusLabel() {
  return getFilmPreferencesSyncLabel();
}

/** @deprecated Prefer getCloudSyncStatus() — kept for older auth snapshots. */
export const CLOUD_SYNC_STATUS = 'local_only';

/** @deprecated Prefer getCloudSyncStatusLabel(). */
export const CLOUD_SYNC_STATUS_LABEL =
  'Film activity is stored on this device';
