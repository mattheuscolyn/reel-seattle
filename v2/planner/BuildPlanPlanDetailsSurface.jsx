/**
 * Build a Plan — Plan Details
 *
 * Origin: Results → View plan details.
 * Renders the selected Results plan (or Plan Details mockup fixture).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  IconCalendar,
  IconChevron,
  IconClock,
  IconCup,
  IconPin,
  IconSpark,
} from '../icons.jsx';
import {
  getBuildPlanPlanDetailsMockupPlan,
  isPlanDetailsMockupMode,
} from '../fixtures/buildPlanPlanDetailsMockupFixture.js';
import {
  calendarExportStatusMessage,
  exportPlanToCalendar,
} from '../calendar/exportFromOpportunity.js';
import { acceptResultsPlan } from './acceptPlanFromResults.js';
import { derivePlanDetailsViewModel } from './derivePlanDetailsViewModel.js';
import { resolveFilmDetailNavParams } from '../identity/filmIdentity.js';

function selectedFilmsForCalendarExport(plan) {
  if (!plan || !Array.isArray(plan.items)) return [];
  /** @type {object[]} */
  const films = [];
  for (const item of plan.items) {
    if (!item || item.type === 'break') continue;
    if (
      item.date &&
      (item.time || item.startTime) &&
      (item.runtime != null || item.runtimeMin != null) &&
      (item.filmKey || item.theaterId || item.theater_id)
    ) {
      films.push({
        title: item.title,
        date: item.date,
        time: item.time ?? item.startTime,
        runtime: item.runtime ?? item.runtimeMin,
        theater: item.theater ?? item.theaterName,
        theater_id: item.theaterId ?? item.theater_id,
        filmKey: item.filmKey,
        format: item.formatBadge ?? item.format,
        ticket_url: item.ticketUrl ?? item.ticket_url,
        source: item.source,
        source_showtime_id: item.sourceShowtimeId ?? item.source_showtime_id,
        publicShowtimeId: item.publicShowtimeId,
        addressLabel: item.addressLabel ?? null,
      });
    }
  }
  return films;
}
/**
 * @param {{
 *   plan: object | null,
 *   onBack: () => void,
 *   onShareReady?: (handler: (() => void) | null) => void,
 *   onAcceptedPlanChange?: () => void,
 *   onOpenFilmDetail?: (payload: {
 *     filmKey: string,
 *     opportunityKey?: string | null,
 *   }) => void,
 *   homeData?: object | null,
 *   storage?: Storage | null,
 *   dateLabel?: string | null,
 * }} props
 */
