import { useState } from 'react';
import {
  createFriendInvite,
  revokeFriendInvite,
} from './friendsApi.js';
import { FRIENDS_COPY } from './friendsCopy.js';
import { copyInviteValue, shareOrCopyInviteLink } from './inviteShare.js';
import FriendsSheet from './FriendsSheet.jsx';

/**
 * @param {{
 *   open: boolean,
 *   onClose?: () => void,
 * }} props
 */
export default function InviteFriendSheet({ open, onClose }) {
  const [phase, setPhase] = useState('idle');
  const [invite, setInvite] = useState(null);
  const [inviteUrl, setInviteUrl] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(null);

  const reset = () => {
    setPhase('idle');
    setInvite(null);
    setInviteUrl(null);
    setBusy(false);
    setError(null);
    setCopied(null);
  };

  const handleClose = () => {
    reset();
    onClose?.();
  };

  if (!open) return null;

  const flashCopied = (message) => {
    setCopied(message);
    window.setTimeout(() => setCopied(null), 1800);
  };

  const handleCreate = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await createFriendInvite();
    setBusy(false);
    if (!result.ok) {
      setError(FRIENDS_COPY.landingNetwork);
      return;
    }
    setInvite(result.invite);
    setInviteUrl(result.inviteUrl);
    setPhase('ready');
  };

  const handleCopyLink = async () => {
    if (!inviteUrl) return;
    const result = await copyInviteValue(inviteUrl);
    if (result.ok) flashCopied(FRIENDS_COPY.inviteLinkCopied);
  };

  const handleCopyCode = async () => {
    const code = invite?.shortCode;
    if (!code) return;
    const result = await copyInviteValue(code);
    if (result.ok) flashCopied(FRIENDS_COPY.copied);
  };

  const handleShare = async () => {
    if (!inviteUrl) return;
    const result = await shareOrCopyInviteLink(inviteUrl);
    if (result.ok && result.method === 'copy') {
      flashCopied(FRIENDS_COPY.inviteLinkCopied);
    }
  };

  const handleRevoke = async () => {
    if (!invite?.inviteId || busy) return;
    setBusy(true);
    setError(null);
    const result = await revokeFriendInvite(invite.inviteId);
    setBusy(false);
    if (!result.ok) {
      setError(FRIENDS_COPY.landingNetwork);
      return;
    }
    setPhase('canceled');
    setInvite(null);
    setInviteUrl(null);
  };

  const canShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <FriendsSheet title={FRIENDS_COPY.inviteSheetTitle} onClose={handleClose}>
      <p className="v2-friends-sheet-lead">{FRIENDS_COPY.inviteExplanation}</p>

      {error ? (
        <p className="v2-friends-error" role="status">
          {error}
        </p>
      ) : null}

      {copied ? (
        <p className="v2-friends-copied" role="status">
          {copied}
        </p>
      ) : null}

      {phase === 'idle' || phase === 'canceled' ? (
        <>
          {phase === 'canceled' ? (
            <p className="v2-friends-sheet-note" role="status">
              {FRIENDS_COPY.inviteCanceled}
            </p>
          ) : null}
          <button
            type="button"
            className="v2-profile-account-btn"
            data-friends-action="create-invite"
            disabled={busy}
            onClick={() => void handleCreate()}
          >
            {phase === 'canceled'
              ? FRIENDS_COPY.createNewInvite
              : FRIENDS_COPY.createInvite}
          </button>
        </>
      ) : null}

      {phase === 'ready' && invite ? (
        <div className="v2-friends-invite-ready" data-friends-invite="ready">
          <div className="v2-friends-invite-block">
            <p className="v2-friends-invite-label">{FRIENDS_COPY.inviteLink}</p>
            <p className="v2-friends-invite-url">{inviteUrl}</p>
            <div className="v2-friends-invite-actions">
              <button
                type="button"
                className="v2-profile-account-btn v2-profile-account-btn-secondary"
                data-friends-action="copy-link"
                onClick={() => void handleCopyLink()}
              >
                {FRIENDS_COPY.copyLink}
              </button>
              {canShare ? (
                <button
                  type="button"
                  className="v2-profile-account-btn"
                  data-friends-action="share-link"
                  onClick={() => void handleShare()}
                >
                  {FRIENDS_COPY.share}
                </button>
              ) : null}
            </div>
          </div>

          {invite.shortCode ? (
            <div className="v2-friends-invite-block">
              <p className="v2-friends-invite-label">{FRIENDS_COPY.inviteCode}</p>
              <p className="v2-friends-invite-code" data-friends-invite-code="">
                {invite.shortCode}
              </p>
              <button
                type="button"
                className="v2-profile-account-btn v2-profile-account-btn-secondary"
                data-friends-action="copy-code"
                onClick={() => void handleCopyCode()}
              >
                {FRIENDS_COPY.copyCode}
              </button>
            </div>
          ) : null}

          <p className="v2-friends-sheet-note">{FRIENDS_COPY.shareHelper}</p>

          <button
            type="button"
            className="v2-friends-text-danger"
            data-friends-action="revoke-invite"
            disabled={busy}
            onClick={() => void handleRevoke()}
          >
            {FRIENDS_COPY.cancelInvite}
          </button>
        </div>
      ) : null}
    </FriendsSheet>
  );
}
