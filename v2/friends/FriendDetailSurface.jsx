import { useEffect, useMemo, useState } from 'react';
import {
  IconBookmark,
  IconCalendar,
  IconCheck,
  IconCheckCircle,
  IconChevron,
  IconCloseCircle,
  IconMore,
} from '../icons.jsx';
import { useAuth } from '../auth/useAuth.js';
import {
  resolveProfileAvatarUrl,
  resolveProfileDisplayName,
} from '../auth/profileIdentity.js';
import { subscribeFilmStoreMutations } from '../auth/filmStoreMutationBridge.js';
import PersonalCollectionSegmentedControl from '../collections/PersonalCollectionSegmentedControl.jsx';
import { useFriendPlanSignals } from '../social/useFriendPlanSignals.js';
import { buildFriendPlanCards } from '../social/socialPlanContext.js';
import { getNotInterestedFilms } from '../stores/notInterestedFilmsStore.js';
import { getSavedFilms } from '../stores/savedFilmsStore.js';
import { getSeenFilms } from '../stores/seenFilmsStore.js';
import FriendAvatar from './FriendAvatar.jsx';
import FriendDetailEmptyArt from './FriendDetailEmptyArt.jsx';
import {
  buildFriendDetailModel,
  friendActivityEmptyCopy,
  friendActivityLead,
  planCardAvatars,
  upcomingPlansMetricLabel,
  watchTogetherEmptyCopy,
} from './friendDetailPresentation.js';
import { listSharedFilmActivityForFriend } from './friendFilmActivityApi.js';
import { getSharedFilmActivityForFriend } from './friendFilmActivityModel.js';
import { FRIENDS_COPY, friendDisplayLabel, removeFriendTitle } from './friendsCopy.js';
import { removeFriendAndRefresh } from './friendsStore.js';
import { useFriends } from './useFriends.js';

function getStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/**
 * @param {object} row
 * @param {((payload: { filmKey: string, filmId?: string | null, opportunityKey?: string | null }) => void) | null} onOpenFilm
 */
function openFriendFilm(row, onOpenFilm) {
  const key =
    row.origin === 'snapshot'
      ? (typeof row.filmId === 'string' && row.filmId.trim()) ||
        (typeof row.filmKey === 'string' && row.filmKey.trim()) ||
        null
      : (typeof row.filmKey === 'string' && row.filmKey.trim()) ||
        (typeof row.filmId === 'string' && row.filmId.trim()) ||
        null;
  if (!key) return;
  onOpenFilm?.({
    filmKey: key,
    filmId:
      typeof row.filmId === 'string' && row.filmId.trim() ? row.filmId.trim() : null,
    opportunityKey: row.nextOpportunityKey ?? null,
  });
}

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
 *   onOpenSharedPlan?: (planId: string) => void,
 *   onBrowseFilms?: () => void,
 * }} props
 */
