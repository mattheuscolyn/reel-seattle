import { useEffect, useMemo, useState } from 'react';
import FriendAvatar from './FriendAvatar.jsx';
import { friendDisplayLabel } from './friendsCopy.js';
import { useFriends } from './useFriends.js';
import { listSharedFilmActivityForFriend } from './friendFilmActivityApi.js';
import {
  buildFriendActivityCollectionRows,
  getSharedFilmActivityForFriend,
} from './friendFilmActivityModel.js';
import PersonalCollectionFilmRow from '../collections/PersonalCollectionFilmRow.jsx';

/**
 * @param {{
 *   friendUserId: string,
 *   homeData?: object | null,
 *   enrichmentIndex?: object | null,
 *   onOpenFilm?: (payload: {
 *     filmKey: string,
 *     filmId?: string | null,
 *     opportunityKey?: string | null,
 *   }) => void,
 * }} props
 */
export default function FriendDetailSurface({
  friendUserId,
  homeData = null,
  enrichmentIndex = null,
  onOpenFilm = null,
}) {
  const { friends, signedIn, status: friendsStatus, refresh } = useFriends();
  const [rows, setRows] = useState(/** @type {unknown[]} */ ([]));
  const [sharesActivity, setSharesActivity] = useState(true);
  const [loadStatus, setLoadStatus] = useState('idle');

  const friend = useMemo(
    () => friends.find((f) => f.userId === friendUserId) ?? null,
    [friends, friendUserId],
  );

  useEffect(() => {
    if (!signedIn || !friendUserId || !friend) {
      setRows([]);
      setSharesActivity(false);
      setLoadStatus(friend ? 'idle' : 'ready');
      return undefined;
    }
    let cancelled = false;
    setLoadStatus('loading');
    void (async () => {
      const result = await listSharedFilmActivityForFriend(friendUserId);
      if (cancelled) return;
      if (!result.ok) {
        setRows([]);
        setSharesActivity(false);
        setLoadStatus('error');
        return;
      }
      setSharesActivity(result.sharesActivity === true);
      setRows(result.films ?? []);
      setLoadStatus('ready');
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn, friendUserId, friend?.userId]);

  const activity = useMemo(
    () =>
      getSharedFilmActivityForFriend({
        friendId: friendUserId,
        friends,
        activityRows: rows,
        friendSharesActivity: sharesActivity,
      }),
    [friendUserId, friends, rows, sharesActivity],
  );

  const savedRows = useMemo(
    () =>
      buildFriendActivityCollectionRows(activity?.saved ?? [], {
        homeData,
        enrichmentIndex,
      }),
    [activity?.saved, homeData, enrichmentIndex],
  );
  const seenRows = useMemo(
    () =>
      buildFriendActivityCollectionRows(activity?.seen ?? [], {
        homeData,
        enrichmentIndex,
      }),
    [activity?.seen, homeData, enrichmentIndex],
  );
  const niRows = useMemo(
    () =>
      buildFriendActivityCollectionRows(activity?.notInterested ?? [], {
        homeData,
        enrichmentIndex,
      }),
    [activity?.notInterested, homeData, enrichmentIndex],
  );

  const name = friendDisplayLabel(friend?.displayName);
  const privacyHidden =
    loadStatus === 'ready' && friend && sharesActivity !== true;

  if (!signedIn) {
    return (
      <section
        className="v2-friend-detail"
        aria-labelledby="v2-friend-detail-title"
        data-friend-detail="signed-out"
      >
        <h1 id="v2-friend-detail-title" className="v2-friend-detail-title">
          Friend
        </h1>
        <p className="v2-friends-preview-helper">
          Sign in to see friends’ shared film activity.
        </p>
      </section>
    );
  }

  if (!friend) {
    return (
      <section
        className="v2-friend-detail"
        aria-labelledby="v2-friend-detail-title"
        data-friend-detail="missing"
      >
        <h1 id="v2-friend-detail-title" className="v2-friend-detail-title">
          Friend
        </h1>
        <p className="v2-friends-preview-helper" role="status">
          This person isn’t on your Friends list anymore.
        </p>
        {friendsStatus === 'error' ? (
          <button type="button" className="v2-profile-link" onClick={() => void refresh()}>
            Retry
          </button>
        ) : null}
      </section>
    );
  }

  return (
    <section
      className="v2-friend-detail"
      aria-labelledby="v2-friend-detail-title"
      data-friend-detail={friendUserId}
      data-friend-shares={sharesActivity ? 'true' : 'false'}
    >
      <header className="v2-friend-detail-header">
        <FriendAvatar
          displayName={friend.displayName}
          avatarUrl={friend.avatarUrl}
          size="lg"
        />
        <h1 id="v2-friend-detail-title" className="v2-friend-detail-title">
          {name}
        </h1>
      </header>

      {loadStatus === 'loading' && rows.length === 0 ? (
        <p className="v2-friends-preview-helper">Loading activity…</p>
      ) : null}
      {loadStatus === 'error' ? (
        <p className="v2-friends-error" role="status">
          Couldn’t load shared film activity.
        </p>
      ) : null}

      {privacyHidden ? (
        <p
          className="v2-friends-preview-helper"
          data-friend-activity-privacy="hidden"
          role="status"
        >
          {name} isn’t sharing film activity with friends.
        </p>
      ) : (
        <>
          <FriendActivityCategory
            title="Saved"
            empty="No shared Saved films."
            rows={savedRows}
            onOpenFilm={onOpenFilm}
            stateId="saved"
          />
          <FriendActivityCategory
            title="Seen"
            empty="No shared Seen films."
            rows={seenRows}
            onOpenFilm={onOpenFilm}
            stateId="seen"
          />
          <FriendActivityCategory
            title="Not Interested"
            empty="No shared Not Interested films."
            rows={niRows}
            onOpenFilm={onOpenFilm}
            stateId="not-interested"
          />
        </>
      )}
    </section>
  );
}

function FriendActivityCategory({ title, empty, rows, onOpenFilm, stateId }) {
  return (
    <section
      className="v2-friend-detail-category"
      data-friend-activity={stateId}
      aria-labelledby={`v2-friend-cat-${stateId}`}
    >
      <h2 id={`v2-friend-cat-${stateId}`} className="v2-friend-detail-cat-title">
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="v2-friends-preview-helper" data-friend-activity-empty="">
          {empty}
        </p>
      ) : (
        <ul className="v2-pfc-list" data-friend-activity-list={stateId}>
          {rows.map((row) => (
            <PersonalCollectionFilmRow
              key={row.rowKey}
              row={row}
              onOpenFilm={onOpenFilm}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
