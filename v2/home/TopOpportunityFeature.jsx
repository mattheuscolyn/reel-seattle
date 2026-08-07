import { useEffect, useId, useMemo, useState } from 'react';
import {
  canGoNext,
  canGoPrevious,
  clampSelectionIndex,
  selectTopOpportunities,
} from '../adapters/selectTopOpportunities.js';
import { enrichHomeFilm } from '../enrichment/enrichHomeFilm.js';
import { IconInfo, IconTicket } from '../icons.jsx';
import OpportunityImageStage from '../topOpportunities/OpportunityImageStage.jsx';
import {
  buildPositionLabel,
  buildShowingContextLabel,
  formatUserFacingFormatLabel,
} from '../topOpportunities/topOpportunityFormat.js';
import { formatRuntimeLabel } from './shelfData.js';

/**
 * Top Opportunity — real HomeData via selectTopOpportunities.
 * Optional `mockSelections` is for `?homeMockup=1` visual QC only.
 *
 * @param {{
 *   status: 'loading' | 'ready' | 'error',
 *   homeData: object | null,
 *   enrichmentIndex?: object | null,
 *   errorMessage?: string | null,
 *   initialIndex?: number,
 *   onIndexChange?: (index: number) => void,
 *   mockSelections?: object[] | null,
 *   onOpenFilmDetail: (payload: {
 *     filmKey: string,
 *     opportunityKey: string | null,
 *     topOppIndex: number,
 *   }) => void,
 * }} props
 */
