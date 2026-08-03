/**
 * Compact Profile account block (T-AUTH-01 / T-ACCOUNT-CLOUD-AUTH-01).
 * Preserves approved Profile layout — no new tabs/cards redesign.
 */

import {
  initialsFromDisplayName,
  resolveAuthAvatarUrl,
  resolveAuthDisplayName,
  signInWithGoogle,
  signOut,
} from './authSessionStore.js';
import { getCloudSyncStatusLabel } from './cloudSyncStatus.js';
import { useAuth } from './useAuth.js';

/**
 * @param {{
 *   onAuthAction?: (actionId: string) => void,
 * }} [props]
 */
export default function ProfileAccountPanel({ onAuthAction }) {
  const auth = useAuth();
  const displayName = resolveAuthDisplayName(auth.user, auth.profile);
  const avatarUrl = resolveAuthAvatarUrl(auth.profile);
  const busy =
    auth.status === 'loading' || Boolean(auth.authActionBusy);
  const cloudLabel = getCloudSyncStatusLabel();

  const handleGoogle = async () => {
    if (busy) return;
    onAuthAction?.('sign-in-google');
    await signInWithGoogle();
  };

  const handleSignOut = async () => {
    if (busy) return;
    onAuthAction?.('sign-out');
    await signOut();
  };

  return (
    <section
      className="v2-profile-section v2-profile-account"
      data-profile-section="account"
      data-auth-status={auth.status}
      data-cloud-sync={auth.cloudSyncStatus}
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
            Sign in to prepare backup and cross-device access. Cloud sync is not
            active yet.
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
