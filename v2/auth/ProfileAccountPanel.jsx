/**
 * Profile account actions — exceptional sync banners + Account & Security.
 * Healthy attached sync renders nothing (T-ACCOUNT-CLOUD-SYNC + Profile Slice 1).
 */

import { useEffect, useState } from 'react';
import {
  signInWithGoogle,
  signOut,
} from './authSessionStore.js';
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
  getScheduleSyncSnapshot,
  subscribeScheduleSync,
  syncScheduleNow,
} from './scheduleSync.js';
import { useAuth } from './useAuth.js';
import {
  filmSyncNeedsAttention,
  scheduleSyncNeedsAttention,
  syncAttentionIsRecovery,
} from '../profile/profileSyncAttention.js';

const ATTACHED_SYNC_NOW_STATUSES = new Set([
  'synced',
  'syncing',
  'pending_local',
  'offline_pending',
  'retry_scheduled',
  'degraded',
]);

/**
 * @param {{
 *   onAuthAction?: (actionId: string) => void,
 *   variant?: 'sync-attention' | 'account-security',
 *   showHeading?: boolean,
 * }} [props]
 */
export default function ProfileAccountPanel({
  onAuthAction,
  variant = 'sync-attention',
  showHeading = true,
}) {
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

  const busy =
    auth.status === 'loading' || Boolean(auth.authActionBusy);
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

  if (variant === 'account-security') {
    return (
      <section
        className="v2-profile-account v2-profile-account-security"
        data-profile-section="account"
        data-auth-status={auth.status}
        aria-labelledby={showHeading ? 'v2-profile-account-h' : undefined}
        aria-label={showHeading ? undefined : 'Account & Security'}
      >
        {showHeading ? (
          <h2 id="v2-profile-account-h" className="v2-profile-section-label">
            Account &amp; Security
          </h2>
        ) : null}

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
              Sign in to enable optional backup of film activity and Planner
              across browsers. Signing in alone does not move your data.
            </p>
            <p className="v2-profile-account-note">
              Reel Seattle still works fully without an account. Local Saved,
              Seen, Not Interested, and Planner stay on this device.
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
            {auth.user.email ? (
              <p className="v2-profile-account-email">{auth.user.email}</p>
            ) : null}
            <p className="v2-profile-account-note">Signed in with Google</p>
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

  const showFilmAttention =
    auth.status === 'signed_in' &&
    auth.user &&
    filmSyncNeedsAttention(filmSync);
  const showScheduleAttention =
    auth.status === 'signed_in' &&
    auth.user &&
    scheduleSyncNeedsAttention(scheduleSync);
  const showAuthReconnect =
    auth.status === 'error' && !auth.user;

  if (!showFilmAttention && !showScheduleAttention && !showAuthReconnect) {
    return null;
  }

  const showFilmAttach =
    showFilmAttention &&
    !filmSync.attached &&
    (filmAttachOpen || filmSync.uiStatus === 'attaching');
  const showScheduleAttach =
    showScheduleAttention &&
    !scheduleSync.attached &&
    (scheduleAttachOpen || scheduleSync.uiStatus === 'attaching');
  const showFilmRecovery =
    showFilmAttention &&
    filmSync.attached &&
    syncAttentionIsRecovery(filmSync.uiStatus) &&
    ATTACHED_SYNC_NOW_STATUSES.has(filmSync.uiStatus);
  const showScheduleRecovery =
    showScheduleAttention &&
    scheduleSync.attached &&
    syncAttentionIsRecovery(scheduleSync.uiStatus) &&
    ATTACHED_SYNC_NOW_STATUSES.has(scheduleSync.uiStatus);

  return (
    <section
      className="v2-profile-sync-attention"
      data-profile-section="syncAttention"
      data-auth-status={auth.status}
      data-film-sync={filmSync.uiStatus}
      data-schedule-sync={scheduleSync.uiStatus}
      aria-label="Sync needs attention"
    >
      {showAuthReconnect ? (
        <div className="v2-profile-sync-banner" data-sync-kind="auth">
          <p className="v2-profile-sync-banner-title">Reconnect required</p>
          <p className="v2-profile-account-note" role="alert">
            {auth.errorMessage ??
              'Account sign-in is temporarily unavailable.'}
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

      {showFilmAttention ? (
        <div
          className="v2-profile-sync-banner"
          data-sync-kind="film"
        >
          <p className="v2-profile-sync-banner-title">
            {filmSync.attached
              ? 'Film sync needs attention'
              : 'Finish setting up sync'}
          </p>
          <p className="v2-profile-account-note">
            {filmSync.attached
              ? filmSync.lastError ||
                'Saved on this device — cloud sync needs attention'
              : 'Your film data on this browser isn’t synced yet.'}
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
          ) : null}

          {showFilmRecovery ? (
            <button
              type="button"
              className="v2-profile-account-btn"
              disabled={busy}
              onClick={() => {
                onAuthAction?.('sync-film-now');
                void syncFilmPreferencesNow();
              }}
            >
              Retry film sync
            </button>
          ) : null}

          {filmSync.lastError &&
          filmSync.uiStatus !== 'degraded' &&
          !filmSync.attached ? (
            <p className="v2-profile-account-error" role="alert">
              {filmSync.lastError}
            </p>
          ) : null}
        </div>
      ) : null}

      {showScheduleAttention ? (
        <div
          className="v2-profile-sync-banner"
          data-sync-kind="schedule"
        >
          <p className="v2-profile-sync-banner-title">
            {scheduleSync.attached
              ? 'Planner sync needs attention'
              : 'Finish setting up Planner sync'}
          </p>
          <p className="v2-profile-account-note">
            {scheduleSync.attached
              ? scheduleSync.lastError ||
                'Saved on this device — cloud sync needs attention'
              : 'Accepted plans on this browser aren’t synced yet. This does not sync planner drafts or calendar settings.'}
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
                Combine this device’s Planner with your Reel Seattle
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
          ) : null}

          {showScheduleRecovery ? (
            <button
              type="button"
              className="v2-profile-account-btn"
              disabled={busy}
              onClick={() => {
                onAuthAction?.('sync-schedule-now');
                void syncScheduleNow();
              }}
            >
              Retry Planner sync
            </button>
          ) : null}

          {scheduleSync.lastError &&
          scheduleSync.uiStatus !== 'degraded' &&
          !scheduleSync.attached ? (
            <p className="v2-profile-account-error" role="alert">
              {scheduleSync.lastError}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
