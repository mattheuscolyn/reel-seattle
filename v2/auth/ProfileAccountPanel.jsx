/**
 * Compact Profile account block
 * (T-AUTH-01 / T-ACCOUNT-CLOUD-SYNC-FILMS-01 / T-ACCOUNT-CLOUD-SYNC-SCHEDULE-01).
 * Film sync and schedule sync are separate explicit attachments.
 */

import { useEffect, useState } from 'react';
import {
  initialsFromDisplayName,
  resolveAuthAvatarUrl,
  resolveAuthDisplayName,
  signInWithGoogle,
  signOut,
} from './authSessionStore.js';
import { getCloudSyncStatusLabel } from './cloudSyncStatus.js';
import {
  attachFilmPreferencesMerge,
  declineFilmPreferencesAttach,
  getFilmPreferencesSyncSnapshot,
  subscribeFilmPreferencesSync,
  syncFilmPreferencesNow,
} from './filmPreferencesSync.js';
import {
  attachScheduleMerge,
  declineScheduleAttach,
  getScheduleSyncLabel,
  getScheduleSyncSnapshot,
  subscribeScheduleSync,
  syncScheduleNow,
} from './scheduleSync.js';
import { useAuth } from './useAuth.js';

/**
 * @param {{
 *   onAuthAction?: (actionId: string) => void,
 * }} [props]
 */
