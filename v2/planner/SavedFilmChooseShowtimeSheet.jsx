/**
 * Planner — Choose showtime bottom sheet for a saved film.
 *
 * Canonical reference: Planner Main Page Saved Films Choose Showtime Interaction.png
 */

import { useEffect, useId, useRef, useState } from 'react';
import {
  IconCalendar,
  IconChevron,
  IconClose,
} from '../icons.jsx';
import { isPlannerMockupMode } from '../fixtures/plannerLandingMockupFixture.js';
import { getPlannerSavedFilmsMockupRow } from '../fixtures/plannerSavedFilmsMockupFixture.js';
import {
  addSavedFilmShowtimeToPlanner,
  buildPerformanceKeyForOpportunity,
  listPlannedPerformanceKeys,
} from './addSavedFilmShowtimeToPlanner.js';
import { listSavedFilmChooseShowtimes } from './composePlannerSavedFilmsPresentation.js';
import { formatSavedFilmNextShowtimeLine } from './plannerSavedFilmsUrgency.js';
import { resolveFilm } from '../filmDetail/filmDetailModel.js';
import { enrichHomeFilm } from '../enrichment/enrichHomeFilm.js';
import {
  getScheduleSettings,
  subscribeScheduleSettings,
} from '../stores/scheduleSettingsStore.js';
import { PLANNER_SAVED_SHEET_VISIBLE } from './plannerSavedFilmsConfig.js';

function getBrowserStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/**
 * @param {{
 *   filmKey: string | null,
 *   row?: object | null,
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
 *   onAdded?: (message: string) => void,
 * }} props
 */