export default function BuildPlanPlanDetailsSurface({
  plan: planProp,
  onBack,
  onShareReady = null,
  onAcceptedPlanChange = null,
  onOpenFilmDetail = null,
  homeData = null,
  storage = null,
  dateLabel = null,
}) {
  const mockup = isPlanDetailsMockupMode();
  const plan = mockup ? getBuildPlanPlanDetailsMockupPlan() : planProp;
  const view = derivePlanDetailsViewModel(plan, { dateLabel });

  const backBusyRef = useRef(false);
  const actionBusyRef = useRef(false);
  const [scheduled, setScheduled] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);

  const resolvedStorage =
    storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);

  useEffect(() => {
    backBusyRef.current = false;
  }, [plan?.id]);

  const handleBack = useCallback(() => {
    if (backBusyRef.current) return;
    backBusyRef.current = true;
    onBack();
  }, [onBack]);

  const handleShare = useCallback(() => {
    const films = selectedFilmsForCalendarExport(plan);
    if (!films.length) {
      setStatusMessage(
        'Calendar export (.ics) needs real showtimes. Fixture plans can’t export yet.',
      );
      return;
    }
    const result = exportPlanToCalendar({
      planId: plan?.id ?? null,
      title: view?.title ?? 'Movie day plan',
      films,
    });
    setStatusMessage(calendarExportStatusMessage(result));
  }, [plan, view?.title]);

  useEffect(() => {
    onShareReady?.(handleShare);
    return () => onShareReady?.(null);
  }, [onShareReady, handleShare]);

  const handleAddToSchedule = useCallback(() => {
    if (actionBusyRef.current) return;
    if (scheduled) {
      setStatusMessage('Already in My Schedule.');
      return;
    }
    actionBusyRef.current = true;
    const result = acceptResultsPlan(plan, [], {
      storage: resolvedStorage,
      provenance: mockup || plan?.source === 'mockup-fixture' ? 'fixture' : plan?.provenance ?? plan?.source,
      label: view?.title ?? null,
    });
    setStatusMessage(result.message);
    if (result.ok) {
      setScheduled(true);
      if (result.changed) onAcceptedPlanChange?.();
    }
    window.setTimeout(() => {
      actionBusyRef.current = false;
    }, 400);
  }, [
    scheduled,
    plan,
    resolvedStorage,
    mockup,
    view?.title,
    onAcceptedPlanChange,
  ]);

  if (!view) {
    return (
      <article className="v2-bpd" aria-labelledby="v2-bpd-unavailable-title">
        <div className="v2-bpd-card v2-bpd-card-empty">
          <h1 id="v2-bpd-unavailable-title" className="v2-bpd-empty-title">
            Plan unavailable
          </h1>
          <p className="v2-bpd-empty-copy">
            This plan is no longer available. Head back to your results to pick
            another itinerary.
          </p>
          <button type="button" className="v2-bpd-empty-back" onClick={handleBack}>
            Back to results
          </button>
        </div>
      </article>
    );
  }

  return (
    <article
      className="v2-bpd"
      aria-labelledby="v2-bpd-title"
      data-plan-id={view.planId ?? undefined}
      data-bpd-source={mockup ? 'mockup-fixture' : view.provenance || 'live'}
    >
      <div className="v2-bpd-card">
        <header className="v2-bpd-intro">
          <div className="v2-bpd-sparkles" aria-hidden="true">
            <IconSpark width={22} height={22} />
            <IconSpark width={14} height={14} />
            <IconSpark width={10} height={10} />
          </div>
          <h1 id="v2-bpd-title" className="v2-bpd-title">
            {view.title}
          </h1>
          <p className="v2-bpd-summary-line">{view.summaryLine}</p>
        </header>

        <section className="v2-bpd-stats" aria-label="Plan statistics">
          <div className="v2-bpd-stat">
            <IconClock width={16} height={16} aria-hidden="true" />
            <div className="v2-bpd-stat-copy">
              <span className="v2-bpd-stat-value">{view.stats.totalLabel}</span>
              <span className="v2-bpd-stat-label">{view.stats.totalCaption}</span>
            </div>
          </div>
          <div className="v2-bpd-stat">
            <IconCup width={16} height={16} aria-hidden="true" />
            <div className="v2-bpd-stat-copy">
              <span className="v2-bpd-stat-value">{view.stats.breaksValue}</span>
              <span className="v2-bpd-stat-label">{view.stats.breaksCaption}</span>
            </div>
          </div>
          <div className="v2-bpd-stat">
            <IconPin width={16} height={16} aria-hidden="true" />
            <div className="v2-bpd-stat-copy">
              <span className="v2-bpd-stat-value">{view.stats.theatersValue}</span>
              <span className="v2-bpd-stat-label">
                {view.stats.theatersCaption}
              </span>
            </div>
          </div>
        </section>

        <section className="v2-bpd-itinerary" aria-label="Itinerary">
          <h2 className="v2-bpd-section-title">Itinerary</h2>
          <ol className="v2-bpd-timeline">
            {view.itinerary.map((row) =>
              row.kind === 'break' ? (
                <li key={row.id} className="v2-bpd-row v2-bpd-row-break">
                  <span className="v2-bpd-node v2-bpd-node-break" aria-hidden="true" />
                  <span className="v2-bpd-time v2-bpd-time-break">{row.timePill}</span>
                  <span className="v2-bpd-break-tile" aria-hidden="true">
                    <IconCup width={16} height={16} />
                  </span>
                  <div className="v2-bpd-row-copy">
                    <p className="v2-bpd-break-title">{row.breakLabel}</p>
                    {row.transferLabel ? (
                      <p className="v2-bpd-break-transfer">
                        {row.isTransfer && row.fromTheater && row.toTheater ? (
                          <>
                            <span>{row.fromTheater} →</span>
                            <span>{row.toTheater}</span>
                          </>
                        ) : (
                          row.transferLabel
                        )}
                      </p>
                    ) : null}
                  </div>
                </li>
              ) : (
                <li key={row.id} className="v2-bpd-row v2-bpd-row-film">
                  <span className="v2-bpd-node v2-bpd-node-film" aria-hidden="true" />
                  <span className="v2-bpd-time v2-bpd-time-film">{row.timePill}</span>
                  <button
                    type="button"
                    className="v2-bpd-film-open"
                    aria-label={`Open Film Detail for ${row.title}`}
                    disabled={
                      !resolveFilmDetailNavParams(row, homeData) ||
                      typeof onOpenFilmDetail !== 'function'
                    }
                    onClick={() => {
                      const params = resolveFilmDetailNavParams(row, homeData);
                      if (params) onOpenFilmDetail?.(params);
                    }}
                  >
                    {row.imageUrl ? (
                      <img
                        className="v2-bpd-poster"
                        src={row.imageUrl}
                        alt=""
                        width={50}
                        height={73}
                      />
                    ) : (
                      <span
                        className="v2-bpd-poster v2-bpd-poster-fallback"
                        aria-hidden="true"
                      />
                    )}
                    <div className="v2-bpd-row-copy">
                      <p className="v2-bpd-film-title">{row.title}</p>
                      {row.theater ? (
                        <p className="v2-bpd-film-theater">{row.theater}</p>
                      ) : null}
                      {row.formatBadge ? (
                        <span className="v2-bpd-badge">{row.formatBadge}</span>
                      ) : null}
                      {row.rangeLine ? (
                        <p className="v2-bpd-film-range">{row.rangeLine}</p>
                      ) : null}
                    </div>
                    <IconChevron
                      className="v2-bpd-film-chevron"
                      width={16}
                      height={16}
                      aria-hidden="true"
                    />
                  </button>
                </li>
              ),
            )}
          </ol>
        </section>

        <section className="v2-bpd-plan-summary" aria-label="Plan Summary">
          <h2 className="v2-bpd-section-title">Plan Summary</h2>
          <dl className="v2-bpd-summary-list">
            <div>
              <dt>Earliest start</dt>
              <dd>{view.summary.earliestStart}</dd>
            </div>
            <div>
              <dt>Latest finish</dt>
              <dd>{view.summary.latestFinish}</dd>
            </div>
            <div>
              <dt>Total time out</dt>
              <dd>{view.summary.totalTimeOut}</dd>
            </div>
            <div>
              <dt>Total movie runtime</dt>
              <dd>{view.summary.totalMovieRuntime}</dd>
            </div>
            <div>
              <dt>Total break time</dt>
              <dd>{view.summary.totalBreakTime}</dd>
            </div>
            <div>
              <dt>Total gaps (transfers)</dt>
              <dd>{view.summary.totalGaps}</dd>
            </div>
          </dl>
        </section>

        <div className="v2-bpd-actions">
          <button
            type="button"
            className={`v2-bpd-schedule${scheduled ? ' is-added' : ''}`}
            aria-pressed={scheduled}
            aria-label={
              scheduled ? 'Added to My Schedule' : 'Add to My Schedule'
            }
            onClick={handleAddToSchedule}
          >
            <IconCalendar width={16} height={16} aria-hidden="true" />
            <span>
              {scheduled ? 'Added to My Schedule' : 'Add to My Schedule'}
            </span>
          </button>
        </div>
      </div>

      {statusMessage ? (
        <p className="v2-visually-hidden" role="status" aria-live="polite">
          {statusMessage}
        </p>
      ) : null}
    </article>
  );
}