export default function ProfileAccountPanel({ onAuthAction }) {
  const auth = useAuth();
  const [filmSync, setFilmSync] = useState(() =>
    getFilmPreferencesSyncSnapshot(),
  );
  const [scheduleSync, setScheduleSync] = useState(() =>
    getScheduleSyncSnapshot(),
  );
  const [filmAttachOpen, setFilmAttachOpen] = useState(false);
  const [scheduleAttachOpen, setScheduleAttachOpen] = useState(false);

  useEffect(() => {
    const unsubFilm = subscribeFilmPreferencesSync((snap) => {
      setFilmSync(snap);
    });
    const unsubSchedule = subscribeScheduleSync((snap) => {
      setScheduleSync(snap);
    });
    return () => {
      unsubFilm();
      unsubSchedule();
    };
  }, []);

  const displayName = resolveAuthDisplayName(auth.user, auth.profile);
  const avatarUrl = resolveAuthAvatarUrl(auth.profile);
  const busy =
    auth.status === 'loading' || Boolean(auth.authActionBusy);
  const filmLabel = getCloudSyncStatusLabel();
  const scheduleLabel = getScheduleSyncLabel(scheduleSync);
  const filmAttaching =
    filmSync.uiStatus === 'attaching' || filmSync.attaching;
  const scheduleAttaching =
    scheduleSync.uiStatus === 'attaching' || scheduleSync.attaching;

  const handleGoogle = async () => {
    if (busy) return;
    onAuthAction?.('sign-in-google');
    await signInWithGoogle();
  };

  const handleSignOut = async () => {
    if (busy) return;
    onAuthAction?.('sign-out');
    setFilmAttachOpen(false);
    setScheduleAttachOpen(false);
    await signOut();
  };

  const showFilmAttach =
    auth.status === 'signed_in' &&
    auth.user &&
    !filmSync.attached &&
    (filmAttachOpen || filmSync.uiStatus === 'attaching');

  const showScheduleAttach =
    auth.status === 'signed_in' &&
    auth.user &&
    !scheduleSync.attached &&
    (scheduleAttachOpen || scheduleSync.uiStatus === 'attaching');

  return (
    <section
      className="v2-profile-section v2-profile-account"
      data-profile-section="account"
      data-auth-status={auth.status}
      data-cloud-sync={auth.cloudSyncStatus}
      data-film-sync={filmSync.uiStatus}
      data-schedule-sync={scheduleSync.uiStatus}
      aria-labelledby="v2-profile-account-h"
    >
      <h2 id="v2-profile-account-h" className="v2-profile-section-label">
        Account
      </h2>

      {auth.status === 'unconfigured' ? (
        <div className="v2-profile-account-body">
          <p className="v2-profile-account-note" role="status">
            Account sign-in is not configured in this build. Reel Seattle still
            works on this device without an account.
          </p>
        </div>
      ) : null}

      {auth.status === 'loading' ? (
        <p className="v2-profile-account-note" role="status">
          Checking account…
        </p>
      ) : null}

      {auth.status === 'error' && !auth.user ? (
        <div className="v2-profile-account-body">
          <p className="v2-profile-account-note" role="alert">
            {auth.errorMessage ??
              'Account sign-in is temporarily unavailable.'}
          </p>
          <p className="v2-profile-account-note">
            Your Saved films, Seen list, and plans on this device are
            unaffected.
          </p>
          <button
            type="button"
            className="v2-profile-account-btn"
            disabled={busy}
            onClick={() => void handleGoogle()}
          >
            {busy ? 'Signing in…' : 'Continue with Google'}
          </button>
        </div>
      ) : null}

      {auth.status === 'signed_out' ? (
        <div className="v2-profile-account-body">
          <p className="v2-profile-account-note">
            Sign in to enable optional backup of film activity and My Schedule
            across browsers. Signing in alone does not move your data.
          </p>
          <p className="v2-profile-account-note">
            Reel Seattle still works fully without an account. Local Saved,
            Seen, Not Interested, and My Schedule stay on this device.
          </p>
          <button
            type="button"
            className="v2-profile-account-btn"
            disabled={busy}
            aria-busy={busy ? 'true' : undefined}
            onClick={() => void handleGoogle()}
          >
            {busy ? 'Signing in…' : 'Continue with Google'}
          </button>
          {auth.errorMessage ? (
            <p className="v2-profile-account-error" role="alert">
              {auth.errorMessage}
            </p>
          ) : null}
        </div>
      ) : null}

      {auth.status === 'signed_in' && auth.user ? (
        <div className="v2-profile-account-body">
          <div className="v2-profile-account-identity">
            {avatarUrl ? (
              <img
                className="v2-profile-account-avatar v2-profile-account-avatar-img"
                src={avatarUrl}
                alt=""
                width={40}
                height={40}
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="v2-profile-account-avatar" aria-hidden="true">
                {initialsFromDisplayName(displayName)}
              </span>
            )}
            <div>
              <p className="v2-profile-account-name">
                {displayName ?? 'Signed in'}
              </p>
              {auth.user.email ? (
                <p className="v2-profile-account-email">{auth.user.email}</p>
              ) : null}
            </div>
          </div>

          <div
            className="v2-profile-account-sync-block"
            data-sync-kind="film"
          >
            <p className="v2-profile-account-sync" data-cloud-sync-label="">
              {filmLabel}
            </p>

            {showFilmAttach ? (
              <div
                className="v2-profile-account-attach"
                data-film-sync-prompt="attach"
                role="group"
                aria-label="Enable film activity sync"
              >
                <p className="v2-profile-account-note">
                  Signing in and enabling film sync are separate choices.
                </p>
                <p className="v2-profile-account-note">
                  Combine this device’s film activity with your Reel Seattle
                  account and keep it synced across devices.
                </p>
                <button
                  type="button"
                  className="v2-profile-account-btn"
                  disabled={filmAttaching}
                  aria-busy={filmAttaching ? 'true' : undefined}
                  onClick={() => {
                    onAuthAction?.('merge-film-sync');
                    void attachFilmPreferencesMerge().then((result) => {
                      if (result.ok) setFilmAttachOpen(false);
                    });
                  }}
                >
                  {filmAttaching
                    ? 'Combining film activity…'
                    : 'Merge and enable sync'}
                </button>
                <button
                  type="button"
                  className="v2-profile-account-btn v2-profile-account-btn-secondary"
                  disabled={filmAttaching}
                  onClick={() => {
                    onAuthAction?.('keep-device-film-sync');
                    declineFilmPreferencesAttach();
                    setFilmAttachOpen(false);
                  }}
                >
                  Keep using this device only
                </button>
              </div>
            ) : null}

            {!filmSync.attached && !showFilmAttach ? (
              <div className="v2-profile-account-sync-actions">
                <p className="v2-profile-account-note">
                  Saved, Seen, and Not Interested can follow you across
                  browsers after you enable film sync.
                </p>
                <button
                  type="button"
                  className="v2-profile-account-btn"
                  disabled={filmAttaching || busy}
                  onClick={() => {
                    onAuthAction?.('enable-film-sync');
                    setFilmAttachOpen(true);
                  }}
                >
                  Enable sync
                </button>
              </div>
            ) : null}

            {filmSync.attached && filmSync.uiStatus === 'synced' ? (
              <div className="v2-profile-account-sync-actions">
                {filmSync.lastSuccessfulSyncAt ? (
                  <p className="v2-profile-account-note">
                    Last film sync{' '}
                    {formatSyncTime(filmSync.lastSuccessfulSyncAt)}
                  </p>
                ) : null}
                <button
                  type="button"
                  className="v2-profile-account-btn v2-profile-account-btn-secondary"
                  disabled={busy}
                  onClick={() => {
                    onAuthAction?.('sync-film-now');
                    void syncFilmPreferencesNow();
                  }}
                >
                  Sync now
                </button>
              </div>
            ) : null}

            {filmSync.attached && filmSync.uiStatus === 'degraded' ? (
              <div className="v2-profile-account-sync-actions">
                <p className="v2-profile-account-note" role="status">
                  {filmSync.lastError ??
                    'Changes are saved on this device. Cloud sync will retry.'}
                </p>
                <button
                  type="button"
                  className="v2-profile-account-btn"
                  disabled={busy}
                  onClick={() => {
                    onAuthAction?.('sync-film-now');
                    void syncFilmPreferencesNow();
                  }}
                >
                  Retry sync
                </button>
              </div>
            ) : null}

            {filmSync.lastError &&
            filmSync.uiStatus !== 'degraded' &&
            !filmSync.attached ? (
              <p className="v2-profile-account-error" role="alert">
                {filmSync.lastError}
              </p>
            ) : null}
          </div>

          <div
            className="v2-profile-account-sync-block"
            data-sync-kind="schedule"
          >
            <p
              className="v2-profile-account-sync"
              data-schedule-sync-label=""
            >
              {scheduleLabel}
            </p>

            {showScheduleAttach ? (
              <div
                className="v2-profile-account-attach"
                data-schedule-sync-prompt="attach"
                role="group"
                aria-label="Enable schedule sync"
              >
                <p className="v2-profile-account-note">
                  Sync accepted plans across browsers. This does not sync
                  planner drafts or calendar settings.
                </p>
                <p className="v2-profile-account-note">
                  Combine this device’s My Schedule with your Reel Seattle
                  account and keep it synced across devices.
                </p>
                <button
                  type="button"
                  className="v2-profile-account-btn"
                  disabled={scheduleAttaching}
                  aria-busy={scheduleAttaching ? 'true' : undefined}
                  onClick={() => {
                    onAuthAction?.('merge-schedule-sync');
                    void attachScheduleMerge().then((result) => {
                      if (result.ok) setScheduleAttachOpen(false);
                    });
                  }}
                >
                  {scheduleAttaching
                    ? 'Combining schedules…'
                    : 'Merge and enable schedule sync'}
                </button>
                <button
                  type="button"
                  className="v2-profile-account-btn v2-profile-account-btn-secondary"
                  disabled={scheduleAttaching}
                  onClick={() => {
                    onAuthAction?.('keep-device-schedule-sync');
                    declineScheduleAttach();
                    setScheduleAttachOpen(false);
                  }}
                >
                  Keep this device only
                </button>
              </div>
            ) : null}

            {!scheduleSync.attached && !showScheduleAttach ? (
              <div className="v2-profile-account-sync-actions">
                <p className="v2-profile-account-note">
                  Sync accepted plans across browsers. This does not sync
                  planner drafts or calendar settings.
                </p>
                <button
                  type="button"
                  className="v2-profile-account-btn"
                  disabled={scheduleAttaching || busy}
                  onClick={() => {
                    onAuthAction?.('enable-schedule-sync');
                    setScheduleAttachOpen(true);
                  }}
                >
                  Enable schedule sync
                </button>
              </div>
            ) : null}

            {scheduleSync.attached && scheduleSync.uiStatus === 'synced' ? (
              <div className="v2-profile-account-sync-actions">
                {scheduleSync.lastSuccessfulSyncAt ? (
                  <p className="v2-profile-account-note">
                    Last schedule sync{' '}
                    {formatSyncTime(scheduleSync.lastSuccessfulSyncAt)}
                  </p>
                ) : null}
                <button
                  type="button"
                  className="v2-profile-account-btn v2-profile-account-btn-secondary"
                  disabled={busy}
                  onClick={() => {
                    onAuthAction?.('sync-schedule-now');
                    void syncScheduleNow();
                  }}
                >
                  Sync now
                </button>
              </div>
            ) : null}

            {scheduleSync.attached &&
            scheduleSync.uiStatus === 'degraded' ? (
              <div className="v2-profile-account-sync-actions">
                <p className="v2-profile-account-note" role="status">
                  {scheduleSync.lastError ??
                    'Schedule changes are saved on this device. Cloud sync will retry.'}
                </p>
                <button
                  type="button"
                  className="v2-profile-account-btn"
                  disabled={busy}
                  onClick={() => {
                    onAuthAction?.('sync-schedule-now');
                    void syncScheduleNow();
                  }}
                >
                  Retry schedule sync
                </button>
              </div>
            ) : null}

            {scheduleSync.lastError &&
            scheduleSync.uiStatus !== 'degraded' &&
            !scheduleSync.attached ? (
              <p className="v2-profile-account-error" role="alert">
                {scheduleSync.lastError}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            className="v2-profile-account-btn v2-profile-account-btn-secondary"
            disabled={busy}
            onClick={() => void handleSignOut()}
          >
            {busy ? 'Signing out…' : 'Sign out'}
          </button>
          {auth.errorMessage ? (
            <p className="v2-profile-account-error" role="alert">
              {auth.errorMessage}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/**
 * @param {string} iso
 */
function formatSyncTime(iso) {
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
