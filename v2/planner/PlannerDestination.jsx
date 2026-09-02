/**
 * Planner Landing — Upcoming / Saved films shell.
 *
 * Visual QC: `?plannerMockup=1` uses Canonical Planner Main Page Upcoming fixture.
 * Live mode composes accepted-plan screenings + overlap conflicts.
 */

import { useEffect, useId, useState } from 'react';
import {
  IconBookmark,
  IconCalendar,
  IconChevron,
  IconConflict,
  IconSparkle,
} from '../icons.jsx';
import {
  getPlannerLandingMockupPresentation,
  isPlannerMockupMode,
} from '../fixtures/plannerLandingMockupFixture.js';
import { composePlannerLandingFromAcceptedPlans } from './composePlannerLandingPresentation.js';
import PlannedScreeningSheet from './PlannedScreeningSheet.jsx';
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
 * @param {{ url?: string | null, title?: string, className?: string }} props
 */
function PosterThumb({ url, title = '', className = 'v2-planner-poster' }) {
  if (url) {
    return <img className={className} src={url} alt="" />;
  }
  return (
    <span
      className={`${className} v2-planner-poster-fallback`}
      aria-hidden="true"
      data-title={title}
    />
  );
}

function screeningSelectionFromRow(screening) {
  return {
    planId: screening.planId,
    performanceKey:
      screening.performanceKey ?? screening.id?.split('::')[1] ?? null,
  };
}

/**
 * @param {{
 *   screening: {
 *     id: string,
 *     planId: string,
 *     title: string,
 *     timeLabel?: string | null,
 *     venueLabel?: string | null,
 *     formatLabel?: string | null,
 *     posterUrl?: string | null,
 *     addedLabel?: string | null,
 *     inPlanner?: boolean,
 *   },
 *   onOpen: (screening: { planId: string, performanceKey?: string | null }) => void,
 * }} props
 */
function ScreeningRow({ screening, onOpen }) {
  const timeVenue = [screening.timeLabel, screening.venueLabel]
    .filter(Boolean)
    .join('  •  ');

  return (
    <button
      type="button"
      className="v2-planner-screening-row"
      data-screening-id={screening.id}
      data-plan-id={screening.planId}
      data-performance-key={screening.performanceKey ?? undefined}
      onClick={() => onOpen(screeningSelectionFromRow(screening))}
    >
      <PosterThumb
        url={screening.posterUrl}
        title={screening.title}
        className="v2-planner-poster v2-planner-poster-row"
      />
      <span className="v2-planner-screening-copy">
        <span className="v2-planner-screening-title">{screening.title}</span>
        {timeVenue ? (
          <span className="v2-planner-screening-meta">{timeVenue}</span>
        ) : null}
        {screening.formatLabel ? (
          <span className="v2-planner-format-pill">{screening.formatLabel}</span>
        ) : null}
        <span className="v2-planner-screening-status">
          {screening.inPlanner !== false ? (
            <span className="v2-planner-status-chip">
              <IconBookmark
                width={12}
                height={12}
                className="v2-planner-status-bookmark"
                aria-hidden="true"
              />
              In Planner
            </span>
          ) : null}
          {screening.addedLabel ? (
            <span className="v2-planner-status-chip">
              <IconCalendar width={12} height={12} aria-hidden="true" />
              {screening.addedLabel}
            </span>
          ) : null}
        </span>
      </span>
      <span className="v2-planner-screening-chevron" aria-hidden="true">
        <IconChevron width={14} height={14} />
      </span>
    </button>
  );
}

/**
 * @param {{
 *   screening: object,
 *   onOpen: (screening: { planId: string, performanceKey?: string | null }) => void,
 * }} props
 */
