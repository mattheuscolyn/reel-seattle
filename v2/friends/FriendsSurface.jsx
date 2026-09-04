import { useEffect, useState } from 'react';
import { IconMore } from '../icons.jsx';
import { useAuth } from '../auth/useAuth.js';
import {
  FRIENDS_COPY,
  friendDisplayLabel,
  removeFriendTitle,
} from './friendsCopy.js';
import { removeFriendAndRefresh } from './friendsStore.js';
import { useFriends } from './useFriends.js';
import FriendAvatar from './FriendAvatar.jsx';
import InviteFriendSheet from './InviteFriendSheet.jsx';
import EnterFriendCodeSheet from './EnterFriendCodeSheet.jsx';

/**
 * @param {{
 *   focusUserId?: string | null,
 * }} [props]
 */
export default function FriendsSurface({ focusUserId = null }) {
  const auth = useAuth();
  const { friends, status, signedIn, refresh } = useFriends();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [menuUserId, setMenuUserId] = useState(null);
  const [confirmUserId, setConfirmUserId] = useState(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState(null);

  useEffect(() => {
    if (!focusUserId) return;
    const el = document.querySelector(
      `[data-friend-row="${CSS.escape(focusUserId)}"]`,
    );
    el?.scrollIntoView({ block: 'nearest' });
  }, [focusUserId, friends.length]);

  const handleRemove = async (friend) => {
    if (removeBusy) return;
    setRemoveBusy(true);
    setRemoveError(null);
    const result = await removeFriendAndRefresh(friend.userId, auth.user?.id);
    setRemoveBusy(false);
    if (!result.ok) {
      setRemoveError(FRIENDS_COPY.loadError);
      return;
    }
    setConfirmUserId(null);
    setMenuUserId(null);
  };

  const confirming = friends.find((friend) => friend.userId === confirmUserId);

  return (
    <section className="v2-friends" aria-labelledby="v2-friends-title" data-friends-surface="">
      <header className="v2-friends-header">
        <div className="v2-friends-header-row">
          <h1 id="v2-friends-title" className="v2-friends-title">
            {FRIENDS_COPY.sectionTitle}
          </h1>
          {signedIn ? (
            <button
              type="button"
              className="v2-profile-link"
              data-friends-action="invite-friend"
              onClick={() => setInviteOpen(true)}
            >
              {FRIENDS_COPY.inviteFriendAction}
            </button>
          ) : null}
        </div>
        {signedIn ? (
          <button
            type="button"
            className="v2-profile-link v2-friends-enter-code"
            data-friends-action="enter-code"
            onClick={() => setCodeOpen(true)}
          >
            {FRIENDS_COPY.enterCode}
          </button>
        ) : null}
      </header>

      {removeError ? (
        <p className="v2-friends-error" role="status">
          {removeError}
        </p>
      ) : null}

      {!signedIn ? (
        <p className="v2-friends-preview-helper">{FRIENDS_COPY.signedOutTitle}</p>
      ) : status === 'error' && friends.length === 0 ? (
        <p className="v2-friends-error" role="status">
          {FRIENDS_COPY.loadError}{' '}
          <button type="button" className="v2-profile-link" onClick={() => void refresh()}>
            {FRIENDS_COPY.retry}
          </button>
        </p>
      ) : status === 'loading' && friends.length === 0 ? (
        <p className="v2-friends-preview-helper">Loading friends…</p>
      ) : friends.length === 0 ? (
        <div className="v2-friends-empty" data-friends-list="empty">
          <p className="v2-friends-preview-helper">{FRIENDS_COPY.emptyHelper}</p>
          <button
            type="button"
            className="v2-profile-account-btn"
            data-friends-action="invite-from-empty"
            onClick={() => setInviteOpen(true)}
          >
            {FRIENDS_COPY.inviteFriend}
          </button>
        </div>
      ) : (
        <ul className="v2-friends-list" data-friends-list="rows">
          {friends.map((friend) => {
            const name = friendDisplayLabel(friend.displayName);
            const menuOpen = menuUserId === friend.userId;
            return (
              <li
                key={friend.userId}
                className="v2-friends-row"
                data-friend-row={friend.userId}
              >
                <FriendAvatar
                  displayName={friend.displayName}
                  avatarUrl={friend.avatarUrl}
                  size="md"
                />
                <span className="v2-friends-row-name">{name}</span>
                <button
                  type="button"
                  className="v2-friends-more"
                  aria-label={`More options for ${name}`}
                  aria-expanded={menuOpen}
                  data-friends-action="row-menu"
                  onClick={() =>
                    setMenuUserId((current) =>
                      current === friend.userId ? null : friend.userId,
                    )
                  }
                >
                  <IconMore width={18} height={18} />
                </button>
                {menuOpen ? (
                  <div className="v2-friends-row-menu" role="menu">
                    <button
                      type="button"
                      className="v2-friends-row-menu-item"
                      role="menuitem"
                      data-friends-action="remove-friend"
                      onClick={() => {
                        setConfirmUserId(friend.userId);
                        setMenuUserId(null);
                      }}
                    >
                      {FRIENDS_COPY.removeFriend}
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {confirming ? (
        <div
          className="v2-friends-sheet-backdrop"
          role="presentation"
          data-friends-confirm="remove"
          onClick={(event) => {
            if (event.target === event.currentTarget) setConfirmUserId(null);
          }}
        >
          <div className="v2-friends-confirm-sheet" role="dialog" aria-modal="true">
            <h2 className="v2-friends-confirm-title">
              {removeFriendTitle(confirming.displayName)}
            </h2>
            <p className="v2-friends-sheet-lead">{FRIENDS_COPY.removeConfirmBody}</p>
            <div className="v2-friends-invite-actions">
              <button
                type="button"
                className="v2-profile-account-btn v2-friends-danger-btn"
                data-friends-action="confirm-remove"
                disabled={removeBusy}
                onClick={() => void handleRemove(confirming)}
              >
                {FRIENDS_COPY.removeFriend}
              </button>
              <button
                type="button"
                className="v2-profile-account-btn v2-profile-account-btn-secondary"
                onClick={() => setConfirmUserId(null)}
              >
                {FRIENDS_COPY.cancel}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <InviteFriendSheet open={inviteOpen} onClose={() => setInviteOpen(false)} />
      <EnterFriendCodeSheet
        open={codeOpen}
        userId={auth.user?.id}
        onClose={() => setCodeOpen(false)}
      />
    </section>
  );
}
