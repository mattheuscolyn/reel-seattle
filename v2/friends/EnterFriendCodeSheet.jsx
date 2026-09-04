import { useState } from 'react';
import {
  acceptFriendInvite,
  lookupFriendInvite,
} from './friendsApi.js';
import { normalizeFriendInviteCode } from './friendsModel.js';
import {
  FRIENDS_COPY,
  connectWithTitle,
  friendDisplayLabel,
  inviteFailureCopy,
  invitedYouCopy,
  nowFriendsCopy,
} from './friendsCopy.js';
import { refreshFriends } from './friendsStore.js';
import FriendAvatar from './FriendAvatar.jsx';
import FriendsSheet from './FriendsSheet.jsx';

/**
 * @param {{
 *   open: boolean,
 *   userId?: string | null,
 *   onClose?: () => void,
 *   onAccepted?: () => void,
 * }} props
 */
export default function EnterFriendCodeSheet({
  open,
  userId = null,
  onClose,
  onAccepted,
}) {
  const [code, setCode] = useState('');
  const [phase, setPhase] = useState('input');
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setCode('');
    setPhase('input');
    setInvite(null);
    setError(null);
    setBusy(false);
  };

  const handleClose = () => {
    reset();
    onClose?.();
  };

  if (!open) return null;

  const inviterName = friendDisplayLabel(invite?.inviter?.displayName);

  const handleLookup = async () => {
    const normalized = normalizeFriendInviteCode(code);
    if (normalized.length !== 8) {
      setError(FRIENDS_COPY.codeInvalidLength);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await lookupFriendInvite(normalized);
    setBusy(false);
    if (!result.ok) {
      setError(inviteFailureCopy(result.reason));
      return;
    }
    setInvite(result.invite);
    setPhase('confirm');
  };

  const handleAccept = async () => {
    const normalized = normalizeFriendInviteCode(code);
    if (busy || !normalized) return;
    setBusy(true);
    setError(null);
    const result = await acceptFriendInvite(normalized);
    setBusy(false);
    if (!result.ok) {
      setError(inviteFailureCopy(result.reason));
      return;
    }
    await refreshFriends(userId);
    setPhase('success');
    onAccepted?.();
  };

  return (
    <FriendsSheet title={FRIENDS_COPY.codeSheetTitle} onClose={handleClose}>
      {phase === 'input' ? (
        <>
          <p className="v2-friends-sheet-lead">{FRIENDS_COPY.codeHelper}</p>
          <label className="v2-friends-code-label" htmlFor="v2-friend-invite-code">
            {FRIENDS_COPY.inviteCode}
          </label>
          <input
            id="v2-friend-invite-code"
            className="v2-friends-code-input"
            data-friends-code-input=""
            value={code}
            maxLength={8}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
            onChange={(event) =>
              setCode(normalizeFriendInviteCode(event.target.value))
            }
          />
          {error ? (
            <p className="v2-friends-error" role="status">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            className="v2-profile-account-btn"
            data-friends-action="lookup-code"
            disabled={busy}
            onClick={() => void handleLookup()}
          >
            Continue
          </button>
        </>
      ) : null}

      {phase === 'confirm' && invite ? (
        <div className="v2-friends-confirm" data-friends-code="confirm">
          <FriendAvatar
            displayName={invite.inviter?.displayName}
            avatarUrl={invite.inviter?.avatarUrl}
            size="lg"
          />
          <h3 className="v2-friends-confirm-title">{connectWithTitle(inviterName)}</h3>
          <p className="v2-friends-sheet-lead">{invitedYouCopy(inviterName)}</p>
          {error ? (
            <p className="v2-friends-error" role="status">
              {error}
            </p>
          ) : null}
          <div className="v2-friends-invite-actions">
            <button
              type="button"
              className="v2-profile-account-btn"
              data-friends-action="accept-code"
              disabled={busy}
              onClick={() => void handleAccept()}
            >
              {FRIENDS_COPY.accept}
            </button>
            <button
              type="button"
              className="v2-profile-account-btn v2-profile-account-btn-secondary"
              onClick={handleClose}
            >
              {FRIENDS_COPY.cancel}
            </button>
          </div>
        </div>
      ) : null}

      {phase === 'success' ? (
        <div className="v2-friends-confirm" data-friends-code="success">
          <p className="v2-friends-confirm-title">{nowFriendsCopy(inviterName)}</p>
          <button
            type="button"
            className="v2-profile-account-btn"
            onClick={handleClose}
          >
            {FRIENDS_COPY.done}
          </button>
        </div>
      ) : null}
    </FriendsSheet>
  );
}
