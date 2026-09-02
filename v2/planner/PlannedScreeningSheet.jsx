/**
 * Planner — per-screening detail bottom sheet.
 *
 * Scoped to one accepted-plan performance (planId + performanceKey).
 * Canonical reference: Planner Main Page Upcoming Showtime Clickthrough.png
 */

import { useEffect, useId, useRef, useState } from 'react';
import {
  IconChevron,
  IconClose,
  IconInfo,
  IconTicket,
} from '../icons.jsx';
import { externalTicketLinkProps } from '../ticket/externalTicketUrl.js';
import { resolvePlannedScreeningPresentation } from './resolvePlannedScreeningPresentation.js';
import { isPlannerMockupMode } from '../fixtures/plannerLandingMockupFixture.js';
import {
  removePerformanceFromAcceptedPlan,
  setAcceptedPlanPerformanceTicketsPurchased,
} from '../stores/acceptedPlansStore.js';
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
 * @param {{
 *   selection: { planId: string, performanceKey: string } | null,
 *   open: boolean,
 *   onClose: () => void,
 *   storage?: Storage | null,
 *   homeData?: object | null,
 *   enrichmentIndex?: object | null,
 *   onOpenFilmDetail?: (payload: {
 *     filmKey: string,
 *     opportunityKey?: string | null,
 *   }) => void,
 *   onPlansChanged?: () => void,
 *   onStubAction?: (actionId: string, label: string) => void,
 * }} props
 */
