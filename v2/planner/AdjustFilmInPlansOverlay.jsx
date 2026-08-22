/**
 * Adjust Film in Plans — Require / Prefer / Exclude + Seen / Not interested
 * + exact-showtime Lock / Unlock (orthogonal to film preference).
 *
 * Lock switch semantics: checked = exact showtime is locked (draftLock).
 * Label/copy derive from that staged checked state — never invert the boolean.
 */

import { useEffect, useId, useState } from 'react';
import {
  IconBan,
  IconCheckCircle,
  IconClapper,
  IconEye,
  IconHeart,
  IconLock,
} from '../icons.jsx';
import PlanAdjustmentDialog from './PlanAdjustmentDialog.jsx';
import { exactScreeningLockCopy } from './resultsShowtimeLock.js';

export { exactScreeningLockCopy } from './resultsShowtimeLock.js';

export const FILM_PLAN_PREFERENCES = Object.freeze([
  Object.freeze({
    id: 'require',
    label: 'Require this film',
    support: 'Include this film in plans. Only show plans that include it.',
    icon: 'check',
  }),
  Object.freeze({
    id: 'prefer',
    label: 'Prefer this film',
    support: 'Try to include this film, but plans may work without it.',
    icon: 'heart',
  }),
  Object.freeze({
    id: 'exclude',
    label: 'Exclude this film',
    support: 'Remove this film from all plans.',
    icon: 'ban',
  }),
]);

const PREF_ICONS = {
  check: IconCheckCircle,
  heart: IconHeart,
  ban: IconBan,
};

/**
 * @param {{
 *   film: { id: string, title: string, imageUrl?: string, performanceKey?: string | null },
 *   preference: 'require' | 'prefer' | 'exclude',
 *   seen: boolean,
 *   notInterested: boolean,
 *   lockShowtime?: boolean,
 *   canLockShowtime?: boolean,
 *   onCancel: () => void,
 *   onApply: (next: {
 *     preference: 'require' | 'prefer' | 'exclude',
 *     seen: boolean,
 *     notInterested: boolean,
 *     lockShowtime: boolean,
 *   }) => void,
 * }} props
 */