export default function TopOpportunityFeature({
  status,
  homeData,
  enrichmentIndex = null,
  errorMessage = null,
  initialIndex = 0,
  onIndexChange,
  mockSelections = null,
  onOpenFilmDetail,
}) {
  const headingId = useId();
  const [index, setIndex] = useState(initialIndex);

  const selections = Array.isArray(mockSelections)
    ? mockSelections
    : status === 'ready' && homeData
      ? selectTopOpportunities(homeData)
      : [];
  const length = selections.length;
  const safeIndex = clampSelectionIndex(index, length);
  const rawActive = selections[safeIndex] ?? null;

  const active = useMemo(() => {
    if (!rawActive?.film) return rawActive;
    if (Array.isArray(mockSelections)) return rawActive;
    const enriched = enrichHomeFilm(
      rawActive.film,
      enrichmentIndex,
      'home',
      homeData,
    );
    return {
      ...rawActive,
      film: {
        ...rawActive.film,
        filmId: enriched.filmId ?? rawActive.film.filmId ?? null,
        title: enriched.displayTitle ?? rawActive.film.title,
        posterUrl: enriched.posterUrl ?? rawActive.film.posterUrl ?? null,
        runtimeMin: enriched.runtimeMin ?? rawActive.film.runtimeMin ?? null,
      },
    };
  }, [rawActive, enrichmentIndex, homeData, mockSelections]);

  useEffect(() => {
    setIndex((current) => clampSelectionIndex(current, length));
  }, [length, homeData?.generatedAt]);

  useEffect(() => {
    if (initialIndex !== safeIndex && length > 0) {
      setIndex(clampSelectionIndex(initialIndex, length));
    }
    // Only sync when parent restore changes initialIndex.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialIndex]);

  const setSafeIndex = (next) => {
    const clamped = clampSelectionIndex(next, length);
    setIndex(clamped);
    onIndexChange?.(clamped);
  };

  const prevEnabled = canGoPrevious(safeIndex, length);
  const nextEnabled = canGoNext(safeIndex, length);
  const showControls = length > 1;

  const runtimeLabel = formatRuntimeLabel(active?.film?.runtimeMin);
  const formatLabels = Array.isArray(
    active?.representativeOpportunity?.formatLabels,
  )
    ? [
        ...new Set(
          active.representativeOpportunity.formatLabels
            .map(formatUserFacingFormatLabel)
            .filter(Boolean),
        ),
      ]
    : [];
  const genre =
    typeof active?.film?.genre === 'string' && active.film.genre.trim()
      ? active.film.genre.trim()
      : null;
  const metaLine =
    [runtimeLabel, genre, ...formatLabels].filter(Boolean).join(' · ') || null;
  const showingLabel = buildShowingContextLabel(active);

  return (
    <section
      className="v2-top-opp"
      aria-labelledby={headingId}
      data-source={
        Array.isArray(mockSelections) ? 'home-landing-mockup' : 'selectTopOpportunities'
      }
    >
      <div className="v2-top-opp-bar">
        <div className="v2-top-opp-label-group">
          <h2 id={headingId} className="v2-top-opp-label">
            Top Opportunity
          </h2>
          <span
            className="v2-top-opp-info"
            title="Mechanical selection from current showtimes — not a recommendation engine"
          >
            <IconInfo />
            <span className="v2-visually-hidden">
              Mechanical selection from current showtimes, not a recommendation
              engine.
            </span>
          </span>
        </div>
        {length > 0 ? (
          <p className="v2-top-opp-position" aria-live="polite">
            {buildPositionLabel(safeIndex, length)}
          </p>
        ) : null}
      </div>

      {status === 'loading' ? (
        <p className="v2-top-state" role="status">
          Loading current opportunities…
        </p>
      ) : null}

      {status === 'error' ? (
        <p className="v2-top-state v2-top-state-error" role="alert">
          {errorMessage || 'Unable to load Home opportunities.'}
        </p>
      ) : null}

      {status === 'ready' && length === 0 ? (
        <p className="v2-top-state" role="status">
          No featured opportunities in the current window.
        </p>
      ) : null}

      {active ? (
        <>
          <article
            className="v2-feature"
            aria-labelledby="v2-top-film-title"
            aria-roledescription="slide"
            aria-label={`${active.film.title}, ${buildPositionLabel(safeIndex, length)}`}
          >
            <button
              type="button"
              className="v2-feature-hit"
              onClick={() =>
                onOpenFilmDetail({
                  filmKey: active.film.filmKey,
                  opportunityKey:
                    active.representativeOpportunity?.opportunityKey ?? null,
                  topOppIndex: safeIndex,
                })
              }
              aria-label={`Open details for ${active.film.title}`}
            >
              <div className="v2-feature-media">
                <OpportunityImageStage
                  title={active.film.title}
                  posterUrl={active.film.posterUrl}
                  backdropUrl={active.film.backdropUrl ?? null}
                />
                <p className="v2-feature-badge">Featured</p>
                <div className="v2-feature-overlay">
                  <h3 id="v2-top-film-title" className="v2-feature-title">
                    {active.film.title}
                  </h3>
                  {showingLabel ? (
                    <p className="v2-feature-showing">{showingLabel}</p>
                  ) : null}
                  {metaLine ? (
                    <p className="v2-feature-supporting">{metaLine}</p>
                  ) : null}
                </div>
              </div>
            </button>

            {showControls ? (
              <div
                className="v2-feature-arrows"
                role="group"
                aria-label="Featured opportunity navigation"
              >
                <button
                  type="button"
                  className="v2-feature-arrow v2-feature-arrow-prev"
                  onClick={(event) => {
                    event.stopPropagation();
                    setSafeIndex(safeIndex - 1);
                  }}
                  disabled={!prevEnabled}
                  aria-label="Previous featured opportunity"
                >
                  <span aria-hidden="true">‹</span>
                </button>
                <button
                  type="button"
                  className="v2-feature-arrow v2-feature-arrow-next"
                  onClick={(event) => {
                    event.stopPropagation();
                    setSafeIndex(safeIndex + 1);
                  }}
                  disabled={!nextEnabled}
                  aria-label="Next featured opportunity"
                >
                  <span aria-hidden="true">›</span>
                </button>
              </div>
            ) : null}

            <div className="v2-feature-reason">
              <span className="v2-feature-reason-icon" aria-hidden="true">
                <IconTicket width={14} height={14} />
              </span>
              <p className="v2-feature-reason-text">
                {active.selectionReasonLabel}
              </p>
            </div>
          </article>

          {showControls ? (
            <div
              className="v2-feature-dots"
              role="tablist"
              aria-label="Featured opportunities"
            >
              {selections.map((item, i) => (
                <button
                  key={item.film.filmKey}
                  type="button"
                  role="tab"
                  aria-selected={i === safeIndex}
                  className={
                    i === safeIndex
                      ? 'v2-feature-dot v2-feature-dot-active'
                      : 'v2-feature-dot'
                  }
                  aria-label={`Show opportunity ${i + 1}: ${item.film.title}`}
                  onClick={() => setSafeIndex(i)}
                />
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