export default function PlannedScreeningSheet({
  selection,
  open,
  onClose,
  storage: storageProp = null,
  homeData = null,
  enrichmentIndex = null,
  onOpenFilmDetail = null,
  onPlansChanged = null,
  onStubAction = null,
}) {
  const titleId = useId();
  const statusId = useId();
  const closeRef = useRef(null);
  const dialogRef = useRef(null);
  const storage = storageProp ?? getBrowserStorage();
  const mockupMode = isPlannerMockupMode();
  const [settingsTick, setSettingsTick] = useState(0);
  const [statusMessage, setStatusMessage] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(
    () => subscribeScheduleSettings(() => setSettingsTick((n) => n + 1)),
    [],
  );
  void settingsTick;
  void revision;

  const timeFormatId = getScheduleSettings(storage).timeFormatId;

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => closeRef.current?.focus(), 0);
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setConfirmRemove(false);
      setStatusMessage(null);
      setBusy(false);
    }
  }, [open, selection?.planId, selection?.performanceKey]);

  if (!open || !selection?.planId || !selection?.performanceKey) return null;

  const resolved = resolvePlannedScreeningPresentation({
    planId: selection.planId,
    performanceKey: selection.performanceKey,
    storage,
    homeData,
    enrichmentIndex,
    timeFormatId,
    mockupMode,
  });

  if (!resolved.ok || !resolved.screening) {
    return (
      <div
        className="v2-ss-backdrop"
        role="presentation"
        data-planned-screening-sheet="unavailable"
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div
          className="v2-ss-sheet v2-pss-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <div className="v2-ss-handle" aria-hidden="true" />
          <header className="v2-pss-header">
            <h1 id={titleId} className="v2-pss-title">
              Screening unavailable
            </h1>
            <button
              ref={closeRef}
              type="button"
              className="v2-ss-close"
              aria-label="Close screening details"
              onClick={onClose}
            >
              <IconClose />
            </button>
          </header>
          <p className="v2-pss-unavailable">
            This screening could not be loaded. It may have been removed from
            Planner.
          </p>
        </div>
      </div>
    );
  }

  const screening = resolved.screening;
  const other = resolved.otherShowtimes ?? {
    theaterName: screening.theaterName,
    visibleItems: [],
    moreCount: 0,
  };
  const ticketLink = externalTicketLinkProps(screening.ticketUrl);

  const handleTicketsPurchasedToggle = () => {
    if (busy || mockupMode) {
      if (mockupMode) {
        setStatusMessage('Ticket status is fixture-only in mockup mode.');
      }
      return;
    }
    setBusy(true);
    const next = !screening.ticketsPurchased;
    const result = setAcceptedPlanPerformanceTicketsPurchased(
      storage,
      screening.planId,
      screening.performanceKey,
      next,
    );
    if (result.ok && result.changed) {
      onPlansChanged?.();
      setRevision((n) => n + 1);
      setStatusMessage(next ? 'Marked tickets purchased.' : 'Tickets marked not purchased.');
    } else if (!result.ok) {
      setStatusMessage('Could not update ticket status.');
    }
    window.setTimeout(() => setBusy(false), 200);
  };

  const handleRemove = () => {
    if (busy) return;
    if (mockupMode) {
      setStatusMessage('Remove from Planner is fixture-only in mockup mode.');
      return;
    }
    setBusy(true);
    const result = removePerformanceFromAcceptedPlan(
      storage,
      screening.planId,
      screening.performanceKey,
    );
    if (result.ok && result.changed) {
      onPlansChanged?.();
      onClose();
    } else {
      setStatusMessage('Could not remove this screening from Planner.');
      setBusy(false);
    }
  };

  const handleOpenFilmDetail = () => {
    const filmKey = screening.filmKey;
    if (!filmKey || typeof onOpenFilmDetail !== 'function') {
      onStubAction?.('view-film-details', 'View film details');
      return;
    }
    onOpenFilmDetail({
      filmKey,
      opportunityKey: screening.opportunityKey ?? null,
    });
    onClose();
  };

  const handleOtherShowtime = (row) => {
    if (!row?.filmKey || typeof onOpenFilmDetail !== 'function') {
      onStubAction?.('other-showtime', 'Other showtime');
      return;
    }
    onOpenFilmDetail({
      filmKey: row.filmKey,
      opportunityKey: row.opportunityKey ?? null,
    });
    onClose();
  };

  return (
    <div
      className="v2-ss-backdrop"
      role="presentation"
      data-planned-screening-sheet="open"
      data-plan-id={screening.planId}
      data-performance-key={screening.performanceKey}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="v2-ss-sheet v2-pss-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="v2-ss-handle" aria-hidden="true" />

        <header className="v2-pss-header">
          <button
            ref={closeRef}
            type="button"
            className="v2-ss-close v2-pss-close"
            aria-label="Close screening details"
            onClick={onClose}
          >
            <IconClose />
          </button>
        </header>

        <div className="v2-pss-summary">
          {screening.posterUrl ? (
            <img
              className="v2-pss-poster"
              src={screening.posterUrl}
              alt=""
            />
          ) : (
            <span
              className="v2-pss-poster v2-pss-poster-fallback"
              aria-hidden="true"
            />
          )}
          <div className="v2-pss-summary-copy">
            <h1 id={titleId} className="v2-pss-title">
              {screening.title}
            </h1>
            <p className="v2-pss-datetime">
              {screening.dateLabel}
              {screening.timeLabel ? (
                <>
                  <span aria-hidden="true"> · </span>
                  {screening.timeLabel}
                </>
              ) : null}
            </p>
            {screening.theaterName ? (
              <p className="v2-pss-theater">{screening.theaterName}</p>
            ) : null}
            {screening.formatLabel ? (
              <span className="v2-pss-format">{screening.formatLabel}</span>
            ) : null}
          </div>
        </div>

        <div className="v2-pss-primary">
          {ticketLink ? (
            <a className="v2-pss-tickets-btn" {...ticketLink}>
              <IconTicket width={16} height={16} aria-hidden="true" />
              Get tickets
            </a>
          ) : (
            <button
              type="button"
              className="v2-pss-tickets-btn v2-pss-tickets-btn-disabled"
              disabled
            >
              <IconTicket width={16} height={16} aria-hidden="true" />
              Tickets unavailable
            </button>
          )}
        </div>

        {other.visibleItems?.length ? (
          <section
            className="v2-pss-other"
            aria-labelledby="v2-pss-other-h"
          >
            <h2 id="v2-pss-other-h" className="v2-pss-section-title">
              Other showtimes at {other.theaterName || screening.theaterName}
            </h2>
            <ul className="v2-pss-other-list">
              {other.visibleItems.map((row) => (
                <li key={row.opportunityKey ?? `${row.localDate}-${row.localTime}`}>
                  <button
                    type="button"
                    className="v2-pss-other-row"
                    onClick={() => handleOtherShowtime(row)}
                  >
                    <span className="v2-pss-other-time">{row.timeLabel}</span>
                    {row.formatLabel ? (
                      <span className="v2-pss-other-format">{row.formatLabel}</span>
                    ) : null}
                    <IconChevron
                      className="v2-pss-other-chevron"
                      width={14}
                      height={14}
                      aria-hidden="true"
                    />
                  </button>
                </li>
              ))}
            </ul>
            {other.moreCount > 0 ? (
              <p className="v2-pss-other-more">+ {other.moreCount} more showtimes</p>
            ) : null}
          </section>
        ) : null}

        <div className="v2-pss-divider" aria-hidden="true" />

        <div className="v2-pss-actions">
          <button
            type="button"
            className="v2-pss-action"
            onClick={handleOpenFilmDetail}
          >
            <IconInfo width={16} height={16} aria-hidden="true" />
            <span>View film details</span>
            <IconChevron
              className="v2-pss-action-chevron"
              width={14}
              height={14}
              aria-hidden="true"
            />
          </button>

          <label className="v2-pss-toggle-row">
            <span className="v2-pss-toggle-copy">Mark tickets purchased</span>
            <input
              type="checkbox"
              className="v2-pss-toggle-input"
              checked={screening.ticketsPurchased === true}
              disabled={busy}
              onChange={handleTicketsPurchasedToggle}
            />
            <span className="v2-pss-toggle" aria-hidden="true" />
          </label>
        </div>

        <div className="v2-pss-remove-wrap">
          {!confirmRemove ? (
            <button
              type="button"
              className="v2-pss-remove"
              disabled={busy}
              onClick={() => setConfirmRemove(true)}
            >
              Remove from Planner
            </button>
          ) : (
            <div className="v2-pss-remove-confirm">
              <p>Remove this screening from Planner?</p>
              <div className="v2-pss-remove-confirm-actions">
                <button
                  type="button"
                  className="v2-pss-remove-confirm-yes"
                  disabled={busy}
                  onClick={handleRemove}
                >
                  Remove
                </button>
                <button
                  type="button"
                  className="v2-pss-remove-confirm-no"
                  disabled={busy}
                  onClick={() => setConfirmRemove(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        <p id={statusId} className="v2-pss-status" role="status" aria-live="polite">
          {statusMessage ?? ''}
        </p>
      </div>
    </div>
  );
}
