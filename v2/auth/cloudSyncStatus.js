/**
 * Cloud sync status for Account UI (T-ACCOUNT-CLOUD-AUTH-01).
 *
 * Synchronization of Saved / Seen / Not Interested / Plans is not implemented.
 * This module is the extension point for later sync tasks — do not invent
 * upload/merge APIs here.
 */

/** @typedef {'not_implemented'} CloudSyncStatus */

/** @type {CloudSyncStatus} */
export const CLOUD_SYNC_STATUS = 'not_implemented';

export const CLOUD_SYNC_STATUS_LABEL =
  'Local data only · Cloud sync setup in progress';

/**
 * @returns {CloudSyncStatus}
 */
export function getCloudSyncStatus() {
  return CLOUD_SYNC_STATUS;
}

/**
 * Honest user-facing copy. Never claims backup/sync is active.
 * @returns {string}
 */
export function getCloudSyncStatusLabel() {
  return CLOUD_SYNC_STATUS_LABEL;
}
