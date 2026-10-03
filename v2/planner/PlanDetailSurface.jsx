/**
 * Canonical Plan Detail.
 * Accepted plans and shared plans render here. Entry point only affects back navigation.
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
} from '../sharedPlans/sharedPlansApi.js';
import {
  sharedPlanRsvpOptions,
} from '../sharedPlans/sharedPlanCopy.js';
import InviteFriendsToPlanSheet from '../sharedPlans/InviteFriendsToPlanSheet.jsx';
import {
  getAcceptedPlanById,
  removeAcceptedPlan,
  setAcceptedPlanPerformanceTicketsPurchased,
} from '../stores/acceptedPlansStore.js';
import {
  calendarExportStatusMessage,
  exportPlanToCalendar,
} from '../calendar/exportFromOpportunity.js';
import { externalTicketLinkProps } from '../ticket/externalTicketUrl.js';
import {
  IconCalendar,
  IconChevron,
  IconCup,
  IconFilm,
  IconLock,
  IconPin,
  IconTicket,
  IconTrash,
} from '../icons.jsx';
import { deriveCanonicalPlanDetail } from './deriveCanonicalPlanDetail.js';
import {
  getScheduleSettings,
  subscribeScheduleSettings,
} from '../stores/scheduleSettingsStore.js';

function getBrowserStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/**
 * @param {string | null | undefined} label
 */
function responseTone(label) {
  if (label === 'Going' || label === 'Interested' || label === 'Maybe') {
    return 'is-positive';
  }
  return '';
}

/**
 * @param {{ url?: string | null, title?: string, stacked?: boolean }} props
 */
function HeroPosters({ posters, title }) {
  const urls = Array.isArray(posters) ? posters.filter(Boolean).slice(0, 2) : [];
  if (urls.length === 0) {
    return (
      <span
        className="v2-plan-detail-poster v2-plan-detail-poster-fallback"
        aria-hidden="true"
        data-title={title || ''}
      />
    );
  }
  if (urls.length === 1) {
    return <img className="v2-plan-detail-poster" src={urls[0]} alt="" />;
  }
  return (
    <span className="v2-plan-detail-poster-stack">
      <img className="v2-plan-detail-poster is-back" src={urls[1]} alt="" />
      <img className="v2-plan-detail-poster is-front" src={urls[0]} alt="" />
    </span>
  );
}

/**
 * @param {{
 *   view: NonNullable<ReturnType<typeof deriveCanonicalPlanDetail>>,
 *   busy?: boolean,
 *   error?: string | null,
 *   statusMessage?: string | null,
 *   confirmRemove?: boolean,
 *   onOpenFilm?: (payload: {
 *     filmKey: string,
 *     filmId?: string | null,
 *     opportunityKey?: string | null,
 *   }) => void,
 *   onInvite?: () => void,
 *   onToggleTickets?: (performanceKey: string, purchased: boolean) => void,
 *   onRespond?: (response: string) => void,
 *   onJoin?: () => void,
 *   onCalendar?: () => void,
 *   onRequestRemove?: () => void,
 *   onConfirmRemove?: () => void,
 *   onCancelRemove?: () => void,
 * }} props
 */