export default function AdjustFilmInPlansOverlay({
  film,
  preference,
  seen,
  notInterested,
  lockShowtime = false,
  canLockShowtime = true,
  onCancel,
  onApply,
}) {
  const groupId = useId();
  const lockSectionId = useId();
  const [draftPref, setDraftPref] = useState(preference);
  const [draftSeen, setDraftSeen] = useState(Boolean(seen));
  const [draftNi, setDraftNi] = useState(Boolean(notInterested));
  /** Staged: exact showtime is locked (checked = locked). */
  const [draftLock, setDraftLock] = useState(Boolean(lockShowtime));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraftPref(preference);
    setDraftSeen(Boolean(seen));
    setDraftNi(Boolean(notInterested));
    setDraftLock(Boolean(lockShowtime));
    setBusy(false);
  }, [
    preference,
    seen,
    notInterested,
    lockShowtime,
    film?.id,
    film?.performanceKey,
  ]);

  const handleApply = () => {
    if (busy) return;
    setBusy(true);
    onApply({
      preference: draftPref,
      seen: draftSeen,
      notInterested: draftNi,
      lockShowtime: canLockShowtime ? draftLock : false,
    });
  };

  const lockCopy = exactScreeningLockCopy(draftLock);

  return (
    <PlanAdjustmentDialog
      data-adjustment="film"
      headerLayout="centered"
      title="Adjust film in plans"
      subtitle={film.title}
      support="Choose how this film should affect your movie day results."
      icon={<IconClapper width={24} height={24} />}
      onCancel={onCancel}
      footer={
        <>
          <button
            type="button"
            className="v2-bpr-adj-btn v2-bpr-adj-btn-cancel"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="v2-bpr-adj-btn v2-bpr-adj-btn-apply"
            disabled={busy}
            onClick={handleApply}
          >
            Apply
          </button>
        </>
      }
    >
      <div
        className="v2-bpr-adj-prefs"
        role="radiogroup"
        aria-labelledby={groupId}
      >
        <span id={groupId} className="v2-visually-hidden">
          Planning preference for {film.title}
        </span>
        {FILM_PLAN_PREFERENCES.map((opt) => {
          const Icon = PREF_ICONS[opt.icon] ?? IconHeart;
          const selected = draftPref === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`v2-bpr-adj-pref${selected ? ' is-selected' : ''}`}
              onClick={() => setDraftPref(opt.id)}
            >
              <span className="v2-bpr-adj-pref-icon" aria-hidden="true">
                <Icon width={16} height={16} />
              </span>
              <span className="v2-bpr-adj-pref-copy">
                <span className="v2-bpr-adj-pref-label">{opt.label}</span>
                <span className="v2-bpr-adj-pref-support">{opt.support}</span>
              </span>
              <span
                className={`v2-bpr-adj-radio${selected ? ' is-on' : ''}`}
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>

      {canLockShowtime ? (
        <div className="v2-bpr-adj-lock" data-adj-section="exact-screening">
          <p id={lockSectionId} className="v2-bpr-adj-status-label">
            Exact screening
          </p>
          <button
            type="button"
            role="switch"
            aria-checked={draftLock}
            aria-labelledby={lockSectionId}
            className={`v2-bpr-adj-pref v2-bpr-adj-lock-toggle${
              draftLock ? ' is-selected' : ''
            }`}
            onClick={() => setDraftLock((v) => !v)}
            data-lock-checked={draftLock ? 'true' : 'false'}
            data-lock-action={draftLock ? 'unlock' : 'lock'}
          >
            <span className="v2-bpr-adj-pref-icon" aria-hidden="true">
              <IconLock width={16} height={16} />
            </span>
            <span className="v2-bpr-adj-pref-copy">
              <span className="v2-bpr-adj-pref-label">{lockCopy.label}</span>
              <span className="v2-bpr-adj-pref-support">{lockCopy.support}</span>
            </span>
            <span
              className={`v2-bp-switch${draftLock ? ' is-on' : ''}`}
              aria-hidden="true"
              data-switch-on={draftLock ? 'true' : 'false'}
            >
              <span className="v2-bp-switch-track" />
            </span>
          </button>
        </div>
      ) : null}

      <div className="v2-bpr-adj-status">
        <p className="v2-bpr-adj-status-label">Your film status</p>
        <div className="v2-bpr-adj-status-card">
          <div className="v2-bpr-adj-toggle-row">
            <span className="v2-bpr-adj-toggle-lead" aria-hidden="true">
              <IconEye width={15} height={15} />
            </span>
            <span className="v2-bpr-adj-toggle-text">Seen</span>
            <button
              type="button"
              className={`v2-bp-switch${draftSeen ? ' is-on' : ''}`}
              role="switch"
              aria-checked={draftSeen}
              aria-label={`Seen: ${film.title}`}
              data-switch-on={draftSeen ? 'true' : 'false'}
              onClick={() => {
                setDraftSeen((v) => {
                  const next = !v;
                  if (next) setDraftNi(false);
                  return next;
                });
              }}
            >
              <span className="v2-bp-switch-track" aria-hidden="true" />
            </button>
          </div>
          <div className="v2-bpr-adj-toggle-row">
            <span className="v2-bpr-adj-toggle-lead" aria-hidden="true">
              <IconBan width={15} height={15} />
            </span>
            <span className="v2-bpr-adj-toggle-text">Not interested</span>
            <button
              type="button"
              className={`v2-bp-switch${draftNi ? ' is-on' : ''}`}
              role="switch"
              aria-checked={draftNi}
              aria-label={`Not interested: ${film.title}`}
              data-switch-on={draftNi ? 'true' : 'false'}
              onClick={() => {
                setDraftNi((v) => {
                  const next = !v;
                  if (next) setDraftSeen(false);
                  return next;
                });
              }}
            >
              <span className="v2-bp-switch-track" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </PlanAdjustmentDialog>
  );
}
