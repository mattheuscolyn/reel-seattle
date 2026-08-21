/**
 * Opening This Week — live HomeData + enrichment when available (T-ENR-10),
 * otherwise Stage 1 mockup fixture for visual QC.
 *
 * Expand / More details are real. Save, Not interested, Sort, Filters stubs remain.
 */

import { useId, useState } from 'react';
import {
  IconBookmark,
  IconCalendar,
  IconChevron,
  IconClock,
  IconEyeOff,
  IconPin,
  IconSliders,
  IconStar,
} from '../icons.jsx';
import TmdbAttribution from '../enrichment/TmdbAttribution.jsx';
import { resolveOpeningThisWeekPresentation } from '../fixtures/openingThisWeekMockupFixture.js';
import { buildLiveOpeningThisWeekPresentation } from './buildLiveOpeningPresentation.js';

/**
 * @param {{
 *   onBack: () => void,
 *   backLabel?: string,
 *   homeData?: object | null,
 *   enrichmentIndex?: object | null,
 *   onOpenFilmDetail?: (payload: { filmKey: string, opportunityKey?: string | null }) => void,
 *   onStubAction?: (actionId: string, label: string) => void,
 * }} props
 */
export default function OpeningThisWeekSurface({
  onBack,
  backLabel = 'Home',
  homeData = null,
  enrichmentIndex = null,
  onOpenFilmDetail,
  onStubAction,
}) {
  const presentation = homeData
    ? buildLiveOpeningThisWeekPresentation(homeData, enrichmentIndex)
    : resolveOpeningThisWeekPresentation();
  const stubStatusId = useId();
  const [stubMessage, setStubMessage] = useState(null);
  const [expandedFilmKey, setExpandedFilmKey] = useState(null);

  const announceStub = (actionId, label) => {
    const message = `${label} isn’t available in this Stage 1 Opening shell yet.`;
    setStubMessage(message);
    onStubAction?.(actionId, label);
  };

  const toggleExpand = (filmKey) => {
    setExpandedFilmKey((current) => (current === filmKey ? null : filmKey));
  };

  return (
    <section
      className="v2-opening-page"
      aria-labelledby="v2-opening-page-title"
      data-opening-source={presentation.source}
    >
      <button
        type="button"
        className="v2-opening-page-back"
        aria-label={`Back to ${backLabel}`}
        onClick={onBack}
      >
        ← {backLabel}
      </button>

      <header className="v2-opening-page-header" data-opening-section="header">
        <h1 id="v2-opening-page-title" className="v2-opening-page-title">
          {presentation.pageTitle}
        </h1>
        <p className="v2-opening-page-count">{presentation.countLabel}</p>
      </header>

      <div
        className="v2-opening-page-controls"
        data-opening-section="controls"
      >
        <button
          type="button"
          className="v2-opening-page-sort"
          aria-label={`${presentation.sortLabel}: ${presentation.sortValue}`}
          onClick={() =>
            announceStub('sort', `${presentation.sortLabel}: ${presentation.sortValue}`)
          }
        >
          <span className="v2-opening-page-sort-label">
            {presentation.sortLabel}
          </span>
          <span className="v2-opening-page-sort-value">
            {presentation.sortValue}
            <span aria-hidden="true"> ▾</span>
          </span>
        </button>
        <button
          type="button"
          className="v2-opening-page-filters"
          onClick={() => announceStub('filters', presentation.filtersLabel)}
        >
          <IconSliders aria-hidden="true" />
          {presentation.filtersLabel}
        </button>
      </div>

      <ul
        className="v2-opening-page-list"
        data-opening-section="filmList"
        role="list"
      >
        {presentation.films.map((film) => {
          const expanded = expandedFilmKey === film.filmKey;
          const panelId = `v2-opening-expand-${film.filmKey}`;
          return (
            <li key={film.filmKey}>
              <article
                className={
                  expanded
                    ? 'v2-opening-card v2-opening-card-expanded'
                    : 'v2-opening-card'
                }
              >
                <button
                  type="button"
                  className="v2-opening-card-main"
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  onClick={() => toggleExpand(film.filmKey)}
                >
                  <span className="v2-opening-card-poster">
                    {film.posterUrl ? (
                      <img src={film.posterUrl} alt="" draggable="false" />
                    ) : (
                      <span
                        className="v2-shelf-poster-fallback"
                        aria-hidden="true"
                      />
                    )}
                  </span>
                  <span className="v2-opening-card-copy">
                    {film.badge ? (
                      <span className="v2-opening-card-badge">{film.badge}</span>
                    ) : null}
                    <span className="v2-opening-card-title">{film.title}</span>
                    {film.metaLine ? (
                      <span className="v2-opening-card-meta">{film.metaLine}</span>
                    ) : null}
                    {film.synopsis ? (
                      <span className="v2-opening-card-synopsis">
                        {film.synopsis}
                      </span>
                    ) : null}
                    <span className="v2-opening-card-showing">
                      {film.dateLabel ? (
                        <span className="v2-opening-card-fact">
                          <IconCalendar width={12} height={12} aria-hidden="true" />
                          {film.dateLabel}
                        </span>
                      ) : null}
                      {film.theaterName ? (
                        <span className="v2-opening-card-fact">
                          <IconPin width={12} height={12} aria-hidden="true" />
                          {film.theaterName}
                        </span>
                      ) : null}
                      {expanded && film.timeLabel ? (
                        <span className="v2-opening-card-fact">
                          <IconClock aria-hidden="true" />
                          {film.timeLabel}
                        </span>
                      ) : null}
                      {film.formatLabel ? (
                        <span className="v2-opening-card-format">
                          {film.formatLabel}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <span className="v2-opening-card-chevron" aria-hidden="true">
                    {expanded ? '⌃' : <IconChevron />}
                  </span>
                </button>

                {expanded ? (
                  <div
                    id={panelId}
                    className="v2-opening-card-expand"
                    role="region"
                    aria-label={`Quick details for ${film.title}`}
                  >
                    {(film.whySeeIt || film.alsoPlaying) && (
                      <div className="v2-opening-card-panels">
                        {film.whySeeIt ? (
                          <div className="v2-opening-card-panel">
                            <p className="v2-opening-card-panel-label">
                              Why see it
                            </p>
                            <p className="v2-opening-card-why">
                              <IconStar
                                width={14}
                                height={14}
                                aria-hidden="true"
                              />
                              <span>{film.whySeeIt}</span>
                            </p>
                          </div>
                        ) : null}
                        {film.alsoPlaying ? (
                          <div className="v2-opening-card-panel">
                            <p className="v2-opening-card-panel-label">
                              Also playing at
                            </p>
                            <button
                              type="button"
                              className="v2-opening-card-also"
                              onClick={() =>
                                announceStub(
                                  `also-${film.filmKey}`,
                                  film.alsoPlaying.theaterName,
                                )
                              }
                            >
                              <span className="v2-opening-card-also-copy">
                                <span className="v2-opening-card-also-theater">
                                  {film.alsoPlaying.theaterName}
                                </span>
                                <span className="v2-opening-card-also-detail">
                                  {film.alsoPlaying.detailLabel}
                                </span>
                              </span>
                              <IconChevron aria-hidden="true" />
                            </button>
                          </div>
                        ) : null}
                      </div>
                    )}

                    <div className="v2-opening-card-actions">
                      <button
                        type="button"
                        className="v2-opening-card-action"
                        onClick={() =>
                          announceStub(`save-${film.filmKey}`, `Save ${film.title}`)
                        }
                      >
                        <IconBookmark width={16} height={16} aria-hidden="true" />
                        Save
                      </button>
                      <button
                        type="button"
                        className="v2-opening-card-action"
                        onClick={() =>
                          announceStub(
                            `ni-${film.filmKey}`,
                            `Not interested · ${film.title}`,
                          )
                        }
                      >
                        <IconEyeOff width={16} height={16} aria-hidden="true" />
                        Not interested
                      </button>
                      <button
                        type="button"
                        className="v2-opening-card-more"
                        onClick={() =>
                          onOpenFilmDetail?.({
                            filmKey: film.filmKey,
                            opportunityKey: film.opportunityKey ?? null,
                          })
                        }
                      >
                        More details
                        <IconChevron aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ) : null}
              </article>
            </li>
          );
        })}
      </ul>

      <p
        id={stubStatusId}
        className="v2-visually-hidden"
        role="status"
        aria-live="polite"
      >
        {stubMessage ?? ''}
      </p>

      <TmdbAttribution compact />
    </section>
  );
}