export default function FriendDetailSurface({
  friendUserId,
  homeData = null,
  enrichmentIndex = null,
  onOpenFilm = null,
  onOpenSharedPlan = null,
  onBrowseFilms = null,
}) {
  const auth = useAuth();
  const { friends, signedIn, status: friendsStatus, refresh } = useFriends();
  const [rows, setRows] = useState(/** @type {unknown[]} */ ([]));
  const [sharesActivity, setSharesActivity] = useState(true);
  const [loadStatus, setLoadStatus] = useState('idle');
  const [activityTab, setActivityTab] = useState('saved');
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState(null);
  const [filmRevision, setFilmRevision] = useState(0);

  const friend = useMemo(
    () => friends.find((item) => item.userId === friendUserId) ?? null,
    [friends, friendUserId],
  );

  useEffect(() => {
    return subscribeFilmStoreMutations(() => {
      setFilmRevision((value) => value + 1);
    });
  }, []);

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

  const storage = getStorage();
  const viewerSaved = useMemo(() => {
    void filmRevision;
    return getSavedFilms(storage);
  }, [storage, filmRevision]);
  const viewerSeen = useMemo(() => {
    void filmRevision;
    return getSeenFilms(storage);
  }, [storage, filmRevision]);
  const viewerNotInterested = useMemo(() => {
    void filmRevision;
    return getNotInterestedFilms(storage);
  }, [storage, filmRevision]);

  const planSignals = useFriendPlanSignals({
    friendId: friend && signedIn ? friendUserId : null,
    enabled: Boolean(friend && signedIn),
  });
  const planCards = useMemo(
    () => buildFriendPlanCards(planSignals),
    [planSignals],
  );

  const model = useMemo(
    () =>
      buildFriendDetailModel({
        friend,
        sharesActivity: loadStatus === 'ready' && sharesActivity === true,
        activity,
        viewerSaved,
        viewerSeen,
        viewerNotInterested,
        planCards,
        homeData,
        enrichmentIndex,
      }),
    [
      friend,
      loadStatus,
      sharesActivity,
      activity,
      viewerSaved,
      viewerSeen,
      viewerNotInterested,
      planCards,
      homeData,
      enrichmentIndex,
    ],
  );

  const name = friendDisplayLabel(friend?.displayName);
  const privacyHidden =
    loadStatus === 'ready' && friend && sharesActivity !== true;
  const activityReady = loadStatus === 'ready' && sharesActivity === true;
  const activityRows =
    activityTab === 'seen'
      ? model.activity.seen
      : activityTab === 'not-interested'
        ? model.activity.notInterested
        : model.activity.saved;
  const emptyWatch = watchTogetherEmptyCopy(friend?.displayName);
  const viewer = {
    displayName: resolveProfileDisplayName(auth.user, auth.profile),
    avatarUrl: resolveProfileAvatarUrl(auth.profile, auth.user),
  };

  const handleRemove = async () => {
    if (!friend || removeBusy) return;
    setRemoveBusy(true);
    setRemoveError(null);
    const result = await removeFriendAndRefresh(friend.userId, auth.user?.id);
    setRemoveBusy(false);
    if (!result.ok) {
      setRemoveError(FRIENDS_COPY.loadError);
      return;
    }
    setConfirmRemove(false);
    setMenuOpen(false);
  };

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
        <div className="v2-fd-identity">
          <h1 id="v2-friend-detail-title" className="v2-friend-detail-title">
            {name}
          </h1>
          {model.friendsSinceLabel ? (
            <p className="v2-fd-since" data-friends-since="">
              {model.friendsSinceLabel}
            </p>
          ) : null}
        </div>
        <div className="v2-fd-menu">
          <button
            type="button"
            className="v2-friends-more"
            aria-label={`More options for ${name}`}
            aria-expanded={menuOpen}
            data-friends-action="row-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <IconMore width={18} height={18} />
          </button>
          {menuOpen ? (
            <div className="v2-friends-row-menu v2-fd-row-menu" role="menu">
              <button
                type="button"
                className="v2-friends-row-menu-item"
                role="menuitem"
                data-friends-action="remove-friend"
                onClick={() => {
                  setConfirmRemove(true);
                  setMenuOpen(false);
                }}
              >
                {FRIENDS_COPY.removeFriend}
              </button>
            </div>
          ) : null}
        </div>
      </header>

      {loadStatus === 'loading' && rows.length === 0 ? (
        <p className="v2-friends-preview-helper">Loading activity…</p>
      ) : null}
      {loadStatus === 'error' ? (
        <p className="v2-friends-error" role="status">
          Couldn’t load shared film activity.
        </p>
      ) : null}
      {removeError ? (
        <p className="v2-friends-error" role="status">
          {removeError}
        </p>
      ) : null}

      {model.summary ? (
        <section className="v2-fd-summary" aria-label={model.pairLabel} data-friend-summary="">
          <h2 className="v2-fd-summary-label">{model.pairLabel}</h2>
          <div className="v2-fd-summary-metrics">
            <Metric
              id="saved"
              icon={<IconBookmark width={16} height={16} aria-hidden="true" />}
              value={model.summary.savedTogether}
              label="films saved together"
            />
            <Metric
              id="plans"
              icon={<IconCalendar width={16} height={16} aria-hidden="true" />}
              value={model.summary.upcomingPlans}
              label={upcomingPlansMetricLabel(model.summary.upcomingPlans)}
            />
            <Metric
              id="seen"
              icon={<IconCheckCircle width={16} height={16} aria-hidden="true" />}
              value={model.summary.seenTogether}
              label="films you’ve both seen"
            />
            <Metric
              id="not-interested"
              icon={<IconCloseCircle width={16} height={16} aria-hidden="true" />}
              value={model.summary.notInterestedTogether}
              label="both not interested"
            />
          </div>
        </section>
      ) : null}

      {planCards.length > 0 ? (
        <section className="v2-friend-detail-plans" aria-label="Plans" data-friend-plans="">
          <h2 className="v2-fd-section-title">Plans</h2>
          <ul className="v2-friend-detail-plan-list">
            {model.plans.map((card) => (
              <li key={card.planId}>
                <button
                  type="button"
                  className="v2-friend-detail-plan"
                  data-friend-plan={card.planId}
                  onClick={() => onOpenSharedPlan?.(card.planId)}
                >
                  <span className="v2-fd-plan-poster">
                    {card.posterUrl ? (
                      <img src={card.posterUrl} alt="" />
                    ) : (
                      <div className="v2-shelf-poster-fallback" aria-hidden="true" />
                    )}
                  </span>
                  <span className="v2-fd-plan-copy">
                    <span className="v2-friend-detail-plan-title">{card.title}</span>
                    {card.when ? (
                      <span className="v2-friend-detail-plan-when">{card.when}</span>
                    ) : null}
                    {card.theaterName ? (
                      <span className="v2-fd-plan-theater">{card.theaterName}</span>
                    ) : null}
                    <span className="v2-friend-detail-plan-response">
                      {card.response === 'going' ? (
                        <IconCheck width={12} height={12} aria-hidden="true" />
                      ) : null}
                      {card.responseLabel}
                    </span>
                  </span>
                  <span className="v2-fd-plan-side">
                    <PlanAvatars people={planCardAvatars(card, viewer)} />
                    <IconChevron aria-hidden="true" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {activityReady && model.watchTogether.length > 0 ? (
        <section className="v2-fd-section" aria-labelledby="v2-fd-watch-title" data-friend-watch="">
          <h2 id="v2-fd-watch-title" className="v2-fd-section-title">
            Watch Together
          </h2>
          <p className="v2-fd-section-lead">Films you both have saved.</p>
          <FilmRow films={model.watchTogether} onOpenFilm={onOpenFilm} />
        </section>
      ) : null}

      {activityReady && model.watchTogether.length === 0 ? (
        <section
          className="v2-fd-empty"
          data-friend-watch-empty=""
          aria-labelledby="v2-fd-watch-empty-title"
        >
          <FriendDetailEmptyArt />
          <div className="v2-fd-empty-copy">
            <h2 id="v2-fd-watch-empty-title" className="v2-fd-empty-title">
              {emptyWatch.title}
            </h2>
            <p className="v2-fd-empty-body">{emptyWatch.body}</p>
            {typeof onBrowseFilms === 'function' ? (
              <button
                type="button"
                className="v2-profile-account-btn v2-fd-empty-action"
                data-friend-browse="films"
                onClick={() => onBrowseFilms()}
              >
                <IconBookmark width={15} height={15} aria-hidden="true" />
                {emptyWatch.action}
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {privacyHidden ? (
        <p
          className="v2-friends-preview-helper"
          data-friend-activity-privacy="hidden"
          role="status"
        >
          {name} isn’t sharing film activity with friends.
        </p>
      ) : null}

      {activityReady ? (
        <section className="v2-fd-section" aria-labelledby="v2-fd-activity-title" data-friend-activity-section="">
          <h2 id="v2-fd-activity-title" className="v2-fd-section-title">
            {name}’s activity
          </h2>
          <p className="v2-fd-section-lead">{friendActivityLead(friend.displayName)}</p>
          <PersonalCollectionSegmentedControl
            activeSegmentId={activityTab}
            ariaLabel={`${name}’s film activity`}
            onSelectSegment={(segmentId) => setActivityTab(segmentId)}
          />
          <div
            id="v2-pfc-panel"
            role="tabpanel"
            aria-labelledby={`v2-pfc-tab-${activityTab}`}
            data-friend-activity={activityTab}
          >
            {activityRows.length === 0 ? (
              <p className="v2-fd-tab-empty" data-friend-activity-empty="">
                {friendActivityEmptyCopy(activityTab, friend.displayName)}
              </p>
            ) : (
              <FilmRow films={activityRows} onOpenFilm={onOpenFilm} />
            )}
          </div>
        </section>
      ) : null}

      {confirmRemove ? (
        <div
          className="v2-friends-sheet-backdrop"
          role="presentation"
          data-friends-confirm="remove"
          onClick={(event) => {
            if (event.target === event.currentTarget && !removeBusy) {
              setConfirmRemove(false);
            }
          }}
        >
          <div className="v2-friends-confirm-sheet" role="dialog" aria-modal="true">
            <h2 className="v2-friends-confirm-title">{removeFriendTitle(friend.displayName)}</h2>
            <p className="v2-friends-sheet-lead">{FRIENDS_COPY.removeConfirmBody}</p>
            <div className="v2-friends-invite-actions">
              <button
                type="button"
                className="v2-profile-account-btn v2-friends-danger-btn"
                data-friends-action="confirm-remove"
                disabled={removeBusy}
                onClick={() => void handleRemove()}
              >
                {FRIENDS_COPY.removeFriend}
              </button>
              <button
                type="button"
                className="v2-profile-account-btn v2-profile-account-btn-secondary"
                onClick={() => setConfirmRemove(false)}
              >
                {FRIENDS_COPY.cancel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Metric({ id, icon, value, label }) {
  return (
    <div className="v2-fd-metric" data-friend-metric={id}>
      <span className="v2-fd-metric-icon">{icon}</span>
      <span className="v2-fd-metric-value">{value}</span>
      <span className="v2-fd-metric-label">{label}</span>
    </div>
  );
}

function PlanAvatars({ people }) {
  if (!people?.length) return null;
  return (
    <span className="v2-fd-plan-avatars" aria-hidden="true">
      {people.map((person) => (
        <FriendAvatar
          key={person.key}
          displayName={person.displayName}
          avatarUrl={person.avatarUrl}
          size="sm"
        />
      ))}
    </span>
  );
}

function FilmRow({ films, onOpenFilm }) {
  return (
    <ul className="v2-shelf-row v2-fd-film-row">
      {films.map((row) => (
        <li key={row.rowKey} className="v2-fd-film">
          <button
            type="button"
            className="v2-fd-film-card"
            data-friend-film={row.filmKey || row.filmId || row.rowKey}
            onClick={() => openFriendFilm(row, onOpenFilm)}
          >
            <span className="v2-shelf-poster">
              {row.posterUrl ? (
                <img src={row.posterUrl} alt="" draggable="false" loading="lazy" decoding="async" />
              ) : (
                <div className="v2-shelf-poster-fallback" aria-hidden="true" />
              )}
              {row.badge ? <span className="v2-shelf-badge">{row.badge}</span> : null}
            </span>
            <span className="v2-shelf-title">{row.title}</span>
            {row.venue ? <span className="v2-shelf-meta">{row.venue}</span> : null}
            {row.availability ? (
              <span className="v2-shelf-meta">{row.availability}</span>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  );
}
