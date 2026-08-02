/**
 * Adjust Film in Plans — Require / Prefer / Exclude + Seen / Not interested.
 */

import { useEffect, useId, useState } from 'react';
import {
  IconBan,
  IconCheckCircle,
  IconClapper,
  IconEye,
  IconHeart,
} from '../icons.jsx';
import PlanAdjustmentDialog from './PlanAdjustmentDialog.jsx';

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
 *   film: { id: string, title: string, imageUrl?: string },
 *   preference: 'require' | 'prefer' | 'exclude',
 *   seen: boolean,
 *   notInterested: boolean,
 *   onCancel: () => void,
 *   onApply: (next: {
 *     preference: 'require' | 'prefer' | 'exclude',
 *     seen: boolean,
 *     notInterested: boolean,
 *   }) => void,
 * }} props
 */
export default function AdjustFilmInPlansOverlay({
  film,
  preference,
  seen,
  notInterested,
  onCancel,
  onApply,
}) {
  const groupId = useId();
  const [draftPref, setDraftPref] = useState(preference);
  const [draftSeen, setDraftSeen] = useState(seen);
  const [draftNi, setDraftNi] = useState(notInterested);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraftPref(preference);
    setDraftSeen(seen);
    setDraftNi(notInterested);
    setBusy(false);
  }, [preference, seen, notInterested, film?.id]);

  const handleApply = () => {
    if (busy) return;
    setBusy(true);
    onApply({
      preference: draftPref,
      seen: draftSeen,
      notInterested: draftNi,
    });
  };

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
