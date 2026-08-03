/**
 * Compact Profile account block (T-AUTH-01 / T-ACCOUNT-CLOUD-SYNC-FILMS-01).
 * Preserves approved Profile layout — no new tabs/cards redesign.
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
  const [attachPromptOpen, setAttachPromptOpen] = useState(false);

  useEffect(() => {
    return subscribeFilmPreferencesSync((snap) => {
      setFilmSync(snap);
    });
  }, []);

  const displayName = resolveAuthDisplayName(auth.user, auth.profile);
  const avatarUrl = resolveAuthAvatarUrl(auth.profile);
  const busy =
    auth.status === 'loading' || Boolean(auth.authActionBusy);
  const cloudLabel = getCloudSyncStatusLabel();
  const attaching = filmSync.uiStatus === 'attaching' || filmSync.attaching;

  const handleGoogle = async () => {
    if (busy) return;
    onAuthAction?.('sign-in-google');
    await signInWithGoogle();
  };

  const handleSignOut = async () => {
    if (busy) return;
    onAuthAction?.('sign-out');
    setAttachPromptOpen(false);
    await signOut();
  };

  const handleEnableSync = () => {
    onAuthAction?.('enable-film-sync');
    setAttachPromptOpen(true);
  };

  const handleMergeAttach = async () => {
    if (attaching) return;
    onAuthAction?.('merge-film-sync');
    const result = await attachFilmPreferencesMerge();
    if (result.ok) {
      setAttachPromptOpen(false);
    }
  };

  const handleKeepDeviceOnly = () => {
    onAuthAction?.('keep-device-film-sync');
    declineFilmPreferencesAttach();
    setAttachPromptOpen(false);
  };

  const handleSyncNow = async () => {
    if (attaching) return;
    onAuthAction?.('sync-film-now');
    await syncFilmPreferencesNow();
  };

  const showAttachPrompt =
    auth.status === 'signed_in' &&
    auth.user &&
    !filmSync.attached &&
    (attachPromptOpen || filmSync.uiStatus === 'attaching');

  return (
    <section
      className="v2-profile-section v2-profile-account"
      data-profile-section="account"
      data-auth-status={auth.status}
      data-cloud-sync={auth.cloudSyncStatus}
      data-film-sync={filmSync.uiStatus}
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
            Sign in to enable optional backup of Saved, Seen, and Not
            Interested across browsers. Signing in alone does not move your
            film activity.
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
              <p className="v2-profile-account-sync" data-cloud-sync-label="">
                {cloudLabel}
              </p>
            </div>
          </div>

          {showAttachPrompt ? (
            <div
              className="v2-profile-account-attach"
              data-film-sync-prompt="attach"
              role="group"
              aria-label="Enable film activity sync"
            >
              <p className="v2-profile-account-note">
                Signing in and enabling sync are separate choices. Combine this
                device’s film activity with your Reel Seattle account only when
                you are ready.
              </p>
              <p className="v2-profile-account-note">
                Combine this device’s film activity with your Reel Seattle
                account and keep it synced across devices.
              </p>
              <button
                type="button"
                className="v2-profile-account-btn"
                disabled={attaching}
                aria-busy={attaching ? 'true' : undefined}
                onClick={() => void handleMergeAttach()}
              >
                {attaching
                  ? 'Combining film activity…'
                  : 'Merge and enable sync'}
              </button>
              <button
                type="button"
                className="v2-profile-account-btn v2-profile-account-btn-secondary"
                disabled={attaching}
                onClick={handleKeepDeviceOnly}
              >
                Keep using this device only
              </button>
              <p className="v2-profile-account-note">
                Keep your film activity only in this browser for now. My
                Schedule stays on this device either way.
              </p>
            </div>
          ) : null}

          {!filmSync.attached && !showAttachPrompt ? (
            <div className="v2-profile-account-sync-actions">
              <p className="v2-profile-account-note">
                Saved, Seen, and Not Interested can follow you across browsers
                after you enable sync. My Schedule is not synced yet.
              </p>
              <button
                type="button"
                className="v2-profile-account-btn"
                disabled={attaching || busy}
                onClick={handleEnableSync}
              >
                Enable sync
              </button>
            </div>
          ) : null}

          {filmSync.attached && filmSync.uiStatus === 'synced' ? (
            <div className="v2-profile-account-sync-actions">
              {filmSync.lastSuccessfulSyncAt ? (
                <p className="v2-profile-account-note">
                  Last synced{' '}
                  {formatSyncTime(filmSync.lastSuccessfulSyncAt)}
                </p>
              ) : null}
              <button
                type="button"
                className="v2-profile-account-btn v2-profile-account-btn-secondary"
                disabled={busy}
                onClick={() => void handleSyncNow()}
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
                onClick={() => void handleSyncNow()}
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