export function PlanDetailView({
  view,
  busy = false,
  error = null,
  statusMessage = null,
  confirmRemove = false,
  onOpenFilm = null,
  onInvite = null,
  onToggleTickets = null,
  onRespond = null,
  onJoin = null,
  onCalendar = null,
  onRequestRemove = null,
  onConfirmRemove = null,
  onCancelRemove = null,
}) {
  const showTools =
    view.tools.canCalendar ||
    Boolean(view.tools.filmDetail) ||
    Boolean(view.tools.ticketUrl);
  const singleTicket = externalTicketLinkProps(view.tools.ticketUrl);

  return (
    <div
      className="v2-plan-detail"
      data-plan-detail="true"
      data-plan-id={view.planId}
      data-plan-source={view.source}
      data-viewer-role={view.permissions.role}
      data-film-count={view.filmCount}
      data-add-screening={view.addScreening.available ? 'available' : 'unavailable'}
    >
      <section className="v2-plan-detail-card v2-plan-detail-hero" aria-label={view.title}>
        <HeroPosters posters={view.posters} title={view.title} />
        <div className="v2-plan-detail-hero-copy">
          {view.showMovieDay || view.tags.length > 0 ? (
            <p className="v2-plan-detail-chips">
              {view.showMovieDay ? (
                <span className="v2-plan-detail-chip">Movie Day</span>
              ) : null}
              {view.filmCountLabel ? (
                <span className="v2-plan-detail-chip">{view.filmCountLabel}</span>
              ) : null}
              {view.tags.map((tag) => (
                <span key={tag} className="v2-plan-detail-chip">
                  {tag}
                </span>
              ))}
            </p>
          ) : null}
          <h2 id="v2-plan-detail-title" className="v2-plan-detail-title">
            {view.title}
          </h2>
          {view.dateLabel ? (
            <p className="v2-plan-detail-date">{view.dateLabel}</p>
          ) : null}
          {view.scheduleLine ? (
            <p className="v2-plan-detail-schedule">{view.scheduleLine}</p>
          ) : null}
          {view.theaterSummary ? (
            <p className="v2-plan-detail-theater">
              <IconPin width={14} height={14} aria-hidden="true" />
              <span>{view.theaterSummary}</span>
            </p>
          ) : null}
        </div>
      </section>

      {view.organizerNote ? (
        <blockquote className="v2-plan-detail-note">“{view.organizerNote}”</blockquote>
      ) : null}

      {view.showPeople ? (
        <section
          className={`v2-plan-detail-card${
            view.peopleMode === 'compact' ? ' is-compact' : ''
          }`}
          aria-label="People"
        >
          {view.peopleMode === 'list' ? (
            <header className="v2-plan-detail-section-head">
              <h3 className="v2-plan-detail-section-title">
                People
                {view.peopleCount > 0 ? (
                  <span className="v2-plan-detail-count">{view.peopleCount}</span>
                ) : null}
              </h3>
              {view.permissions.canInvite && onInvite ? (
                <button type="button" className="v2-plan-detail-pill" onClick={onInvite}>
                  Invite friends
                </button>
              ) : null}
            </header>
          ) : null}
          <ul className="v2-plan-detail-people">
            {view.people.map((person) => (
              <li key={person.userId}>
                <FriendAvatar
                  displayName={person.displayName}
                  avatarUrl={person.avatarUrl}
                  size="sm"
                />
                <span className="v2-plan-detail-person-copy">
                  <span className="v2-plan-detail-person-name">{person.displayName}</span>
                  <span
                    className={`v2-plan-detail-person-status ${responseTone(person.responseLabel)}`}
                  >
                    {person.responseLabel}
                  </span>
                </span>
                {view.peopleMode === 'compact' &&
                view.permissions.canInvite &&
                onInvite ? (
                  <button type="button" className="v2-plan-detail-pill" onClick={onInvite}>
                    Invite friends
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          {view.permissions.canRespond && view.permissions.rsvpOptions.length > 0 ? (
            <div className="v2-plan-detail-rsvp" aria-label="Your response">
              {view.permissions.rsvpOptions.map((option) => {
                const selected = view.people.some(
                  (person) => person.isSelf && person.response === option.id,
                );
                return (
                  <button
                    key={option.id}
                    type="button"
                    className={`v2-plan-detail-rsvp-btn${selected ? ' is-selected' : ''}`}
                    disabled={busy}
                    onClick={() => onRespond?.(option.id)}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          ) : null}
          {view.permissions.canJoin && onJoin ? (
            <button
              type="button"
              className="v2-plan-detail-join"
              disabled={busy}
              onClick={onJoin}
            >
              {busy ? 'Joining…' : view.permissions.joinLabel}
            </button>
          ) : null}
        </section>
      ) : null}

      <section className="v2-plan-detail-card" aria-label="Itinerary">
        <header className="v2-plan-detail-section-head">
          <h3 className="v2-plan-detail-section-title">Itinerary</h3>
          {view.statsLine ? (
            <p className="v2-plan-detail-stats">{view.statsLine}</p>
          ) : null}
        </header>
        <ol
          className={`v2-plan-detail-itinerary${
            view.isMulti || view.breakCount > 0 ? ' is-timeline' : ''
          }`}
        >
          {view.itinerary.map((row) =>
            row.kind === 'break' ? (
              <li key={row.id} className="v2-plan-detail-break" data-itinerary="break">
                <span className="v2-plan-detail-break-icon" aria-hidden="true">
                  <IconCup width={14} height={14} />
                </span>
                <span className="v2-plan-detail-break-copy">
                  {row.timePill ? (
                    <span className="v2-plan-detail-break-time">{row.timePill}</span>
                  ) : null}
                  <span>{row.breakLabel || 'Break'}</span>
                  {row.transferLabel ? (
                    <span className="v2-plan-detail-break-meta">{row.transferLabel}</span>
                  ) : null}
                </span>
              </li>
            ) : (
              <li key={row.id} data-itinerary="film" data-performance-key={row.performanceKey}>
                <ItineraryFilm row={row} onOpenFilm={onOpenFilm} />
              </li>
            ),
          )}
        </ol>
      </section>

      {view.tickets.rows.length > 0 ? (
        <section className="v2-plan-detail-card" aria-label="Tickets">
          <h3 className="v2-plan-detail-section-title">Tickets</h3>
          <ul className="v2-plan-detail-tickets">
            {view.tickets.rows.map((row) => {
              const link = externalTicketLinkProps(row.ticketUrl);
              return (
                <li key={row.performanceKey}>
                  <span className="v2-plan-detail-ticket-icon" aria-hidden="true">
                    <IconTicket width={16} height={16} />
                  </span>
                  <span className="v2-plan-detail-ticket-copy">
                    {view.isMulti ? (
                      <span className="v2-plan-detail-ticket-title">{row.title}</span>
                    ) : null}
                    <span>
                      {row.ticketsPurchased
                        ? 'Tickets purchased'
                        : 'Not marked as purchased'}
                    </span>
                  </span>
                  {row.canToggle && onToggleTickets ? (
                    <button
                      type="button"
                      className="v2-plan-detail-pill"
                      disabled={busy}
                      onClick={() =>
                        onToggleTickets(row.performanceKey, !row.ticketsPurchased)
                      }
                    >
                      {row.ticketsPurchased ? 'Mark as not purchased' : 'Mark as purchased'}
                    </button>
                  ) : null}
                  {link ? (
                    <a className="v2-plan-detail-pill" {...link}>
                      Get tickets
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {view.sharing.show ? (
        <section className="v2-plan-detail-card" aria-label="Sharing">
          <h3 className="v2-plan-detail-section-title">Sharing</h3>
          <div className="v2-plan-detail-sharing">
            <span className="v2-plan-detail-ticket-icon" aria-hidden="true">
              <IconLock width={16} height={16} />
            </span>
            <span>{view.sharing.label}</span>
            {view.sharing.canManage && onInvite ? (
              <button type="button" className="v2-plan-detail-pill" onClick={onInvite}>
                Manage
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {showTools ? (
        <section className="v2-plan-detail-card v2-plan-detail-tools" aria-label="Plan tools">
          <h3 className="v2-plan-detail-section-title">Plan tools</h3>
          <ul>
            {view.tools.canCalendar && onCalendar ? (
              <li>
                <button type="button" onClick={onCalendar}>
                  <IconCalendar width={16} height={16} aria-hidden="true" />
                  <span>Add to calendar</span>
                  <IconChevron width={14} height={14} aria-hidden="true" />
                </button>
              </li>
            ) : null}
            {view.tools.filmDetail && onOpenFilm ? (
              <li>
                <button
                  type="button"
                  onClick={() => onOpenFilm(view.tools.filmDetail)}
                >
                  <IconFilm width={16} height={16} aria-hidden="true" />
                  <span>View film details</span>
                  <IconChevron width={14} height={14} aria-hidden="true" />
                </button>
              </li>
            ) : null}
            {singleTicket ? (
              <li>
                <a {...singleTicket}>
                  <IconTicket width={16} height={16} aria-hidden="true" />
                  <span>Get tickets</span>
                  <IconChevron width={14} height={14} aria-hidden="true" />
                </a>
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}

      {error ? (
        <p className="v2-plan-detail-error" role="alert">
          {error}
        </p>
      ) : null}
      {statusMessage ? (
        <p className="v2-plan-detail-status" role="status">
          {statusMessage}
        </p>
      ) : null}

      {view.permissions.canRemove ? (
        confirmRemove ? (
          <div className="v2-plan-detail-remove-confirm">
            <p>
              {view.isMulti
                ? 'Remove this plan? Its screenings will also be removed from Planner.'
                : 'Remove this screening from Planner?'}
            </p>
            <button type="button" onClick={onConfirmRemove} disabled={busy}>
              Remove from Planner
            </button>
            <button type="button" onClick={onCancelRemove}>
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="v2-plan-detail-remove"
            onClick={onRequestRemove}
          >
            <IconTrash width={16} height={16} aria-hidden="true" />
            Remove from Planner
          </button>
        )
      ) : null}
    </div>
  );
}

/**
 * @param {{
 *   row: object,
 *   onOpenFilm?: ((payload: object) => void) | null,
 * }} props
 */
function ItineraryFilm({ row, onOpenFilm }) {
  const filmKey = row.filmKey || row.filmId;
  const canOpen = typeof onOpenFilm === 'function' && Boolean(filmKey);
  const body = (
    <>
      {row.imageUrl ? (
        <img className="v2-plan-detail-row-poster" src={row.imageUrl} alt="" />
      ) : (
        <span className="v2-plan-detail-row-poster v2-plan-detail-poster-fallback" aria-hidden="true" />
      )}
      <span className="v2-plan-detail-row-copy">
        {row.rangeLine || row.timePill ? (
          <span className="v2-plan-detail-row-time">{row.rangeLine || row.timePill}</span>
        ) : null}
        <span className="v2-plan-detail-row-title">{row.title}</span>
        <span className="v2-plan-detail-row-meta">
          {[row.theater, row.auditoriumLabel, row.formatBadge].filter(Boolean).join(' · ')}
        </span>
      </span>
      {canOpen ? (
        <IconChevron width={14} height={14} className="v2-plan-detail-row-chevron" aria-hidden="true" />
      ) : null}
    </>
  );
  if (!canOpen) {
    return <div className="v2-plan-detail-row">{body}</div>;
  }
  return (
    <button
      type="button"
      className="v2-plan-detail-row"
      onClick={() =>
        onOpenFilm({
          filmKey: row.filmKey || row.filmId,
          filmId: row.filmId ?? null,
          opportunityKey: row.opportunityKey ?? null,
        })
      }
    >
      {body}
    </button>
  );
}

/**
 * @param {{
 *   planId: string,
 *   homeData?: object | null,
 *   enrichmentIndex?: object | null,
 *   storage?: Storage | null,
 *   onBack?: () => void,
 *   onOpenFilmDetail?: (payload: {
 *     filmKey: string,
 *     filmId?: string | null,
 *     opportunityKey?: string | null,
 *   }) => void,
 *   onPlansChanged?: () => void,
 *   onResponded?: () => void,
 *   onShareReady?: (handler: (() => void) | null) => void,
 * }} props
 */
export default function PlanDetailSurface({
  planId,
  homeData = null,
  enrichmentIndex = null,
  storage = null,
  onBack = null,
  onOpenFilmDetail = null,
  onPlansChanged = null,
  onResponded = null,
  onShareReady = null,
}) {
  const auth = useAuth();
  const viewerId = auth.user?.id ?? null;
  const { friends } = useFriends();
  const resolvedStorage = storage ?? getBrowserStorage();
  const initialAccepted =
    planId && !String(planId).startsWith('shared:')
      ? getAcceptedPlanById(resolvedStorage, planId)
      : null;
  const [status, setStatus] = useState(
    /** @type {'loading' | 'ready' | 'error' | 'missing'} */ (
      !planId
        ? 'missing'
        : String(planId).startsWith('shared:')
          ? 'loading'
          : initialAccepted
            ? 'ready'
            : 'missing'
    ),
  );
  const [shared, setShared] = useState(
    /** @type {null | { plan: import('../sharedPlans/sharedPlanModel.js').SharedPlan, members: import('../sharedPlans/sharedPlanModel.js').PlanMember[], owner?: object | null, publicCompanions?: object[] }} */ (
      null
    ),
  );
  const [localPlan, setLocalPlan] = useState(
    /** @type {import('../stores/acceptedPlansStore.js').AcceptedPlanItem | null} */ (
      initialAccepted
    ),
  );
  const [localResponse, setLocalResponse] = useState(/** @type {string | null} */ (null));
  const [reloadToken, setReloadToken] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [statusMessage, setStatusMessage] = useState(/** @type {string | null} */ (null));
  const [inviteOpen, setInviteOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [settingsTick, setSettingsTick] = useState(0);

  useEffect(
    () => subscribeScheduleSettings(() => setSettingsTick((n) => n + 1)),
    [],
  );
  void settingsTick;

  useEffect(() => {
    if (!planId) {
      setStatus('missing');
      return undefined;
    }
    let cancelled = false;
    if (String(planId).startsWith('shared:')) {
      setStatus('loading');
      setError(null);
      void (async () => {
        const result = await getSharedPlanRemote(planId, { viewerId });
        if (cancelled) return;
        if (!result.ok) {
          setShared(null);
          setLocalPlan(null);
          setStatus(result.reason === 'plan_not_found' ? 'missing' : 'error');
          return;
        }
        setShared({
          plan: result.plan,
          members: result.members,
          owner: result.owner ?? null,
          publicCompanions: result.publicCompanions ?? [],
        });
        const sourceId = result.plan.sourceAcceptedPlanId;
        setLocalPlan(
          sourceId ? getAcceptedPlanById(resolvedStorage, sourceId) : null,
        );
        const mine = result.members.find((member) => member.userId === viewerId);
        setLocalResponse(mine?.response ?? null);
        setStatus('ready');
      })();
      return () => {
        cancelled = true;
      };
    }
    const accepted = getAcceptedPlanById(resolvedStorage, planId);
    setShared(null);
    setLocalPlan(accepted);
    setLocalResponse(null);
    setStatus(accepted ? 'ready' : 'missing');
    return undefined;
  }, [planId, viewerId, reloadToken, resolvedStorage]);

  const friendById = useMemo(() => {
    /** @type {Map<string, { displayName?: string | null, avatarUrl?: string | null }>} */
    const map = new Map();
    for (const friend of friends) map.set(friend.userId, friend);
    return map;
  }, [friends]);

  const isOwner = Boolean(shared?.plan && viewerId && shared.plan.ownerId === viewerId);
  const myMember =
    shared?.members?.find((member) => member.userId === viewerId) ?? null;
  const isDiscoverer = Boolean(shared?.plan && !isOwner && !myMember);
  const organizerNote =
    myMember?.inviteMessage ||
    shared?.members?.find((member) => member.inviteMessage)?.inviteMessage ||
    null;

  const view = useMemo(() => {
    if (status !== 'ready') return null;
    const timeFormatId = getScheduleSettings(resolvedStorage).timeFormatId;
    if (shared?.plan) {
      const localByKey = new Map(
        (localPlan?.performances ?? []).map((perf) => [perf.performanceKey, perf]),
      );
      const screenings = (shared.plan.screenings ?? []).map((screening) => {
        const local = localByKey.get(screening.performanceKey);
        return {
          ...screening,
          ticketsPurchased:
            local?.ticketsPurchased === true || screening.ticketsPurchased === true,
        };
      });
      const role = isOwner ? 'owner' : myMember ? 'participant' : 'discoverer';
      const keysPresent =
        screenings.length > 0 &&
        screenings.every((screening) => localByKey.has(screening.performanceKey));
      const people = isDiscoverer
        ? [
            {
              userId: shared.plan.ownerId,
              displayName:
                friendDisplayLabel(
                  shared.owner?.displayName ||
                    friendById.get(shared.plan.ownerId)?.displayName,
                ) || 'Organizer',
              avatarUrl:
                shared.owner?.avatarUrl ||
                friendById.get(shared.plan.ownerId)?.avatarUrl ||
                null,
              response: null,
              responseLabel: 'Organizer',
              isSelf: false,
              isOwner: true,
            },
            ...(shared.publicCompanions ?? []).map((person) => ({
              userId: person.userId,
              displayName: friendDisplayLabel(person.displayName) || 'Friend',
              avatarUrl: person.avatarUrl ?? null,
              response: person.response ?? null,
              isSelf: false,
              isOwner: false,
            })),
          ]
        : [...shared.members]
            .sort((a, b) => {
              if (a.role === 'owner') return -1;
              if (b.role === 'owner') return 1;
              if (a.userId === viewerId) return -1;
              if (b.userId === viewerId) return 1;
              return String(a.updatedAt).localeCompare(String(b.updatedAt));
            })
            .map((member) => {
              const isSelf = member.userId === viewerId;
              const friend = friendById.get(member.userId);
              const response = isSelf && localResponse ? localResponse : member.response;
              return {
                userId: member.userId,
                displayName: isSelf
                  ? 'You'
                  : friendDisplayLabel(friend?.displayName) ||
                    (member.role === 'owner' ? 'Organizer' : 'Friend'),
                avatarUrl: isSelf ? null : friend?.avatarUrl ?? null,
                response,
                isSelf,
                isOwner: member.role === 'owner',
              };
            });
      return deriveCanonicalPlanDetail({
        planId: shared.plan.planId,
        source: 'shared',
        label: shared.plan.label,
        date: shared.plan.date,
        screenings,
        visibility: shared.plan.visibility,
        planType: shared.plan.type,
        viewerRole: role,
        viewerSignedIn: Boolean(viewerId),
        localPlanId: role === 'owner' ? localPlan?.planId ?? null : null,
        canToggleTickets: role === 'owner' && Boolean(localPlan) && keysPresent,
        people,
        organizerNote: organizerNote && !isDiscoverer ? organizerNote : null,
        timeFormatId,
        enrichmentIndex,
        homeData,
      });
    }
    if (!localPlan) return null;
    return deriveCanonicalPlanDetail({
      planId: localPlan.planId,
      source: 'accepted',
      label: localPlan.label,
      date: localPlan.date,
      screenings: localPlan.performances,
      visibility: 'private',
      planType: 'decided',
      viewerRole: 'solo',
      viewerSignedIn: Boolean(viewerId),
      localPlanId: localPlan.planId,
      canToggleTickets: true,
      timeFormatId,
      enrichmentIndex,
      homeData,
    });
  }, [
    status,
    shared,
    localPlan,
    isOwner,
    myMember,
    isDiscoverer,
    friendById,
    viewerId,
    localResponse,
    organizerNote,
    enrichmentIndex,
    homeData,
    resolvedStorage,
    settingsTick,
  ]);

  const exportCalendar = useMemo(() => {
    if (!view?.tools.canCalendar) return null;
    return () => {
      const result = exportPlanToCalendar({
        planId: view.planId,
        title: view.title,
        films: view.tools.calendarFilms,
      });
      setStatusMessage(calendarExportStatusMessage(result));
    };
  }, [view]);

  useEffect(() => {
    onShareReady?.(exportCalendar);
    return () => onShareReady?.(null);
  }, [onShareReady, exportCalendar]);

  const handleRespond = async (response) => {
    if (!shared?.plan || !viewerId || busy || isOwner) return;
    const options = sharedPlanRsvpOptions(shared.plan.type);
    if (!options.some((option) => option.id === response)) return;
    const previous = localResponse;
    setLocalResponse(response);
    setBusy(true);
    setError(null);
    const result = await respondToSharedPlanRemote(shared.plan.planId, response);
    setBusy(false);
    if (!result.ok) {
      setLocalResponse(previous);
      setError('Couldn’t update your response. Try again.');
      return;
    }
    setShared((current) =>
      current
        ? {
            ...current,
            members: current.members.map((member) =>
              member.userId === viewerId ? result.member : member,
            ),
          }
        : current,
    );
    setLocalResponse(result.member.response);
    onResponded?.();
  };

  const handleJoin = async () => {
    if (!shared?.plan || !isDiscoverer || busy) return;
    setBusy(true);
    setError(null);
    const result = await joinOpenSharedPlanRemote(shared.plan.planId);
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

  const handleToggleTickets = (performanceKey, purchased) => {
    if (!localPlan || busy) return;
    const result = setAcceptedPlanPerformanceTicketsPurchased(
      resolvedStorage,
      localPlan.planId,
      performanceKey,
      purchased,
    );
    if (!result.ok) {
      setError('Couldn’t update tickets.');
      return;
    }
    setLocalPlan(getAcceptedPlanById(resolvedStorage, localPlan.planId));
    onPlansChanged?.();
  };

  const handleConfirmRemove = () => {
    if (!view?.localPlanId || busy) return;
    const result = removeAcceptedPlan(resolvedStorage, view.localPlanId);
    if (!result.ok || !result.changed) {
      setError('Couldn’t remove this plan.');
      return;
    }
    onPlansChanged?.();
    onBack?.();
  };

  if (status === 'loading') {
    return (
      <section className="v2-plan-detail" aria-label="Plan Details">
        <p className="v2-plan-detail-status">Loading plan…</p>
      </section>
    );
  }
  if (status === 'missing' || (status === 'ready' && !view)) {
    return (
      <section className="v2-plan-detail" data-plan-detail="missing">
        <p className="v2-plan-detail-status">This plan is no longer available.</p>
        {typeof onBack === 'function' ? (
          <button type="button" className="v2-plan-detail-text-btn" onClick={onBack}>
            Back
          </button>
        ) : null}
      </section>
    );
  }
  if (status === 'error' || !view) {
    return (
      <section className="v2-plan-detail">
        <p className="v2-plan-detail-error" role="alert">
          Couldn’t load this plan.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="v2-plan-detail-title" data-shared-plan-id={planId}>
      <PlanDetailView
        view={view}
        busy={busy}
        error={error}
        statusMessage={statusMessage}
        confirmRemove={confirmRemove}
        onOpenFilm={onOpenFilmDetail}
        onInvite={
          view.permissions.canInvite
            ? () => {
                if (!viewerId) {
                  setError('Sign in to invite friends.');
                  return;
                }
                setInviteOpen(true);
              }
            : null
        }
        onToggleTickets={view.permissions.canToggleTickets ? handleToggleTickets : null}
        onRespond={view.permissions.canRespond ? handleRespond : null}
        onJoin={view.permissions.canJoin ? handleJoin : null}
        onCalendar={exportCalendar}
        onRequestRemove={() => setConfirmRemove(true)}
        onConfirmRemove={handleConfirmRemove}
        onCancelRemove={() => setConfirmRemove(false)}
      />
      <InviteFriendsToPlanSheet
        open={inviteOpen}
        acceptedPlan={localPlan}
        sharedPlanId={shared?.plan?.planId ?? null}
        initialVisibility={shared?.plan?.visibility ?? null}
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
