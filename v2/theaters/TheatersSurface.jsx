/**
 * Theaters list — live HomeData presentation with fixture fallback.
 *
 * Expand/collapse, Favorite, View all, and More details are real.
 * Filters remain a Stage 1 stub on the list.
 */

import { useId, useMemo, useState } from 'react';
import {
  IconBuilding,
  IconChevron,
  IconFilm,
  IconSliders,
  IconStar,
  IconStarFill,
} from '../icons.jsx';
import { THEATER_DETAIL_DEFAULT_THEATER_ID } from '../fixtures/theaterDetailMockupFixture.js';
import {
  isTheaterFavorite,
  toggleFavoriteTheater,
} from '../stores/favoriteTheatersStore.js';
import { resolveTheatersPagePresentation } from './resolveTheatersPagePresentation.js';
import { TheaterVenueImage } from './TheaterVenueImage.jsx';

function getBrowserStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

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
          No showtimes in the next seven days.
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
  onOpenShowtimesBrowse,
  isFavorite,
  onToggleFavorite,
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
            <TheaterVenueImage
              src={theater.thumbnailUrl ?? theater.imageUrl}
              loading="lazy"
            />
          </span>
          <span className="v2-theaters-card-copy">
            <span className="v2-theaters-card-name">{theater.name}</span>
            {theater.addressLabel ? (
              <span className="v2-theaters-card-address">
                {theater.addressLabel}
              </span>
            ) : theater.neighborhood ? (
              <span className="v2-theaters-card-address">
                {theater.neighborhood}
              </span>
            ) : null}
            {theater.screensLabel || theater.formatsLabel ? (
              <span className="v2-theaters-card-meta">
                {theater.screensLabel ? (
                  <span className="v2-theaters-card-fact">
                    <IconBuilding width={12} height={12} aria-hidden="true" />
                    {theater.screensLabel}
                  </span>
                ) : null}
                {theater.formatsLabel ? (
                  <span className="v2-theaters-card-fact">
                    <IconFilm width={12} height={12} aria-hidden="true" />
                    {theater.formatsLabel}
                  </span>
                ) : null}
              </span>
            ) : null}
          </span>
          <span className="v2-theaters-card-chevron" aria-hidden="true">
            {expanded ? '⌃' : <IconChevron />}
          </span>
        </button>

        <button
          type="button"
          className={
            isFavorite
              ? 'v2-theaters-card-fav-btn is-active'
              : 'v2-theaters-card-fav-btn'
          }
          aria-label={`${labels.favoriteLabel} ${theater.name}`}
          aria-pressed={isFavorite}
          onClick={() => onToggleFavorite?.(theater)}
        >
          {isFavorite ? (
            <IconStarFill width={12} height={12} aria-hidden="true" />
          ) : (
            <IconStar width={12} height={12} aria-hidden="true" />
          )}
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
            onViewAll={() => {
              if (typeof onOpenShowtimesBrowse === 'function' && theater.id) {
                onOpenShowtimesBrowse({ theaterId: theater.id });
                return;
              }
              onStubAction?.(
                `view-all-${theater.id}`,
                `${labels.viewAllLabel} · ${theater.name}`,
              );
            }}
            onOpenFilm={onOpenFilmDetail}
          />

          <div className="v2-theaters-card-actions">
            <button
              type="button"
              className="v2-theaters-card-more"
              aria-label={`${labels.moreDetailsLabel} for ${theater.name}`}
              onClick={() => {
                const canOpenDetail =
                  typeof onOpenTheaterDetail === 'function' &&
                  theater.id &&
                  (theater.openDetailEnabled === true ||
                    theater.id === THEATER_DETAIL_DEFAULT_THEATER_ID);
                if (canOpenDetail) {
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
 *   homeData?: object | null,
 *   onOpenFilmDetail?: (payload: { filmKey: string, opportunityKey?: string | null }) => void,
 *   onOpenTheaterDetail?: (payload: { theaterId: string }) => void,
 *   onOpenShowtimesBrowse?: (payload: { theaterId: string }) => void,
 *   onStubAction?: (actionId: string, label: string) => void,
 * }} props
 */
export default function TheatersSurface({
  onBack,
  backLabel = 'Explore',
  homeData = null,
  onOpenFilmDetail,
  onStubAction,
  onOpenTheaterDetail,
  onOpenShowtimesBrowse,
}) {
  const { presentation } = resolveTheatersPagePresentation({ homeData });
  const stubStatusId = useId();
  const [stubMessage, setStubMessage] = useState(null);
  const [expandedTheaterId, setExpandedTheaterId] = useState(null);
  const [favoriteRevision, setFavoriteRevision] = useState(0);

  const announceStub = (actionId, label) => {
    const message =
      presentation.source === 'home-data'
        ? `${label} isn’t available on Theaters yet.`
        : `${label} isn’t available in this Stage 1 Theaters shell yet.`;
    setStubMessage(message);
    onStubAction?.(actionId, label);
  };

  const toggleExpand = (theaterId) => {
    setExpandedTheaterId((current) =>
      current === theaterId ? null : theaterId,
    );
  };

  const favoriteIds = useMemo(() => {
    void favoriteRevision;
    const storage = getBrowserStorage();
    const ids = new Set();
    for (const theater of presentation.theaters) {
      if (
        isTheaterFavorite(storage, {
          theaterId: theater.id,
          name: theater.name,
        })
      ) {
        ids.add(theater.id);
      }
    }
    return ids;
  }, [presentation.theaters, favoriteRevision]);

  const handleToggleFavorite = (theater) => {
    const result = toggleFavoriteTheater(
      getBrowserStorage(),
      {
        theaterId: theater.id,
        name: theater.name,
        neighborhood: theater.neighborhood ?? null,
        imageUrl: theater.thumbnailUrl ?? theater.imageUrl ?? null,
      },
      {
        name: theater.name,
        neighborhood: theater.neighborhood ?? null,
        imageUrl: theater.thumbnailUrl ?? theater.imageUrl ?? null,
      },
    );
    if (result.ok) setFavoriteRevision((n) => n + 1);
  };

  const labels = {
    favoriteLabel: presentation.favoriteLabel,
    nowShowingLabel: presentation.nowShowingLabel,
    viewAllLabel: presentation.viewAllLabel,
    moreDetailsLabel: presentation.moreDetailsLabel,
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
                onOpenShowtimesBrowse={onOpenShowtimesBrowse}
                isFavorite={favoriteIds.has(theater.id)}
                onToggleFavorite={handleToggleFavorite}
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
