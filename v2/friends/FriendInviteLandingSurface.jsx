import { useEffect, useState } from 'react';
import { signInWithGoogle } from '../auth/authSessionStore.js';
import { useAuth } from '../auth/useAuth.js';
import {
  acceptFriendInvite,
  lookupFriendInvite,
} from './friendsApi.js';
import { isLikelyFriendInviteToken } from './friendsModel.js';
import {
  FRIENDS_COPY,
  alreadyFriendsCopy,
  friendDisplayLabel,
  inviteFailureCopy,
  invitedYouCopy,
  nowFriendsCopy,
} from './friendsCopy.js';
import { refreshFriends } from './friendsStore.js';
import FriendAvatar from './FriendAvatar.jsx';

/**
 * @param {{
 *   token: string,
 *   onViewFriends?: () => void,
 *   onNotNow?: () => void,
 * }} props
 */
export default function FriendInviteLandingSurface({
  token,
  onViewFriends,
  onNotNow,
}) {
  const auth = useAuth();
  const [status, setStatus] = useState('loading');
  const [invite, setInvite] = useState(null);
  const [reason, setReason] = useState(null);
  const [busy, setBusy] = useState(false);
  const [signInBusy, setSignInBusy] = useState(false);

  const validToken = isLikelyFriendInviteToken(token);

  const load = async () => {
    if (!validToken) {
      setStatus('error');
      setReason('invite_not_found');
      setInvite(null);
      return;
    }
    setStatus('loading');
    setReason(null);
    const result = await lookupFriendInvite(token);
    if (!result.ok) {
      setInvite(null);
      setReason(result.reason);
      setStatus('error');
      return;
    }
    setInvite(result.invite);
    setStatus('ready');
  };

  useEffect(() => {
    void load();
    // Re-lookup after sign-in so already-friends / self can resolve.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, auth.user?.id]);

  const inviterName = friendDisplayLabel(invite?.inviter?.displayName);
  const signedIn = Boolean(auth.signedIn && auth.user?.id);
  const isSelf =
    signedIn && invite?.inviter?.userId && invite.inviter.userId === auth.user.id;
  const alreadyFriends = Boolean(invite?.alreadyFriends);

  const handleSignIn = async () => {
    if (signInBusy || !validToken) return;
    setSignInBusy(true);
    await signInWithGoogle({ returnToInviteToken: token });
    setSignInBusy(false);
  };

  const handleAccept = async () => {
    if (busy || !validToken) return;
    setBusy(true);
    const result = await acceptFriendInvite(token);
    setBusy(false);
    if (!result.ok) {
      setStatus('error');
      setReason(result.reason);
      return;
    }
    await refreshFriends(auth.user?.id);
    if (result.alreadyFriends) {
      setStatus('already');
      return;
    }
    setStatus('success');
  };

  let body = null;
  if (!validToken || (status === 'error' && !invite)) {
    body = (
      <div className="v2-friends-landing-state" data-invite-landing="error">
        <p className="v2-friends-confirm-title">{inviteFailureCopy(reason)}</p>
        {reason !== 'invite_not_found' &&
        reason !== 'invite_expired' &&
        reason !== 'invite_revoked' &&
        reason !== 'invite_accepted' &&
        reason !== 'cannot_friend_self' ? (
          <button
            type="button"
            className="v2-profile-link"
            data-friends-action="retry-landing"
            onClick={() => void load()}
          >
            {FRIENDS_COPY.retry}
          </button>
        ) : null}
      </div>
    );
  } else if (status === 'loading') {
    body = (
      <p className="v2-friends-preview-helper" data-invite-landing="loading">
        {FRIENDS_COPY.landingLoad}
      </p>
    );
  } else if (status === 'success') {
    body = (
      <div className="v2-friends-landing-state" data-invite-landing="success">
        <FriendAvatar
          displayName={invite?.inviter?.displayName}
          avatarUrl={invite?.inviter?.avatarUrl}
          size="lg"
        />
        <h1 className="v2-friends-confirm-title">{nowFriendsCopy(inviterName)}</h1>
        <div className="v2-friends-invite-actions">
          <button
            type="button"
            className="v2-profile-account-btn"
            data-friends-action="view-friends"
            onClick={() => onViewFriends?.()}
          >
            {FRIENDS_COPY.viewFriends}
          </button>
          <button
            type="button"
            className="v2-profile-account-btn v2-profile-account-btn-secondary"
            onClick={() => onNotNow?.()}
          >
            {FRIENDS_COPY.done}
          </button>
        </div>
      </div>
    );
  } else if (isSelf) {
    body = (
      <div className="v2-friends-landing-state" data-invite-landing="self">
        <FriendAvatar
          displayName={invite?.inviter?.displayName}
          avatarUrl={invite?.inviter?.avatarUrl}
          size="lg"
        />
        <h1 className="v2-friends-confirm-title">{FRIENDS_COPY.landingSelf}</h1>
      </div>
    );
  } else if (alreadyFriends || status === 'already') {
    body = (
      <div className="v2-friends-landing-state" data-invite-landing="already">
        <FriendAvatar
          displayName={invite?.inviter?.displayName}
          avatarUrl={invite?.inviter?.avatarUrl}
          size="lg"
        />
        <h1 className="v2-friends-confirm-title">
          {alreadyFriendsCopy(inviterName)}
        </h1>
        <button
          type="button"
          className="v2-profile-account-btn"
          onClick={() => onViewFriends?.()}
        >
          {FRIENDS_COPY.viewFriends}
        </button>
      </div>
    );
  } else {
    body = (
      <div className="v2-friends-landing-state" data-invite-landing="ready">
        <FriendAvatar
          displayName={invite?.inviter?.displayName}
          avatarUrl={invite?.inviter?.avatarUrl}
          size="lg"
        />
        <p className="v2-friends-landing-brand">Reel Seattle</p>
        <h1 className="v2-friends-confirm-title">{invitedYouCopy(inviterName)}</h1>
        {status === 'error' ? (
          <p className="v2-friends-error" role="status">
            {inviteFailureCopy(reason)}
          </p>
        ) : null}
        {signedIn ? (
          <div className="v2-friends-invite-actions">
            <button
              type="button"
              className="v2-profile-account-btn"
              data-friends-action="accept-invite"
              disabled={busy}
              onClick={() => void handleAccept()}
            >
              {FRIENDS_COPY.accept}
            </button>
            <button
              type="button"
              className="v2-profile-account-btn v2-profile-account-btn-secondary"
              onClick={() => onNotNow?.()}
            >
              {FRIENDS_COPY.notNow}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="v2-profile-account-btn"
            data-friends-action="landing-google"
            disabled={signInBusy}
            onClick={() => void handleSignIn()}
          >
            {signInBusy ? 'Signing in…' : FRIENDS_COPY.signInLabel}
          </button>
        )}
      </div>
    );
  }

  return (
    <section className="v2-friends-landing" data-invite-token={validToken ? 'ok' : 'invalid'}>
      {body}
    </section>
  );
}
