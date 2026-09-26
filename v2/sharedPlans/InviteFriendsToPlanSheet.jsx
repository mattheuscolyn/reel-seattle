/**
 * Invite accepted friends to an existing Planner plan (promote → SharedPlan).
 */

import { useEffect, useMemo, useState } from 'react';
import FriendAvatar from '../friends/FriendAvatar.jsx';
import FriendsSheet from '../friends/FriendsSheet.jsx';
import { refreshFriends, getFriendsSnapshot } from '../friends/friendsStore.js';
import { friendDisplayLabel } from '../friends/friendsCopy.js';
import {
  SHARED_PLAN_INVITE_MESSAGE_MAX,
} from '../sharedPlans/sharedPlanModel.js';
import { promoteAcceptedPlanAndInvite } from '../sharedPlans/promoteAcceptedPlanAndInvite.js';
import { getSharedPlanBySourceAcceptedRemote, getSharedPlanRemote } from '../sharedPlans/sharedPlansApi.js';
import { formatMemberResponseLabel } from '../planner/mergeSharedPlansIntoPlannerLanding.js';
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
 *   open: boolean,
 *   acceptedPlanId?: string | null,
 *   acceptedPlan?: import('../stores/acceptedPlansStore.js').AcceptedPlanItem | null,
 *   ownerId: string | null,
 *   onClose?: () => void,
 *   onInvited?: (result: object) => void,
 * }} props
 */
