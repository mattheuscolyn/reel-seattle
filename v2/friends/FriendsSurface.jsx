import { useEffect, useMemo, useState } from 'react';
import { IconPerson } from '../icons.jsx';
import { useAuth } from '../auth/useAuth.js';
import { subscribeFilmStoreMutations } from '../auth/filmStoreMutationBridge.js';
import { restoreListPosition } from '../navigation/listPositionRestore.js';
import { getSavedFilms } from '../stores/savedFilmsStore.js';
import {
  FRIENDS_COPY,
  removeFriendTitle,
} from './friendsCopy.js';
import FriendsEmptyState from './FriendsEmptyState.jsx';
import FriendsListCard from './FriendsListCard.jsx';
import { buildFriendsListCards } from './friendsListContextModel.js';
import { removeFriendAndRefresh } from './friendsStore.js';
import { useFriends } from './useFriends.js';
import { useFriendsListContext } from './useFriendsListContext.js';
import InviteFriendSheet from './InviteFriendSheet.jsx';
import EnterFriendCodeSheet from './EnterFriendCodeSheet.jsx';

function getStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/**
 * @param {{
 *   focusUserId?: string | null,
 *   listRestore?: { itemKey?: string | null, scrollY?: number } | null,
 *   homeData?: object | null,
 *   onOpenFriendDetail?: (payload: { friendUserId: string }) => void,
 * }} [props]
 */
export default function FriendsSurface({
  focusUserId = null,
  listRestore = null,
  homeData = null,
  onOpenFriendDetail = null,
}) {
  const auth = useAuth();
  const { friends, status, signedIn, refresh } = useFriends();
  const context = useFriendsListContext(signedIn);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [menuUserId, setMenuUserId] = useState(null);
  const [confirmUserId, setConfirmUserId] = useState(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState(null);
  const [filmRevision, setFilmRevision] = useState(0);

  useEffect(() => {
    return subscribeFilmStoreMutations(() => {
      setFilmRevision((value) => value + 1);
    });
  }, []);

  const storage = getStorage();
  const viewerSaved = useMemo(() => {
    void filmRevision;
    return getSavedFilms(storage);
  }, [storage, filmRevision]);

  const cards = useMemo(
    () =>
      buildFriendsListCards({
        friends,
        contextFriends: context.status === 'ready' ? context.friends : null,
        viewerSaved,
        homeData,
      }),
    [friends, context.status, context.friends, viewerSaved, homeData],
  );

  useEffect(() => {
    if (!listRestore) return undefined;
    restoreListPosition(listRestore);
    return undefined;
  }, [listRestore, friends.length]);

  useEffect(() => {
    if (!focusUserId || listRestore) return;
    const el = document.querySelector(
      `[data-friend-row="${CSS.escape(focusUserId)}"]`,
    );
    el?.scrollIntoView({ block: 'nearest' });
  }, [focusUserId, friends.length, listRestore]);

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
    context.refresh();
  };

  const confirming = friends.find((friend) => friend.userId === confirmUserId);
  const showEmpty = signedIn && status === 'ready' && friends.length === 0;

  return (
    <section className="v2-friends" aria-labelledby="v2-friends-title" data-friends-surface="">
      <header className="v2-friends-header">
        <div className="v2-friends-header-row">
          <h1 id="v2-friends-title" className="v2-friends-title">
            {FRIENDS_COPY.sectionTitle}
          </h1>
          {signedIn && !showEmpty ? (
            <button
              type="button"
              className="v2-profile-account-btn v2-friends-invite-pill"
              data-friends-action="invite-friend"
              onClick={() => setInviteOpen(true)}
            >
              <IconPerson width={16} height={16} />
              {FRIENDS_COPY.inviteFriendAction}
            </button>
          ) : null}
        </div>
        {signedIn ? (
          <p className="v2-friends-subtitle">{FRIENDS_COPY.listSubtitle}</p>
        ) : null}
        {signedIn && !showEmpty ? (
          <button
            type="button"
            className="v2-profile-link v2-friends-code-link"
            data-friends-action="enter-code"
            onClick={() => setCodeOpen(true)}
          >
            {FRIENDS_COPY.haveInviteCode}
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
      ) : showEmpty ? (
        <div data-friends-list="empty">
          <FriendsEmptyState
            onInvite={() => setInviteOpen(true)}
            onEnterCode={() => setCodeOpen(true)}
          />
        </div>
      ) : (
        <ul
          className="v2-friends-list v2-friend-card-list"
          data-friends-list="rows"
          data-friends-context={context.status}
        >
          {cards.map((card) => (
            <FriendsListCard
              key={card.userId}
              card={card}
              menuOpen={menuUserId === card.userId}
              removeLabel={FRIENDS_COPY.removeFriend}
              onOpen={() => onOpenFriendDetail?.({ friendUserId: card.userId })}
              onMenu={() =>
                setMenuUserId((current) =>
                  current === card.userId ? null : card.userId,
                )
              }
              onRemove={() => {
                setConfirmUserId(card.userId);
                setMenuUserId(null);
              }}
            />
          ))}
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