function ConflictSide({ screening, onOpen }) {
  return (
    <button
      type="button"
      className="v2-planner-conflict-side"
      data-screening-id={screening.id}
      data-plan-id={screening.planId}
      data-performance-key={screening.performanceKey ?? undefined}
      onClick={() => onOpen(screeningSelectionFromRow(screening))}
    >
      <PosterThumb
        url={screening.posterUrl}
        title={screening.title}
        className="v2-planner-poster v2-planner-poster-conflict"
      />
      <span className="v2-planner-conflict-side-title">{screening.title}</span>
      {screening.timeLabel ? (
        <span className="v2-planner-conflict-side-time">{screening.timeLabel}</span>
      ) : null}
      {screening.venueLabel ? (
        <span className="v2-planner-conflict-side-venue">
          {screening.venueLabel}
        </span>
      ) : null}
      <span className="v2-planner-conflict-side-status">
        {screening.addedLabel ? (
          <span className="v2-planner-status-chip">
            <IconCalendar width={11} height={11} aria-hidden="true" />
            {screening.addedLabel}
          </span>
        ) : null}
        {screening.inPlanner !== false ? (
          <span className="v2-planner-status-chip">
            <IconBookmark
              width={11}
              height={11}
              className="v2-planner-status-bookmark"
              aria-hidden="true"
            />
            In Planner
          </span>
        ) : null}
      </span>
    </button>
  );
}

/**
 * @param {{
 *   group: {
 *     id: string,
 *     bannerLabel: string,
 *     left: object,
 *     right: object,
 *   },
 *   onOpen: (screening: { planId: string, performanceKey?: string | null }) => void,
 * }} props
 */
function ConflictGroupCard({ group, onOpen }) {
  return (
    <div className="v2-planner-conflict-group" data-conflict-id={group.id}>
      <p className="v2-planner-conflict-banner">
        <span aria-hidden="true">✧</span> {group.bannerLabel}
      </p>
      <div className="v2-planner-conflict-split">
        <ConflictSide screening={group.left} onOpen={onOpen} />
        <div className="v2-planner-conflict-or" aria-hidden="true">
          <span className="v2-planner-conflict-or-line" />
          <span className="v2-planner-conflict-or-badge">OR</span>
        </div>
        <ConflictSide screening={group.right} onOpen={onOpen} />
      </div>
    </div>
  );
}

/**
 * @param {{
 *   onStubAction?: (actionId: string, label: string) => void,
 *   onOpenBuildPlan?: () => void,
 *   onOpenMyScheduleWeek?: () => void,
 *   onOpenFilmDetail?: (payload: {
 *     filmKey: string,
 *     opportunityKey?: string | null,
 *   }) => void,
 *   onAcceptedPlansChange?: () => void,
 *   homeData?: object | null,
 *   enrichmentIndex?: object | null,
 *   acceptedPlansRevision?: number,
 *   plannerSeed?: { filmKey?: string, opportunityKey?: string | null, mode?: string } | null,
 *   seedFilmTitle?: string | null,
 * }} [props]
 */
