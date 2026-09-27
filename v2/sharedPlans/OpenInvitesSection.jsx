/**
 * Open Invites — friends-visible SharedPlans the viewer has not joined.
 * Joining attaches membership to the same planId.
 */

import { useCallback, useEffect, useState } from 'react';
import FriendAvatar from '../friends/FriendAvatar.jsx';
import { friendDisplayLabel } from '../friends/friendsCopy.js';
import { formatDisplayClock } from '../stores/scheduleSettingsStore.js';
import {
  formatOpenInviteCardSummary,
  formatOpenInviteSocialLine,
  isSharedPlanUpcoming,
} from './sharedPlanCopy.js';
import {
  joinOpenSharedPlanRemote,
  listOpenFriendSharedPlansRemote,
} from './sharedPlansApi.js';

/**
 * @param {string | null} timeLabel
 */
function formatCardTime(timeLabel) {
  if (!timeLabel) return null;
  if (timeLabel.includes('–')) {
    const [start, end] = timeLabel.split('–');
    const a = formatDisplayClock(start, '12h') || start;
    const b = formatDisplayClock(end, '12h') || end;
    return `${a}–${b}`;
  }
  return formatDisplayClock(timeLabel, '12h') || timeLabel;
}

/**
 * @param {{
 *   signedIn: boolean,
 *   onViewPlan?: (planId: string) => void,
 *   onJoined?: () => void,
 * }} props
 */
export default function OpenInvitesSection({
  signedIn,
  onViewPlan = null,
  onJoined = null,
}) {
  const [status, setStatus] = useState(
    /** @type {'idle' | 'loading' | 'ready' | 'error'} */ ('idle'),
  );
  const [rows, setRows] = useState(
    /** @type {NonNullable<Awaited<ReturnType<typeof listOpenFriendSharedPlansRemote>>['plans']>} */ (
      []
    ),
  );
  const [busyId, setBusyId] = useState(/** @type {string | null} */ (null));
  const [error, setError] = useState(/** @type {string | null} */ (null));

  const load = useCallback(async () => {
    if (!signedIn) {
      setRows([]);
      setStatus('idle');
      return;
    }
    setStatus('loading');
    const result = await listOpenFriendSharedPlansRemote();
    if (!result.ok) {
      setStatus('error');
      return;
    }
    setRows(
      (result.plans ?? []).filter(
        (row) => row.plan.visibility === 'friends' && isSharedPlanUpcoming(row.plan),
      ),
    );
    setStatus('ready');
  }, [signedIn]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!signedIn) return null;

  const handleJoin = async (planId, planType) => {
    if (busyId) return;
    setBusyId(planId);
    setError(null);
    const result = await joinOpenSharedPlanRemote(planId);
    setBusyId(null);
    if (!result.ok) {
      setError('Couldn’t join this plan. Try again.');
      void load();
      return;
    }
    const expected = planType === 'decided' ? 'going' : 'interested';
    if (result.member.response !== expected || result.plan.planId !== planId) {
      setError('Couldn’t join this plan. Try again.');
      void load();
      return;
    }
    setRows((current) => current.filter((row) => row.plan.planId !== planId));
    onJoined?.();
  };

  return (
    <section className="v2-open-invites" aria-labelledby="v2-open-invites-title" data-open-invites="">
      <h2 id="v2-open-invites-title" className="v2-open-invites-title">
        Open Invites
      </h2>
      {status === 'loading' && rows.length === 0 ? (
        <p className="v2-open-invites-empty">Loading open invites…</p>
      ) : status === 'error' ? (
        <p className="v2-friends-error" role="status">
          Couldn’t load open invites.{' '}
          <button type="button" className="v2-profile-link" onClick={() => void load()}>
            Try again
          </button>
        </p>
      ) : rows.length === 0 ? (
        <p className="v2-open-invites-empty">
          No open invites right now.
          When friends open a plan to everyone, it’ll show up here.
        </p>
      ) : (
        <ul className="v2-open-invites-list">
          {rows.map((row) => {
            const summary = formatOpenInviteCardSummary(row.plan);
            const ownerName =
              friendDisplayLabel(row.owner?.displayName) || 'A friend';
            const social = formatOpenInviteSocialLine({
              ownerName,
              companionCount: row.companions.length,
              planType: row.plan.type,
            });
            const time = formatCardTime(summary.timeLabel);
            const meta = [summary.dateLabel, time].filter(Boolean).join(' · ');
            const planId = row.plan.planId;
            return (
              <li key={planId} className="v2-open-invites-card" data-open-invite={planId}>
                <p className="v2-open-invites-owner">
                  <FriendAvatar
                    displayName={row.owner?.displayName}
                    avatarUrl={row.owner?.avatarUrl}
                    size="sm"
                  />
                  <span>{ownerName} is planning:</span>
                </p>
                <p className="v2-open-invites-film">{summary.title}</p>
                {meta ? <p className="v2-open-invites-meta">{meta}</p> : null}
                {summary.venue ? (
                  <p className="v2-open-invites-meta">{summary.venue}</p>
                ) : null}
                {social ? <p className="v2-open-invites-social">{social}</p> : null}
                <div className="v2-open-invites-actions">
                  <button
                    type="button"
                    className="v2-profile-link"
                    onClick={() => onViewPlan?.(planId)}
                  >
                    View plan
                  </button>
                  <button
                    type="button"
                    className="v2-open-invites-join"
                    disabled={busyId === planId}
                    onClick={() => handleJoin(planId, row.plan.type)}
                  >
                    {busyId === planId
                      ? 'Joining…'
                      : row.plan.type === 'decided'
                        ? 'Join'
                        : 'Interested'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {error ? (
        <p className="v2-plan-invite-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