export default function SavedFilmChooseShowtimeSheet({
  filmKey,
  row = null,
  open,
  onClose,
  storage: storageProp = null,
  homeData = null,
  enrichmentIndex = null,
  onOpenFilmDetail = null,
  onPlansChanged = null,
  onAdded = null,
}) {
  const titleId = useId();
  const statusId = useId();
  const closeRef = useRef(null);
  const storage = storageProp ?? getBrowserStorage();
  const mockupMode = isPlannerMockupMode();
  const [settingsTick, setSettingsTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [statusMessage, setStatusMessage] = useState(null);
  const [localInPlanner, setLocalInPlanner] = useState(() => new Set());

  useEffect(
    () => subscribeScheduleSettings(() => setSettingsTick((n) => n + 1)),
    [],
  );
  void settingsTick;

  useEffect(() => {
    if (!open) {
      setStatusMessage(null);
      setBusy(false);
      setLocalInPlanner(new Set());
    }
  }, [open, filmKey]);

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

  if (!open || !filmKey) return null;

  const timeFormatId = getScheduleSettings(storage).timeFormatId;
  const mockRow = mockupMode ? getPlannerSavedFilmsMockupRow(filmKey) : null;
  const film = mockupMode ? null : resolveFilm(homeData, filmKey);
  const enriched = film
    ? enrichHomeFilm(film, enrichmentIndex, 'planner', homeData)
    : null;
  const title = row?.title ?? mockRow?.title ?? enriched?.displayTitle ?? film?.title ?? 'Untitled';
  const posterUrl = row?.posterUrl ?? mockRow?.posterUrl ?? enriched?.posterUrl ?? null;

  const plannedKeys = mockupMode
    ? new Set(
        (mockRow?.sheetShowtimes ?? [])
          .filter((s) => s.inPlanner)
          .map((s) => s.performanceKey)
          .filter(Boolean),
      )
    : listPlannedPerformanceKeys(storage);

  /** @type {object[]} */
  let showtimes = [];
  if (mockRow?.sheetShowtimes?.length) {
    showtimes = mockRow.sheetShowtimes.map((s) => ({ ...s }));
  } else if (film) {
    const opps = listSavedFilmChooseShowtimes(homeData, filmKey);
    showtimes = opps.slice(0, PLANNER_SAVED_SHEET_VISIBLE).map((opp) => {
      const performanceKey = buildPerformanceKeyForOpportunity(
        opp,
        film,
        enrichmentIndex,
        homeData,
      );
      return {
        opportunityKey: opp.opportunityKey ?? null,
        performanceKey,
        rowLabel: formatSavedFilmNextShowtimeLine(opp, timeFormatId),
        sortable: opp.sortableLocalDateTime,
        inPlanner: performanceKey ? plannedKeys.has(performanceKey) : false,
        opportunity: opp,
      };
    });
  }

  for (const key of localInPlanner) {
    const hit = showtimes.find((s) => s.performanceKey === key);
    if (hit) hit.inPlanner = true;
  }

  const moreCount =
    mockRow?.moreShowtimeCount ??
    Math.max(
      0,
      (film
        ? listSavedFilmChooseShowtimes(homeData, filmKey).length
        : showtimes.length) - PLANNER_SAVED_SHEET_VISIBLE,
    );

  const handleAdd = async (showtime) => {
    if (busy) return;
    if (showtime.inPlanner) return;

    if (mockupMode) {
      if (showtime.performanceKey) {
        setLocalInPlanner((prev) => new Set([...prev, showtime.performanceKey]));
      }
      setStatusMessage('Added to Planner (fixture preview).');
      onAdded?.('Added to Planner.');
      return;
    }

    const opp = showtime.opportunity;
    if (!opp) return;

    setBusy(true);
    const result = addSavedFilmShowtimeToPlanner(storage, opp, filmKey, {
      homeData,
      enrichmentIndex,
    });
    if (result.ok) {
      if (result.performanceKey) {
        setLocalInPlanner((prev) => new Set([...prev, result.performanceKey]));
      }
      onPlansChanged?.();
      setRevision((n) => n + 1);
      if (result.status === 'already_planned') {
        setStatusMessage('Already in Planner.');
      } else {
        setStatusMessage('Added to Planner.');
        onAdded?.('Added to Planner.');
      }
    } else {
      setStatusMessage('Could not add this showtime to Planner.');
    }
    setBusy(false);
  };

  const handleViewAll = () => {
    if (typeof onOpenFilmDetail !== 'function') return;
    onOpenFilmDetail({
      filmKey,
      opportunityKey: row?.nextOpportunityKey ?? showtimes[0]?.opportunityKey ?? null,
    });
    onClose();
  };

  void revision;

  return (
    <div
      className="v2-ss-backdrop"
      role="presentation"
      data-saved-film-choose-sheet="open"
      data-film-key={filmKey}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="v2-ss-sheet v2-sfcs-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="v2-ss-handle" aria-hidden="true" />

        <header className="v2-sfcs-header">
          <button
            ref={closeRef}
            type="button"
            className="v2-ss-close v2-sfcs-close"
            aria-label="Close choose showtime"
            onClick={onClose}
          >
            <IconClose />
          </button>
        </header>

        <div className="v2-sfcs-summary">
          {posterUrl ? (
            <img className="v2-sfcs-poster" src={posterUrl} alt="" />
          ) : (
            <span className="v2-sfcs-poster v2-sfcs-poster-fallback" aria-hidden="true" />
          )}
          <div className="v2-sfcs-summary-copy">
            <h1 id={titleId} className="v2-sfcs-title">
              {title}
            </h1>
            <p className="v2-sfcs-subtitle">
              Choose a showtime to add to your Planner.
            </p>
          </div>
        </div>

        {showtimes.length ? (
          <section className="v2-sfcs-showtimes" aria-labelledby="v2-sfcs-showtimes-h">
            <h2 id="v2-sfcs-showtimes-h" className="v2-sfcs-section-title">
              Available showtimes
            </h2>
            <ul className="v2-sfcs-showtimes-list">
              {showtimes.map((showtime) => (
                <li key={showtime.performanceKey ?? showtime.opportunityKey ?? showtime.rowLabel}>
                  <div className="v2-sfcs-showtime-row">
                    <span className="v2-sfcs-showtime-label">{showtime.rowLabel}</span>
                    {showtime.inPlanner ? (
                      <span className="v2-sfcs-in-planner">In Planner</span>
                    ) : (
                      <button
                        type="button"
                        className="v2-sfcs-add-btn"
                        disabled={busy}
                        onClick={() => handleAdd(showtime)}
                      >
                        Add to Planner
                        <IconChevron
                          width={14}
                          height={14}
                          className="v2-sfcs-add-chevron"
                          aria-hidden="true"
                        />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <p className="v2-sfcs-no-showtimes" role="status">
            No showtimes currently scheduled for this film.
          </p>
        )}

        <div className="v2-sfcs-footer">
          <button
            type="button"
            className="v2-sfcs-view-all"
            onClick={handleViewAll}
          >
            <IconCalendar width={16} height={16} aria-hidden="true" />
            View all showtimes
            {moreCount > 0 ? (
              <span className="v2-sfcs-view-all-count">+ {moreCount} more</span>
            ) : null}
          </button>
          <button type="button" className="v2-sfcs-cancel" onClick={onClose}>
            Cancel
          </button>
        </div>

        <p id={statusId} className="v2-sfcs-status" role="status" aria-live="polite">
          {statusMessage ?? ''}
        </p>
      </div>
    </div>
  );
}