export default function PlannerDestination({
  onStubAction,
  onOpenBuildPlan,
  onOpenMyScheduleWeek,
  onOpenFilmDetail,
  onAcceptedPlansChange,
  homeData = null,
  enrichmentIndex = null,
  acceptedPlansRevision = 0,
  plannerSeed = null,
  seedFilmTitle = null,
}) {
  const mockupMode = isPlannerMockupMode();
  const storage = getBrowserStorage();
  const [settingsTick, setSettingsTick] = useState(0);
  const [activeTab, setActiveTab] = useState('upcoming');
  useEffect(
    () => subscribeScheduleSettings(() => setSettingsTick((n) => n + 1)),
    [],
  );
  void settingsTick;
  void acceptedPlansRevision;
  const timeFormatId = getScheduleSettings(storage).timeFormatId;
  const presentation = mockupMode
    ? getPlannerLandingMockupPresentation()
    : composePlannerLandingFromAcceptedPlans({ storage, timeFormatId });
  const stubStatusId = useId();
  const [stubMessage, setStubMessage] = useState(null);
  const [selectedScreening, setSelectedScreening] = useState(null);

  const announceStub = (actionId, label) => {
    const message = `${label} isn’t available yet.`;
    setStubMessage(message);
    onStubAction?.(actionId, label);
  };

  const {
    pageTitle,
    pageTagline,
    tabs,
    needsAttention,
    upcoming,
    savedFilms,
  } = presentation;

  const openBuild = () => {
    if (onOpenBuildPlan) onOpenBuildPlan();
    else announceStub('build-a-plan', 'Build a Plan');
  };

  const openTimeline = () => {
    if (onOpenMyScheduleWeek) onOpenMyScheduleWeek();
    else announceStub('view-full-timeline', 'View full timeline');
  };

  const openScreening = (target) => {
    const planId = typeof target?.planId === 'string' ? target.planId.trim() : '';
    const performanceKey =
      typeof target?.performanceKey === 'string'
        ? target.performanceKey.trim()
        : '';
    if (!planId || !performanceKey) {
      announceStub('screening-detail', 'Screening details');
      return;
    }
    setSelectedScreening({ planId, performanceKey });
  };

  const closeScreening = () => {
    setSelectedScreening(null);
  };

  const openReviewOptions = (item) => {
    announceStub(
      item?.id || 'review-options',
      item?.ctaLabel || 'Review options',
    );
  };

  const showNeedsAttention =
    activeTab === 'upcoming' &&
    Array.isArray(needsAttention?.items) &&
    needsAttention.items.length > 0;

  return (
    <section
      className="v2-planner"
      aria-labelledby="v2-planner-title"
      data-planner-source={presentation.source}
      data-planner-tab={activeTab}
    >
      <header className="v2-planner-page-header" data-planner-section="header">
        <div className="v2-planner-header-text">
          <h1 id="v2-planner-title" className="v2-planner-title">
            {pageTitle}
          </h1>
          <p className="v2-planner-tagline">{pageTagline}</p>
        </div>
        <button
          type="button"
          className="v2-planner-build-btn"
          onClick={openBuild}
        >
          <IconSparkle width={14} height={14} aria-hidden="true" />
          <span>Build a Plan</span>
        </button>
      </header>

      {plannerSeed ? (
        <div className="v2-planner-seed-note" role="status">
          <p className="v2-planner-seed-note-title">Starting from Film Detail</p>
          <p>
            Film: <strong>{seedFilmTitle ?? 'Selected film'}</strong>
          </p>
          <p>
            Mode:{' '}
            <strong>
              {plannerSeed.mode === 'multi'
                ? 'Build a movie day'
                : 'Add this film to my calendar'}
            </strong>
          </p>
          <p className="v2-planner-seed-note-muted">
            Use Build a Plan to continue from this film.
          </p>
        </div>
      ) : null}

      <div
        className="v2-planner-tabs"
        role="tablist"
        aria-label="Planner views"
        data-planner-section="tabs"
      >
        {(tabs ?? []).map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`v2-planner-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={
                tab.id === 'upcoming'
                  ? 'v2-planner-upcoming-panel'
                  : 'v2-planner-saved-panel'
              }
              tabIndex={selected ? 0 : -1}
              className={
                selected
                  ? 'v2-planner-tab v2-planner-tab-active'
                  : 'v2-planner-tab'
              }
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'upcoming' ? (
        <div
          id="v2-planner-upcoming-panel"
          role="tabpanel"
          aria-labelledby="v2-planner-tab-upcoming"
        >
          {showNeedsAttention ? (
            <section
              className="v2-planner-attention"
              data-planner-section="needsAttention"
              aria-labelledby="v2-planner-attention-h"
            >
              <div className="v2-planner-attention-heading">
                <h2
                  id="v2-planner-attention-h"
                  className="v2-planner-eyebrow"
                >
                  {needsAttention.sectionTitle}
                </h2>
                <span className="v2-planner-count-pill">
                  {needsAttention.count}
                </span>
              </div>
              <ul className="v2-planner-attention-list">
                {needsAttention.items.map((item) => (
                  <li key={item.id}>
                    <div className="v2-planner-attention-card">
                      <span
                        className="v2-planner-attention-icon"
                        aria-hidden="true"
                      >
                        <IconConflict width={20} height={20} />
                      </span>
                      <div className="v2-planner-attention-copy">
                        <p className="v2-planner-attention-headline">
                          {item.headline}
                        </p>
                        <p className="v2-planner-attention-body">{item.body}</p>
                        <button
                          type="button"
                          className="v2-planner-attention-cta"
                          onClick={() => openReviewOptions(item)}
                        >
                          {item.ctaLabel} →
                        </button>
                      </div>
                      {item.posterUrls?.length ? (
                        <div
                          className="v2-planner-attention-posters"
                          aria-hidden="true"
                        >
                          {item.posterUrls.slice(0, 2).map((url, index) => (
                            <PosterThumb
                              key={`${item.id}-poster-${index}`}
                              url={url}
                              className="v2-planner-poster v2-planner-poster-attention"
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section
            className="v2-planner-upcoming"
            data-planner-section="upcoming"
            aria-labelledby="v2-planner-upcoming-h"
          >
            <h2 id="v2-planner-upcoming-h" className="v2-planner-eyebrow">
              {upcoming.sectionTitle}
            </h2>

            {upcoming.dateGroups?.length ? (
              <div className="v2-planner-upcoming-panel">
                {upcoming.dateGroups.map((group) => (
                  <div
                    key={group.id}
                    className="v2-planner-date-group"
                    data-date-key={group.dateKey}
                  >
                    <h3 className="v2-planner-date-label">{group.label}</h3>
                    <div className="v2-planner-date-items">
                      {group.items.map((item) =>
                        item.kind === 'conflict-group' ? (
                          <ConflictGroupCard
                            key={item.id}
                            group={item}
                            onOpen={openScreening}
                          />
                        ) : (
                          <ScreeningRow
                            key={item.id}
                            screening={item}
                            onOpen={openScreening}
                          />
                        ),
                      )}
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  className="v2-planner-timeline-link"
                  onClick={openTimeline}
                >
                  <span>{upcoming.viewTimelineLabel}</span>
                  <IconChevron
                    width={14}
                    height={14}
                    className="v2-planner-timeline-chevron"
                    aria-hidden="true"
                  />
                </button>
              </div>
            ) : (
              <div className="v2-planner-empty" role="status">
                <p className="v2-planner-empty-title">
                  {upcoming.emptyTitle || 'No upcoming screenings yet'}
                </p>
                {upcoming.emptyBody ? (
                  <p className="v2-planner-empty-body">{upcoming.emptyBody}</p>
                ) : null}
              </div>
            )}
          </section>
        </div>
      ) : (
        <div
          id="v2-planner-saved-panel"
          role="tabpanel"
          aria-labelledby="v2-planner-tab-saved-films"
          data-planner-section="savedFilms"
          className="v2-planner-saved-stub"
        >
          <div className="v2-planner-empty" role="status">
            <p className="v2-planner-empty-title">
              {savedFilms?.emptyTitle || 'Saved films'}
            </p>
            {savedFilms?.emptyBody ? (
              <p className="v2-planner-empty-body">{savedFilms.emptyBody}</p>
            ) : null}
          </div>
        </div>
      )}

      <PlannedScreeningSheet
        selection={selectedScreening}
        open={Boolean(selectedScreening)}
        onClose={closeScreening}
        homeData={homeData}
        enrichmentIndex={enrichmentIndex}
        onOpenFilmDetail={onOpenFilmDetail}
        onPlansChanged={onAcceptedPlansChange}
        onStubAction={announceStub}
      />

      <p
        id={stubStatusId}
        className="v2-visually-hidden"
        role="status"
        aria-live="polite"
      >
        {stubMessage ?? ''}
      </p>
    </section>
  );
}
