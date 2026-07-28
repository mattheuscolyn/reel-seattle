/**
 * Stage 1 Theaters list — fixture-backed replica of Theaters Page.png.
 *
 * Replaces CollectionSurface scaffold for collectionId theaters.
 * Expand/collapse is real. Favorite, Save, Filters, View all remain Stage 1 stubs
 * on the list (no store mutation). More details opens Theater Detail for Beacon.
 */

import { useId, useState } from 'react';
import {
  IconBookmark,
  IconBuilding,
  IconChevron,
  IconFilm,
  IconSliders,
  IconStar,
} from '../icons.jsx';
import { resolveTheatersPresentation } from '../fixtures/theatersMockupFixture.js';
import { THEATER_DETAIL_DEFAULT_THEATER_ID } from '../fixtures/theaterDetailMockupFixture.js';

function TheaterNowShowing({
  theater,
  nowShowingLabel,
  viewAllLabel,
  onViewAll,
  onOpenFilm,
}) {
  return (
    <div className="v2-theaters-now" data-theaters-region="nowShowing">
      <div className="v2-theaters-now-head">
        <h3 className="v2-theaters-now-label">{nowShowingLabel}</h3>
        <button
          type="button"
          className="v2-theaters-now-viewall"
          onClick={onViewAll}
        >
          {viewAllLabel}
        </button>
      </div>
      {theater.nowShowing.length > 0 ? (
        <ul className="v2-theaters-now-row" role="list">
          {theater.nowShowing.map((film) => (
            <li key={film.filmKey}>
              <button
                type="button"
                className="v2-theaters-now-film"
                onClick={() =>
                  onOpenFilm?.({
                    filmKey: film.filmKey,
                    opportunityKey: null,
                  })
                }
              >
                <span className="v2-theaters-now-poster">
                  {film.posterUrl ? (
                    <img src={film.posterUrl} alt="" draggable="false" />
                  ) : (
                    <span
                      className="v2-shelf-poster-fallback"
                      aria-hidden="true"
                    />
                  )}
                </span>
                <span className="v2-theaters-now-title">{film.title}</span>
                <span className="v2-theaters-now-date">{film.detailLabel}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="v2-theaters-now-empty" role="status">
          No films in this Stage 1 fixture window.
        </p>
      )}
    </div>
  );
}

function TheaterListItem({
  theater,
  expanded,
  panelId,
  onToggle,
  onStubAction,
  onOpenFilmDetail,
  onOpenTheaterDetail,
  labels,
}) {
  return (
    <article
      className={
        expanded
          ? 'v2-theaters-card v2-theaters-card-expanded'
          : 'v2-theaters-card'
      }
    >
      <div className="v2-theaters-card-top">
        <button
          type="button"
          className="v2-theaters-card-main"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={onToggle}
        >
          <span className="v2-theaters-card-thumb">
            {theater.imageUrl ? (
              <img src={theater.imageUrl} alt="" draggable="false" />
            ) : (
              <span className="v2-shelf-poster-fallback" aria-hidden="true" />
            )}
          </span>
          <span className="v2-theaters-card-copy">
            <span className="v2-theaters-card-name">{theater.name}</span>
            <span className="v2-theaters-card-address">
              {theater.addressLabel}
            </span>
            <span className="v2-theaters-card-meta">
              <span className="v2-theaters-card-fact">
                <IconBuilding width={12} height={12} aria-hidden="true" />
                {theater.screensLabel}
              </span>
              <span className="v2-theaters-card-fact">
                <IconFilm width={12} height={12} aria-hidden="true" />
                {theater.formatsLabel}
              </span>
            </span>
          </span>
          <span className="v2-theaters-card-chevron" aria-hidden="true">
            {expanded ? '⌃' : <IconChevron />}
          </span>
        </button>

        <button
          type="button"
          className="v2-theaters-card-fav-btn"
          aria-label={`${labels.favoriteLabel} ${theater.name}`}
          onClick={() =>
            onStubAction?.(
              `favorite-${theater.id}`,
              `${labels.favoriteLabel} ${theater.name}`,
            )
          }
        >
          <IconStar width={12} height={12} aria-hidden="true" />
          {labels.favoriteLabel}
        </button>
      </div>

      {expanded ? (
        <div
          id={panelId}
          className="v2-theaters-card-expand"
          role="region"
          aria-label={`Details for ${theater.name}`}
        >
          {theater.description ? (
            <p className="v2-theaters-card-desc">{theater.description}</p>
          ) : null}

          <TheaterNowShowing
            theater={theater}
            nowShowingLabel={labels.nowShowingLabel}
            viewAllLabel={labels.viewAllLabel}
            onViewAll={() =>
              onStubAction?.(
                `view-all-${theater.id}`,
                `${labels.viewAllLabel} · ${theater.name}`,
              )
            }
            onOpenFilm={onOpenFilmDetail}
          />

          <div className="v2-theaters-card-actions">
            <button
              type="button"
              className="v2-theaters-card-action"
              onClick={() =>
                onStubAction?.(
                  `save-${theater.id}`,
                  `${labels.saveLabel} ${theater.name}`,
                )
              }
            >
              <IconBookmark width={16} height={16} aria-hidden="true" />
              {labels.saveLabel}
            </button>
            <button
              type="button"
              className="v2-theaters-card-more"
              aria-label={`${labels.moreDetailsLabel} for ${theater.name}`}
              onClick={() => {
                if (
                  theater.id === THEATER_DETAIL_DEFAULT_THEATER_ID &&
                  typeof onOpenTheaterDetail === 'function'
                ) {
                  onOpenTheaterDetail({ theaterId: theater.id });
                  return;
                }
                onStubAction?.(
                  `more-${theater.id}`,
                  `${labels.moreDetailsLabel} · ${theater.name}`,
                );
              }}
            >
              {labels.moreDetailsLabel}
              <IconChevron aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

/**
 * @param {{
 *   onBack: () => void,
 *   backLabel?: string,
 *   onOpenFilmDetail?: (payload: { filmKey: string, opportunityKey?: string | null }) => void,
 *   onOpenTheaterDetail?: (payload: { theaterId: string }) => void,
 *   onStubAction?: (actionId: string, label: string) => void,
 * }} props
 */
export default function TheatersSurface({
  onBack,
  backLabel = 'Explore',
  onOpenFilmDetail,
  onStubAction,
  onOpenTheaterDetail,
}) {
  const presentation = resolveTheatersPresentation();
  const stubStatusId = useId();
  const [stubMessage, setStubMessage] = useState(null);
  const initialExpanded =
    presentation.theaters.find((t) => t.initiallyExpanded)?.id ??
    presentation.theaters[0]?.id ??
    null;
  const [expandedTheaterId, setExpandedTheaterId] = useState(initialExpanded);

  const announceStub = (actionId, label) => {
    const message = `${label} isn’t available in this Stage 1 Theaters shell yet.`;
    setStubMessage(message);
    onStubAction?.(actionId, label);
  };

  const toggleExpand = (theaterId) => {
    setExpandedTheaterId((current) =>
      current === theaterId ? null : theaterId,
    );
  };

  const labels = {
    favoriteLabel: presentation.favoriteLabel,
    nowShowingLabel: presentation.nowShowingLabel,
    viewAllLabel: presentation.viewAllLabel,
    moreDetailsLabel: presentation.moreDetailsLabel,
    saveLabel: presentation.saveLabel,
  };

  return (
    <section
      className="v2-theaters-page"
      aria-labelledby="v2-theaters-page-title"
      data-theaters-source={presentation.source}
    >
      <button
        type="button"
        className="v2-theaters-page-back"
        aria-label={`Back to ${backLabel}`}
        onClick={onBack}
      >
        ← {backLabel}
      </button>

      <header className="v2-theaters-page-header" data-theaters-section="header">
        <h1 id="v2-theaters-page-title" className="v2-theaters-page-title">
          {presentation.pageTitle}
        </h1>
        <p className="v2-theaters-page-tagline">{presentation.pageTagline}</p>
      </header>

      <div
        className="v2-theaters-page-controls"
        data-theaters-section="controls"
      >
        <p className="v2-theaters-page-count">{presentation.countLabel}</p>
        <button
          type="button"
          className="v2-theaters-page-filters"
          onClick={() => announceStub('filters', presentation.filtersLabel)}
        >
          <IconSliders aria-hidden="true" />
          {presentation.filtersLabel}
        </button>
      </div>

      <ul
        className="v2-theaters-page-list"
        data-theaters-section="theaterList"
        role="list"
      >
        {presentation.theaters.map((theater) => {
          const expanded = expandedTheaterId === theater.id;
          const panelId = `v2-theaters-expand-${theater.id}`;
          return (
            <li key={theater.id}>
              <TheaterListItem
                theater={theater}
                expanded={expanded}
                panelId={panelId}
                onToggle={() => toggleExpand(theater.id)}
                onStubAction={announceStub}
                onOpenFilmDetail={onOpenFilmDetail}
                onOpenTheaterDetail={onOpenTheaterDetail}
                labels={labels}
              />
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
    </section>
  );
}
