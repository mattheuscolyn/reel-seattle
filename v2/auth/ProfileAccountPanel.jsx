/**
 * Compact Profile account block (T-AUTH-01).
 * Preserves approved Profile layout — no new tabs/cards redesign.
 */

import {
  initialsFromDisplayName,
  resolveAuthDisplayName,
  signInWithGoogle,
  signOut,
} from './authSessionStore.js';
import { useAuth } from './useAuth.js';

/**
 * @param {{
 *   onAuthAction?: (actionId: string) => void,
 * }} [props]
 */
export default function ProfileAccountPanel({ onAuthAction }) {
  const auth = useAuth();
  const displayName = resolveAuthDisplayName(auth.user, auth.profile);
  const busy = auth.status === 'loading';

  const handleGoogle = async () => {
    onAuthAction?.('sign-in-google');
    await signInWithGoogle();
  };

  const handleSignOut = async () => {
    onAuthAction?.('sign-out');
    await signOut();
  };

  return (
    <section
      className="v2-profile-section v2-profile-account"
      data-profile-section="account"
      data-auth-status={auth.status}
      aria-labelledby="v2-profile-account-h"
    >
      <h2 id="v2-profile-account-h" className="v2-profile-section-label">
        Account
      </h2>

      {auth.status === 'unconfigured' ? (
        <p className="v2-profile-account-note" role="status">
          Account sign-in is not configured in this build.
        </p>
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
          <button
            type="button"
            className="v2-profile-account-btn"
            onClick={() => void handleGoogle()}
          >
            Continue with Google
          </button>
        </div>
      ) : null}

      {auth.status === 'signed_out' ? (
        <div className="v2-profile-account-body">
          <p className="v2-profile-account-note">
            Sign in to prepare for future sync across devices. Local Saved,
            Seen, and plans on this device stay on this device for now.
          </p>
          <button
            type="button"
            className="v2-profile-account-btn"
            disabled={busy}
            onClick={() => void handleGoogle()}
          >
            Continue with Google
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
            <span className="v2-profile-account-avatar" aria-hidden="true">
              {initialsFromDisplayName(displayName)}
            </span>
            <div>
              <p className="v2-profile-account-name">
                {displayName ?? 'Signed in'}
              </p>
              {auth.user.email ? (
                <p className="v2-profile-account-email">{auth.user.email}</p>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            className="v2-profile-account-btn v2-profile-account-btn-secondary"
            onClick={() => void handleSignOut()}
          >
            Sign out
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
