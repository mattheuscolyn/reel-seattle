/**
 * Focused invitation / shared-plan RSVP sheet for recipients (and owner status).
 */

import { useEffect, useState } from 'react';
import FriendAvatar from '../friends/FriendAvatar.jsx';
import FriendsSheet from '../friends/FriendsSheet.jsx';
import {
  getSharedPlanRemote,
  respondToSharedPlanRemote,
} from './sharedPlansApi.js';
import {
  formatMemberResponseLabel,
  sharedPlanRsvpOptions,
} from '../planner/mergeSharedPlansIntoPlannerLanding.js';
import { formatDisplayClock } from '../stores/scheduleSettingsStore.js';

/**
 * @param {{
 *   open: boolean,
 *   planId: string | null,
 *   viewerId: string | null,
 *   onClose?: () => void,
 *   onResponded?: (result: object) => void,
 * }} props
 */
export default function SharedPlanInviteDetailSheet({
  open,
  planId,
  viewerId,
  onClose,
  onResponded,
}) {
  const [status, setStatus] = useState(/** @type {'loading'|'ready'|'error'|'missing'} */ ('loading'));
  const [plan, setPlan] = useState(/** @type {import('./sharedPlanModel.js').SharedPlan | null} */ (null));
  const [members, setMembers] = useState(
    /** @type {import('./sharedPlanModel.js').PlanMember[]} */ ([]),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [localResponse, setLocalResponse] = useState(/** @type {string | null} */ (null));

  useEffect(() => {
    if (!open || !planId) return;
    let cancelled = false;
    setStatus('loading');
    setError(null);
    (async () => {
      const result = await getSharedPlanRemote(planId, { viewerId });
      if (cancelled) return;
      if (!result.ok) {
        setStatus(result.reason === 'plan_not_found' ? 'missing' : 'error');
        setPlan(null);
        setMembers([]);
        return;
      }
      setPlan(result.plan);
      setMembers(result.members);
      const mine = result.members.find((m) => m.userId === viewerId);
      setLocalResponse(mine?.response ?? null);
      setStatus('ready');
    })();
    return () => {
      cancelled = true;
    };
  }, [open, planId, viewerId]);

  if (!open) return null;

  const myMember = members.find((m) => m.userId === viewerId) ?? null;
  const isOwner = Boolean(plan && viewerId && plan.ownerId === viewerId);
  const options = plan ? sharedPlanRsvpOptions(plan.type) : [];

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
      prev.map((m) =>
        m.userId === viewerId ? result.member : m,
      ),
    );
    setLocalResponse(result.member.response);
    onResponded?.(result);
  };

  return (
    <FriendsSheet
      title={isOwner ? 'Shared plan' : 'Plan invitation'}
      onClose={onClose}
    >
      {status === 'loading' ? (
        <p className="v2-friends-sheet-note">Loading plan…</p>
      ) : status === 'missing' ? (
        <p className="v2-friends-sheet-note">
          This plan is no longer available.
        </p>
      ) : status === 'error' || !plan ? (
        <p className="v2-plan-invite-error" role="alert">
          Couldn’t load this plan.
        </p>
      ) : (
        <>
          <div className="v2-shared-plan-invite-header">
            <p className="v2-shared-plan-invite-eyebrow">
              {plan.type === 'decided' ? 'Going' : 'Proposal'}
            </p>
            <h3 className="v2-shared-plan-invite-title">
              {plan.label ||
                plan.screenings.map((s) => s.title).filter(Boolean).join(' + ') ||
                'Shared plan'}
            </h3>
            {myMember?.inviteMessage ? (
              <blockquote className="v2-shared-plan-invite-message">
                “{myMember.inviteMessage}”
              </blockquote>
            ) : null}
          </div>

          <ol className="v2-shared-plan-invite-screenings">
            {plan.screenings.map((screening) => (
              <li key={screening.performanceKey}>
                <span className="v2-shared-plan-invite-time">
                  {formatDisplayClock(screening.localTime, '12h') ||
                    screening.localTime}
                </span>
                <span className="v2-shared-plan-invite-film">
                  {screening.title}
                </span>
                <span className="v2-shared-plan-invite-venue">
                  {screening.theaterName}
                </span>
              </li>
            ))}
          </ol>

          {!isOwner && myMember ? (
            <div className="v2-shared-plan-rsvp">
              <p className="v2-plan-invite-legend">Your response</p>
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
            </div>
          ) : null}

          {isOwner ? (
            <div className="v2-plan-invite-status-block">
              <p className="v2-plan-invite-legend">Invitation status</p>
              <ul className="v2-plan-invite-status-list">
                {members
                  .filter((m) => m.role !== 'owner')
                  .map((member) => (
                    <li key={member.userId}>
                      <span className="v2-plan-invite-status-person">
                        <FriendAvatar size="sm" />
                        <span>Friend</span>
                      </span>
                      <span>{formatMemberResponseLabel(member.response)}</span>
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}

          {error ? (
            <p className="v2-plan-invite-error" role="alert">
              {error}
            </p>
          ) : null}
        </>
      )}
    </FriendsSheet>
  );
}
