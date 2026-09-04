import { useEffect, useRef, useState } from 'react';
import { signInWithGoogle } from '../auth/authSessionStore.js';
import {
  friendGivenName,
  previewSlotCount,
  splitFriendsForPreview,
} from './friendsModel.js';
import {
  FRIENDS_COPY,
  friendDisplayLabel,
} from './friendsCopy.js';
import { useFriends } from './useFriends.js';
import FriendAvatar from './FriendAvatar.jsx';
import InviteFriendSheet from './InviteFriendSheet.jsx';

/**
 * @param {{
 *   onOpenFriends?: (payload?: { focusUserId?: string | null }) => void,
 * }} [props]
 */
export default function ProfileFriendsPreview({ onOpenFriends }) {
  const { friends, status, signedIn, refresh } = useFriends();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [signInBusy, setSignInBusy] = useState(false);
  const rowRef = useRef(null);
  const [rowWidth, setRowWidth] = useState(390);

  useEffect(() => {
    const el = rowRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect?.width;
      if (typeof width === 'number' && width > 0) setRowWidth(width);
    });
    observer.observe(el);
    setRowWidth(el.clientWidth || 390);
    return () => observer.disconnect();
  }, [signedIn, friends.length]);

  const slots = previewSlotCount(rowWidth);
  const { visible, overflow } = splitFriendsForPreview(friends, slots);
  const hasFriends = friends.length > 0;

  const handleSignIn = async () => {
    if (signInBusy) return;
    setSignInBusy(true);
    await signInWithGoogle();
    setSignInBusy(false);
  };

  return (
    <section
      className="v2-profile-section"
      data-profile-section="friends"
      aria-labelledby="v2-profile-friends-h"
    >
      <div className="v2-profile-section-row">
        <h2 id="v2-profile-friends-h" className="v2-profile-section-label">
          {FRIENDS_COPY.sectionTitle}
        </h2>
        {signedIn && hasFriends ? (
          <button
            type="button"
            className="v2-profile-link"
            data-friends-action="view-all"
            onClick={() => onOpenFriends?.()}
          >
            {FRIENDS_COPY.viewAll} <span aria-hidden="true">›</span>
          </button>
        ) : null}
      </div>

      {!signedIn ? (
        <div className="v2-friends-preview-empty" data-friends-preview="signed-out">
          <p className="v2-friends-preview-helper">{FRIENDS_COPY.signedOutTitle}</p>
          <button
            type="button"
            className="v2-profile-account-btn"
            disabled={signInBusy}
            onClick={() => void handleSignIn()}
          >
            {signInBusy ? 'Signing in…' : FRIENDS_COPY.signInLabel}
          </button>
        </div>
      ) : status === 'error' ? (
        <p className="v2-friends-error" role="status">
          {FRIENDS_COPY.loadError}{' '}
          <button type="button" className="v2-profile-link" onClick={() => void refresh()}>
            {FRIENDS_COPY.retry}
          </button>
        </p>
      ) : status === 'loading' && !hasFriends ? (
        <p className="v2-friends-preview-helper">Loading friends…</p>
      ) : hasFriends ? (
        <ul
          ref={rowRef}
          className="v2-friends-preview-row"
          data-friends-preview="people"
        >
          {visible.map((friend) => {
            const full = friendDisplayLabel(friend.displayName);
            const short = friendGivenName(friend.displayName);
            return (
              <li key={friend.userId}>
                <button
                  type="button"
                  className="v2-friends-preview-item"
                  aria-label={full}
                  onClick={() => onOpenFriends?.({ focusUserId: friend.userId })}
                >
                  <FriendAvatar
                    displayName={friend.displayName}
                    avatarUrl={friend.avatarUrl}
                    size="md"
                  />
                  <span className="v2-friends-preview-name">{short}</span>
                </button>
              </li>
            );
          })}
          {overflow > 0 ? (
            <li>
              <button
                type="button"
                className="v2-friends-preview-item"
                data-friends-overflow=""
                aria-label={`View ${overflow} more friends`}
                onClick={() => onOpenFriends?.()}
              >
                <span className="v2-friend-avatar v2-friend-avatar-md v2-friend-avatar-more">
                  +{overflow}
                </span>
                <span className="v2-friends-preview-name">{FRIENDS_COPY.moreLabel}</span>
              </button>
            </li>
          ) : null}
        </ul>
      ) : (
        <div className="v2-friends-preview-empty" data-friends-preview="empty">
          <p className="v2-friends-preview-helper">{FRIENDS_COPY.emptyHelper}</p>
          <button
            type="button"
            className="v2-profile-account-btn"
            data-friends-action="invite-from-preview"
            onClick={() => setInviteOpen(true)}
          >
            {FRIENDS_COPY.inviteFriend}
          </button>
        </div>
      )}

      <InviteFriendSheet open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </section>
  );
}
