/**
 * Action sheet for one exact showtime — Add to Planner, calendar, tickets.
 */

import { useEffect, useId, useRef, useState } from 'react';
import {
  IconCalendar,
  IconChevron,
  IconClose,
  IconTicket,
} from '../icons.jsx';
import {
  calendarExportStatusMessage,
  exportOpportunityToCalendar,
} from '../calendar/exportFromOpportunity.js';
import { subscribeScheduleStoreMutations } from '../auth/scheduleStoreMutationBridge.js';
import { addShowtimeToPlanner } from '../planner/addSavedFilmShowtimeToPlanner.js';
import {
  getScheduleSettings,
  subscribeScheduleSettings,
} from '../stores/scheduleSettingsStore.js';
import {
  EXTERNAL_TICKET_LINK_RELS,
  EXTERNAL_TICKET_LINK_TARGET,
  externalTicketLinkProps,
} from '../ticket/externalTicketUrl.js';
import { resolveShowtimeActionSheetState } from './showtimeActionSheetModel.js';

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
 *   onClose: () => void,
 *   opportunity?: object | null,
 *   filmKey?: string | null,
 *   row?: object | null,
 *   storage?: Storage | null,
 *   homeData?: object | null,
 *   enrichmentIndex?: object | null,
 *   onPlansChanged?: () => void,
 * }} props
 */
export default function ShowtimeActionSheet({
  open,
  onClose,
  opportunity = null,
  filmKey = null,
  row = null,
  storage: storageProp = null,
  homeData = null,
  enrichmentIndex = null,
  onPlansChanged = null,
}) {
  const titleId = useId();
  const statusId = useId();
  const closeRef = useRef(null);
  const storage = storageProp ?? getBrowserStorage();
  const [settingsTick, setSettingsTick] = useState(0);
  const [plansTick, setPlansTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [localInPlanner, setLocalInPlanner] = useState(false);

  useEffect(
    () => subscribeScheduleSettings(() => setSettingsTick((n) => n + 1)),
    [],
  );
  useEffect(
    () =>
      subscribeScheduleStoreMutations(() => {
        setPlansTick((n) => n + 1);
        setLocalInPlanner(false);
      }),
    [],
  );
  void settingsTick;
  void plansTick;

  useEffect(() => {
    if (!open) {
      setStatusMessage(null);
      setBusy(false);
      setLocalInPlanner(false);
    }
  }, [open, opportunity?.opportunityKey, filmKey]);

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

  if (!open || !opportunity || !filmKey) return null;

  const timeFormatId = getScheduleSettings(storage).timeFormatId;
  const resolved = resolveShowtimeActionSheetState({
    storage,
    opportunity,
    filmKey,
    homeData,
    enrichmentIndex,
    timeFormatId,
    row,
  });

  if (!resolved.ok || !resolved.context) return null;

  const { context, ticketUrl } = resolved;
  const inPlanner = localInPlanner || resolved.inPlanner;
  const ticketLink = externalTicketLinkProps(ticketUrl);

  const handleAddToPlanner = () => {
    if (busy || inPlanner) return;
    setBusy(true);
    const result = addShowtimeToPlanner(storage, opportunity, filmKey, {
      homeData,
      enrichmentIndex,
    });
    if (result.ok) {
      if (result.performanceKey) {
        setLocalInPlanner(true);
      }
      onPlansChanged?.();
      if (result.status === 'already_planned') {
        setStatusMessage('Already in Planner.');
      } else {
        setStatusMessage('Added to Planner.');
      }
    } else {
      setStatusMessage('Could not add this showtime to Planner.');
    }
    setBusy(false);
  };

  const handleAddToCalendar = () => {
    const result = exportOpportunityToCalendar({
      opportunity,
      film: resolved.film,
      homeData,
    });
    setStatusMessage(calendarExportStatusMessage(result));
  };

  const screeningSummary = [
    context.filmTitle,
    context.dateLabel,
    context.timeLabel,
    context.theaterName,
    context.formatLabel,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      className="v2-ss-backdrop"
      role="presentation"
      data-showtime-action-sheet="open"
      data-opportunity-key={opportunity.opportunityKey ?? undefined}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="v2-ss-sheet v2-stas-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="v2-ss-handle" aria-hidden="true" />

        <header className="v2-stas-header">
          <button
            ref={closeRef}
            type="button"
            className="v2-ss-close v2-stas-close"
            aria-label="Close showtime actions"
            onClick={onClose}
          >
            <IconClose />
          </button>
        </header>

        <div className="v2-stas-summary">
          {context.posterUrl ? (
            <img className="v2-stas-poster" src={context.posterUrl} alt="" />
          ) : (
            <span
              className="v2-stas-poster v2-stas-poster-fallback"
              aria-hidden="true"
            />
          )}
          <div className="v2-stas-summary-copy">
            <h1 id={titleId} className="v2-stas-title">
              {context.filmTitle}
            </h1>
            <p className="v2-stas-meta">
              {[context.dateLabel, context.timeLabel].filter(Boolean).join(' · ')}
            </p>
            <p className="v2-stas-meta">{context.theaterName}</p>
            {context.formatLabel ? (
              <span className="v2-stas-format">{context.formatLabel}</span>
            ) : null}
          </div>
        </div>

        <div className="v2-stas-actions" aria-label="Showtime actions">
          {inPlanner ? (
            <span className="v2-stas-in-planner" role="status">
              In Planner
            </span>
          ) : (
            <button
              type="button"
              className="v2-stas-primary"
              disabled={busy}
              onClick={handleAddToPlanner}
              aria-label={`Add ${screeningSummary} to Planner`}
            >
              Add to Planner
              <IconChevron
                width={14}
                height={14}
                className="v2-stas-primary-chevron"
                aria-hidden="true"
              />
            </button>
          )}

          <button
            type="button"
            className="v2-stas-secondary"
            onClick={handleAddToCalendar}
            aria-label={`Add ${screeningSummary} to calendar`}
          >
            <IconCalendar width={16} height={16} aria-hidden="true" />
            Add to calendar
          </button>

          {ticketLink ? (
            <a
              className="v2-stas-secondary v2-stas-tickets"
              href={ticketLink.href}
              target={EXTERNAL_TICKET_LINK_TARGET}
              rel={EXTERNAL_TICKET_LINK_RELS}
              aria-label={`Tickets for ${screeningSummary} — opens ticket site in a new tab`}
            >
              <IconTicket width={16} height={16} aria-hidden="true" />
              Tickets
            </a>
          ) : null}
        </div>

        <button type="button" className="v2-stas-cancel" onClick={onClose}>
          Cancel
        </button>

        <p id={statusId} className="v2-stas-status" role="status" aria-live="polite">
          {statusMessage ?? ''}
        </p>
      </div>
    </div>
  );
}
