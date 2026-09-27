/**
 * Canonical Shared Plan Detail destination — one planId for owner and members.
 * Evolves the #105 invite sheet into a first-class Planner surface.
 */

import { useEffect, useMemo, useState } from 'react';
import FriendAvatar from '../friends/FriendAvatar.jsx';
import { friendDisplayLabel } from '../friends/friendsCopy.js';
import { useFriends } from '../friends/useFriends.js';
import { useAuth } from '../auth/useAuth.js';
import {
  getSharedPlanRemote,
  joinOpenSharedPlanRemote,
  respondToSharedPlanRemote,
} from './sharedPlansApi.js';
import {
  formatSharedPlanDateLabel,
  formatSharedPlanResponseLabel,
  formatSharedPlanWithLine,
  sharedPlanDisplayTitle,
  sharedPlanRsvpOptions,
  sharedPlanSharingLabel,
  sharedPlanStateBadge,
} from './sharedPlanCopy.js';
import { formatDisplayClock } from '../stores/scheduleSettingsStore.js';
import InviteFriendsToPlanSheet from './InviteFriendsToPlanSheet.jsx';
import { getAcceptedPlanById } from '../stores/acceptedPlansStore.js';

function getBrowserStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/**
 * @param {{
 *   planId: string,
 *   onBack?: () => void,
 *   onResponded?: () => void,
 *   onOpenFilmDetail?: (payload: {
 *     filmKey: string,
 *     filmId?: string | null,
 *     opportunityKey?: string | null,
 *   }) => void,
 * }} props
 */