export default function InviteFriendsToPlanSheet({
  open,
  acceptedPlanId = null,
  acceptedPlan: acceptedPlanProp = null,
  ownerId,
  onClose,
  onInvited,
}) {
  const acceptedPlan =
    acceptedPlanProp ??
    (acceptedPlanId
      ? getAcceptedPlanById(getBrowserStorage(), acceptedPlanId)
      : null);
  const [friends, setFriends] = useState(() => getFriendsSnapshot().friends);
  const [friendsStatus, setFriendsStatus] = useState(
    () => getFriendsSnapshot().status,
  );
  const [selected, setSelected] = useState(() => new Set());
  const [planType, setPlanType] = useState(/** @type {'proposal'|'decided'} */ ('proposal'));
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [confirm, setConfirm] = useState(/** @type {string | null} */ (null));
  const [existingMembers, setExistingMembers] = useState(
    /** @type {import('../sharedPlans/sharedPlanModel.js').PlanMember[]} */ ([]),
  );

  useEffect(() => {
    if (!open || !ownerId) return;
    let cancelled = false;
    (async () => {
      await refreshFriends(ownerId);
      if (cancelled) return;
      const snap = getFriendsSnapshot();
      setFriends(snap.friends);
      setFriendsStatus(snap.status);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, ownerId]);

  useEffect(() => {
    if (!open || !acceptedPlan?.planId || !ownerId) {
      setExistingMembers([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const found = await getSharedPlanBySourceAcceptedRemote(acceptedPlan.planId);
      if (cancelled || !found.ok || !found.plan) {
        if (!cancelled) setExistingMembers([]);
        return;
      }
      const full = await getSharedPlanRemote(found.plan.planId, {
        viewerId: ownerId,
      });
      if (cancelled) return;
      setExistingMembers(full.ok ? full.members : []);
      if (full.ok && (full.plan?.type === 'decided' || found.plan.type === 'decided')) {
        setPlanType('decided');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, acceptedPlan?.planId, ownerId]);

  useEffect(() => {
    if (!open) {
      setSelected(new Set());
      setMessage('');
      setError(null);
      setConfirm(null);
      setBusy(false);
      setPlanType('proposal');
    }
  }, [open]);

  const memberByUserId = useMemo(() => {
    /** @type {Map<string, import('../sharedPlans/sharedPlanModel.js').PlanMember>} */
    const map = new Map();
    for (const member of existingMembers) {
      map.set(member.userId, member);
    }
    return map;
  }, [existingMembers]);

  if (!open) return null;

  const toggle = (userId) => {
    if (memberByUserId.has(userId)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const selectedCount = selected.size;
  const sendLabel =
    selectedCount <= 1
      ? 'Send invite'
      : `Send invites (${selectedCount})`;

  const handleSend = async () => {
    if (busy || !acceptedPlan || !ownerId || selectedCount === 0) return;
    setBusy(true);
    setError(null);
    setConfirm(null);
    const result = await promoteAcceptedPlanAndInvite({
      acceptedPlan,
      ownerId,
      type: planType,
      inviteeIds: [...selected],
      message: message.trim() || null,
    });
    setBusy(false);
    if (!result.ok) {
      setError(
        result.reason === 'not_authenticated'
          ? 'Sign in to invite friends.'
          : result.reason === 'invalid_invitees'
            ? 'Select at least one friend.'
            : 'Couldn’t send invites. Try again.',
      );
      return;
    }
    const invitedCount = result.invited?.length ?? 0;
    setConfirm(
      invitedCount === 0
        ? 'Those friends are already on this plan.'
        : invitedCount === 1
          ? 'Invite sent.'
          : `${invitedCount} invites sent.`,
    );
    onInvited?.(result);
    window.setTimeout(() => {
      onClose?.();
    }, 900);
  };

  return (
    <FriendsSheet title="Invite friends" onClose={onClose}>
      <p className="v2-friends-sheet-lead">
        Share this plan with friends you already know on Reel Seattle.
      </p>

      <fieldset className="v2-plan-invite-type">
        <legend className="v2-plan-invite-legend">How are you sharing this?</legend>
        <label className="v2-plan-invite-type-option">
          <input
            type="radio"
            name="plan-invite-type"
            checked={planType === 'proposal'}
            disabled={busy || existingMembers.length > 1}
            onChange={() => setPlanType('proposal')}
          />
          <span>
            <strong>Proposing this plan</strong>
            <span className="v2-plan-invite-type-hint">
              See who’s interested before deciding.
            </span>
          </span>
        </label>
        <label className="v2-plan-invite-type-option">
          <input
            type="radio"
            name="plan-invite-type"
            checked={planType === 'decided'}
            disabled={busy}
            onChange={() => setPlanType('decided')}
          />
          <span>
            <strong>I’m going</strong>
            <span className="v2-plan-invite-type-hint">
              Tell friends you’ve decided to attend.
            </span>
          </span>
        </label>
      </fieldset>

      <div className="v2-plan-invite-message">
        <label htmlFor="v2-plan-invite-message-input">
          Add a message <span className="v2-plan-invite-optional">(optional)</span>
        </label>
        <textarea
          id="v2-plan-invite-message-input"
          className="v2-plan-invite-message-input"
          rows={2}
          maxLength={SHARED_PLAN_INVITE_MESSAGE_MAX}
          placeholder="Want to do this Saturday?"
          value={message}
          disabled={busy}
          onChange={(event) => setMessage(event.target.value)}
        />
      </div>

      {friendsStatus === 'loading' && friends.length === 0 ? (
        <p className="v2-friends-sheet-note">Loading friends…</p>
      ) : friends.length === 0 ? (
        <div className="v2-plan-invite-empty">
          <p>No friends to invite yet.</p>
          <p className="v2-friends-sheet-note">
            Add friends from Profile → Friends, then come back here.
          </p>
        </div>
      ) : (
        <ul className="v2-plan-invite-friend-list">
          {friends.map((friend) => {
            const existing = memberByUserId.get(friend.userId);
            const checked = selected.has(friend.userId);
            const disabled = Boolean(existing) || busy;
            return (
              <li key={friend.userId}>
                <label
                  className={`v2-plan-invite-friend-row${existing ? ' is-existing' : ''}`}
                >
                  <FriendAvatar
                    displayName={friend.displayName}
                    avatarUrl={friend.avatarUrl}
                    size="sm"
                  />
                  <span className="v2-plan-invite-friend-copy">
                    <span className="v2-plan-invite-friend-name">
                      {friendDisplayLabel(friend.displayName)}
                    </span>
                    {existing ? (
                      <span className="v2-plan-invite-friend-status">
                        {formatMemberResponseLabel(existing.response)}
                      </span>
                    ) : null}
                  </span>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggle(friend.userId)}
                    aria-label={
                      existing
                        ? `${friendDisplayLabel(friend.displayName)} already invited`
                        : `Invite ${friendDisplayLabel(friend.displayName)}`
                    }
                  />
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {existingMembers.filter((m) => m.role !== 'owner').length > 0 ? (
        <div className="v2-plan-invite-status-block">
          <p className="v2-plan-invite-legend">Invitation status</p>
          <ul className="v2-plan-invite-status-list">
            {existingMembers
              .filter((m) => m.role !== 'owner')
              .map((member) => {
                const friend = friends.find((f) => f.userId === member.userId);
                return (
                  <li key={member.userId}>
                    <span>
                      {friend
                        ? friendDisplayLabel(friend.displayName)
                        : 'Friend'}
                    </span>
                    <span>{formatMemberResponseLabel(member.response)}</span>
                  </li>
                );
              })}
          </ul>
        </div>
      ) : null}

      {error ? (
        <p className="v2-plan-invite-error" role="alert">
          {error}
        </p>
      ) : null}
      {confirm ? (
        <p className="v2-plan-invite-confirm" role="status">
          {confirm}
        </p>
      ) : null}

      <button
        type="button"
        className="v2-plan-invite-send"
        disabled={busy || selectedCount === 0 || !acceptedPlan || !ownerId}
        onClick={handleSend}
      >
        {busy ? 'Sending…' : sendLabel}
      </button>
    </FriendsSheet>
  );
}