export default function SharedPlanDetailSurface({
  planId,
  onBack,
  onResponded,
  onOpenFilmDetail = null,
}) {
  const auth = useAuth();
  const viewerId = auth.user?.id ?? null;
  const { friends } = useFriends();
  const [status, setStatus] = useState(
    /** @type {'loading' | 'ready' | 'error' | 'missing'} */ ('loading'),
  );
  const [plan, setPlan] = useState(
    /** @type {import('./sharedPlanModel.js').SharedPlan | null} */ (null),
  );
  const [members, setMembers] = useState(
    /** @type {import('./sharedPlanModel.js').PlanMember[]} */ ([]),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [localResponse, setLocalResponse] = useState(
    /** @type {string | null} */ (null),
  );
  const [inviteOpen, setInviteOpen] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [ownerSummary, setOwnerSummary] = useState(
    /** @type {{ userId: string, displayName: string | null, avatarUrl: string | null } | null} */ (
      null
    ),
  );
  const [publicCompanions, setPublicCompanions] = useState(
    /** @type {Array<{ userId: string, displayName: string | null, avatarUrl: string | null, response: string | null }>} */ (
      []
    ),
  );

  useEffect(() => {
    if (!planId) {
      setStatus('missing');
      return undefined;
    }
    let cancelled = false;
    setStatus('loading');
    setError(null);
    void (async () => {
      const result = await getSharedPlanRemote(planId, { viewerId });
      if (cancelled) return;
      if (!result.ok) {
        setStatus(result.reason === 'plan_not_found' ? 'missing' : 'error');
        setPlan(null);
        setMembers([]);
        setOwnerSummary(null);
        setPublicCompanions([]);
        return;
      }
      setPlan(result.plan);
      setMembers(result.members);
      setOwnerSummary(result.owner ?? null);
      setPublicCompanions(result.publicCompanions ?? []);
      const mine = result.members.find((m) => m.userId === viewerId);
      setLocalResponse(mine?.response ?? null);
      setStatus('ready');
    })();
    return () => {
      cancelled = true;
    };
  }, [planId, viewerId, reloadToken]);

  const friendById = useMemo(() => {
    /** @type {Map<string, { displayName?: string | null, avatarUrl?: string | null }>} */
    const map = new Map();
    for (const friend of friends) {
      map.set(friend.userId, friend);
    }
    return map;
  }, [friends]);

  const isOwner = Boolean(plan && viewerId && plan.ownerId === viewerId);
  const myMember = members.find((m) => m.userId === viewerId) ?? null;
  const isDiscoverer = Boolean(plan && viewerId && !isOwner && !myMember);
  const organizerNote =
    myMember?.inviteMessage ||
    members.find((m) => m.inviteMessage)?.inviteMessage ||
    null;
  const options = plan ? sharedPlanRsvpOptions(plan.type) : [];
  const dateLabel = formatSharedPlanDateLabel(plan?.date);
  const withLine = plan
    ? formatSharedPlanWithLine({
        ownerId: plan.ownerId,
        viewerId,
        planType: plan.type,
        members: members.map((m) => ({
          userId: m.userId,
          response: m.response,
          role: m.role,
          displayName:
            friendById.get(m.userId)?.displayName ||
            (m.userId === viewerId ? 'You' : null),
        })),
      })
    : null;

  const peopleRows = useMemo(() => {
    if (!plan) return [];
    const ordered = [...members].sort((a, b) => {
      if (a.role === 'owner') return -1;
      if (b.role === 'owner') return 1;
      if (a.userId === viewerId) return -1;
      if (b.userId === viewerId) return 1;
      return String(a.updatedAt).localeCompare(String(b.updatedAt));
    });
    return ordered.map((member) => {
      const isSelf = member.userId === viewerId;
      const friend = friendById.get(member.userId);
      const displayName = isSelf
        ? 'You'
        : friendDisplayLabel(friend?.displayName) ||
          (member.role === 'owner' ? 'Organizer' : 'Friend');
      return {
        userId: member.userId,
        displayName,
        avatarUrl: friend?.avatarUrl ?? null,
        responseLabel: formatSharedPlanResponseLabel(
          isSelf && localResponse ? localResponse : member.response,
          plan.type,
        ),
        response: isSelf && localResponse ? localResponse : member.response,
        isSelf,
        isOwner: member.role === 'owner',
      };
    });
  }, [members, friendById, viewerId, plan, localResponse]);

  const handleRespond = async (response) => {
    if (!plan || !viewerId || busy || isOwner) return;
    const previous = localResponse;
    setLocalResponse(response);
    setBusy(true);
    setError(null);
    const result = await respondToSharedPlanRemote(plan.planId, response);
    setBusy(false);
    if (!result.ok) {
      setLocalResponse(previous);
      setError('Couldn’t update your response. Try again.');
      return;
    }
    setMembers((prev) =>
      prev.map((m) => (m.userId === viewerId ? result.member : m)),
    );
    setLocalResponse(result.member.response);
    onResponded?.();
  };

  const handleJoin = async () => {
    if (!plan || !isDiscoverer || busy) return;
    setBusy(true);
    setError(null);
    const result = await joinOpenSharedPlanRemote(plan.planId);
    setBusy(false);
    if (!result.ok) {
      setError(
        result.reason === 'already_member'
          ? 'You’re already on this plan.'
          : 'Couldn’t join this plan. Try again.',
      );
      setReloadToken((n) => n + 1);
      return;
    }
    setReloadToken((n) => n + 1);
    onResponded?.();
  };

  const acceptedPlanForInvite =
    isOwner && plan?.sourceAcceptedPlanId
      ? getAcceptedPlanById(getBrowserStorage(), plan.sourceAcceptedPlanId)
      : null;

  return (
    <section
      className="v2-shared-plan-detail"
      aria-labelledby="v2-shared-plan-detail-title"
      data-shared-plan-id={planId || undefined}
    >
      {status === 'loading' ? (
        <p className="v2-shared-plan-detail-status">Loading plan…</p>
      ) : status === 'missing' ? (
        <div className="v2-shared-plan-detail-status">
          <p>This plan is no longer available.</p>
          {typeof onBack === 'function' ? (
            <button type="button" className="v2-shared-plan-detail-link" onClick={onBack}>
              Back to Planner
            </button>
          ) : null}
        </div>
      ) : status === 'error' || !plan ? (
        <p className="v2-plan-invite-error" role="alert">
          Couldn’t load this plan.
        </p>
      ) : (
        <>
          <header className="v2-shared-plan-detail-header">
            <p className="v2-shared-plan-detail-badge">
              {sharedPlanStateBadge(plan.type)}
            </p>
            <h1
              id="v2-shared-plan-detail-title"
              className="v2-shared-plan-detail-title"
            >
              {sharedPlanDisplayTitle(plan)}
            </h1>
            {dateLabel ? (
              <p className="v2-shared-plan-detail-date">{dateLabel}</p>
            ) : null}
            {withLine && !isDiscoverer ? (
              <p className="v2-shared-plan-detail-with">{withLine}</p>
            ) : null}
            {isOwner ? (
              <p className="v2-shared-plan-detail-sharing">
                Sharing · {sharedPlanSharingLabel(plan.visibility)}
              </p>
            ) : null}
          </header>

          {organizerNote && !isDiscoverer ? (
            <blockquote className="v2-shared-plan-detail-note">
              “{organizerNote}”
            </blockquote>
          ) : null}

          <section
            className="v2-shared-plan-detail-itinerary"
            aria-label="Itinerary"
          >
            <h2 className="v2-shared-plan-detail-section-title">Itinerary</h2>
            <ol className="v2-shared-plan-detail-screenings">
              {plan.screenings.map((screening) => {
                const filmKey = screening.filmKey || screening.filmId;
                const canOpen =
                  typeof onOpenFilmDetail === 'function' && Boolean(filmKey);
                return (
                  <li key={screening.performanceKey}>
                    <button
                      type="button"
                      className="v2-shared-plan-detail-screening"
                      disabled={!canOpen}
                      onClick={() => {
                        if (!canOpen || !filmKey) return;
                        onOpenFilmDetail({
                          filmKey,
                          filmId: screening.filmId ?? null,
                          opportunityKey: screening.opportunityKey ?? null,
                        });
                      }}
                    >
                      {screening.posterUrl ? (
                        <img
                          className="v2-shared-plan-detail-poster"
                          src={screening.posterUrl}
                          alt=""
                        />
                      ) : (
                        <span
                          className="v2-shared-plan-detail-poster v2-shared-plan-detail-poster-fallback"
                          aria-hidden="true"
                        />
                      )}
                      <span className="v2-shared-plan-detail-screening-copy">
                        <span className="v2-shared-plan-detail-time">
                          {formatDisplayClock(screening.localTime, '12h') ||
                            screening.localTime}
                          {screening.format ? ` · ${screening.format}` : ''}
                        </span>
                        <span className="v2-shared-plan-detail-film">
                          {screening.title}
                        </span>
                        <span className="v2-shared-plan-detail-venue">
                          {screening.theaterName}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="v2-shared-plan-detail-people" aria-label="People">
            <h2 className="v2-shared-plan-detail-section-title">People</h2>
            <ul className="v2-shared-plan-detail-people-list">
              {isDiscoverer ? (
                <li key={plan.ownerId}>
                  <span className="v2-shared-plan-detail-person">
                    <FriendAvatar
                      displayName={
                        ownerSummary?.displayName ||
                        friendById.get(plan.ownerId)?.displayName ||
                        'Organizer'
                      }
                      avatarUrl={
                        ownerSummary?.avatarUrl ||
                        friendById.get(plan.ownerId)?.avatarUrl ||
                        null
                      }
                      size="sm"
                    />
                    <span className="v2-shared-plan-detail-person-name">
                      {friendDisplayLabel(
                        ownerSummary?.displayName ||
                          friendById.get(plan.ownerId)?.displayName,
                      ) || 'Organizer'}
                    </span>
                  </span>
                  <span className="v2-shared-plan-detail-person-response">
                    Organizer
                  </span>
                </li>
              ) : null}
              {(isDiscoverer
                ? publicCompanions.map((person) => ({
                    userId: person.userId,
                    displayName:
                      friendDisplayLabel(person.displayName) || 'Friend',
                    avatarUrl: person.avatarUrl,
                    responseLabel: formatSharedPlanResponseLabel(
                      person.response,
                      plan.type,
                    ),
                  }))
                : peopleRows
              ).map((person) => (
                <li key={person.userId}>
                  <span className="v2-shared-plan-detail-person">
                    <FriendAvatar
                      displayName={person.displayName}
                      avatarUrl={person.avatarUrl}
                      size="sm"
                    />
                    <span className="v2-shared-plan-detail-person-name">
                      {person.displayName}
                    </span>
                  </span>
                  <span className="v2-shared-plan-detail-person-response">
                    {person.responseLabel}
                  </span>
                </li>
              ))}
            </ul>
            {!isDiscoverer && peopleRows.length <= 1 ? (
              <p className="v2-shared-plan-detail-empty-people">
                No other responses yet.
              </p>
            ) : null}
          </section>

          {isDiscoverer && plan.visibility === 'friends' ? (
            <section className="v2-shared-plan-detail-rsvp" aria-label="Join">
              <button
                type="button"
                className="v2-shared-plan-detail-invite-btn"
                disabled={busy}
                onClick={handleJoin}
              >
                {busy
                  ? 'Joining…'
                  : plan.type === 'decided'
                    ? 'Join'
                    : 'Interested'}
              </button>
            </section>
          ) : null}

          {!isOwner && myMember ? (
            <section className="v2-shared-plan-detail-rsvp" aria-label="Your response">
              <h2 className="v2-shared-plan-detail-section-title">Your response</h2>
              <div className="v2-shared-plan-rsvp-actions">
                {options.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`v2-shared-plan-rsvp-btn${
                      localResponse === option.id ? ' is-selected' : ''
                    }`}
                    disabled={busy}
                    onClick={() => handleRespond(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {isOwner ? (
            <div className="v2-shared-plan-detail-owner-actions">
              <button
                type="button"
                className="v2-shared-plan-detail-invite-btn"
                onClick={() => setInviteOpen(true)}
              >
                Invite more friends
              </button>
            </div>
          ) : null}

          {error ? (
            <p className="v2-plan-invite-error" role="alert">
              {error}
            </p>
          ) : null}
        </>
      )}

      <InviteFriendsToPlanSheet
        open={inviteOpen}
        acceptedPlan={acceptedPlanForInvite}
        sharedPlanId={plan?.planId ?? planId}
        initialVisibility={plan?.visibility ?? null}
        ownerId={viewerId}
        onClose={() => setInviteOpen(false)}
        onInvited={() => {
          setInviteOpen(false);
          setReloadToken((n) => n + 1);
          onResponded?.();
        }}
      />
    </section>
  );
}
