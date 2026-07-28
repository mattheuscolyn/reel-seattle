/**
 * Stage 1 Theater Detail — fixture-backed replica of Theater Detail Page.png.
 *
 * Beacon Cinema fixture. Favorite uses favoriteTheatersStore.
 * Website/Directions open external URLs; other actions are stubs.
 */

import { useId, useMemo, useState } from 'react';
import {
  IconAccessibility,
  IconChevron,
  IconClock,
  IconFilm,
  IconHeart,
  IconLink,
  IconPeople,
  IconPin,
  IconPopcorn,
  IconShare,
  IconSliders,
  IconWalk,
} from '../icons.jsx';
import {
  resolveTheaterDetailPresentation,
} from '../fixtures/theaterDetailMockupFixture.js';
import {
  isTheaterFavorite,
  toggleFavoriteTheater,
} from '../stores/favoriteTheatersStore.js';

const STAT_ICONS = {
  monitor: IconFilm,
  film: IconFilm,
  projector: IconFilm,
  seat: IconPeople,
};

const AMENITY_ICONS = {
  popcorn: IconPopcorn,
  wine: IconPopcorn,
  accessibility: IconAccessibility,
  people: IconPeople,
  wind: IconWalk,
};

function getBrowserStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/**
 * @param {{
 *   theaterId?: string,
 *   backLabel?: string,
 *   onBack: () => void,
 *   onOpenFilmDetail?: (payload: { filmKey: string, opportunityKey?: string | null }) => void,
 *   onStubAction?: (actionId: string, label: string) => void,
 * }} props
 */
export default function TheaterDetailSurface({
  theaterId,
  backLabel,
  onBack,
  onOpenFilmDetail,
  onStubAction,
}) {
  const presentation = resolveTheaterDetailPresentation(theaterId);
  const stubStatusId = useId();
  const [stubMessage, setStubMessage] = useState(null);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [screenTabId, setScreenTabId] = useState('all');
  const [selectedTimeId, setSelectedTimeId] = useState('s1-700');
  const [favoriteRevision, setFavoriteRevision] = useState(0);

  const storage = getBrowserStorage();
  const isFavorite = useMemo(() => {
    void favoriteRevision;
    return isTheaterFavorite(storage, {
      theaterId: presentation.theaterId,
      name: presentation.name,
      neighborhood: 'Columbia City',
      imageUrl: presentation.heroImageUrl,
    });
  }, [storage, presentation, favoriteRevision]);

  const announce = (actionId, label, message) => {
    const text =
      message ??
      `${label} isn’t available in this Stage 1 Theater Detail shell yet.`;
    setStubMessage(text);
    onStubAction?.(actionId, label);
  };

  const handleFavorite = () => {
    const result = toggleFavoriteTheater(
      storage,
      {
        theaterId: presentation.theaterId,
        name: presentation.name,
        neighborhood: 'Columbia City',
        imageUrl: presentation.heroImageUrl,
      },
      {
        name: presentation.name,
        neighborhood: 'Columbia City',
        imageUrl: presentation.heroImageUrl,
      },
    );
    if (result.ok) setFavoriteRevision((v) => v + 1);
  };

  const visibleScreens = presentation.todaysShowtimes.screens.filter(
    (screen) => screenTabId === 'all' || screen.id === screenTabId,
  );

  const resolvedBackLabel = backLabel ?? presentation.backLabel;

  return (
    <section
      className="v2-td-page"
      aria-labelledby="v2-td-title"
      data-theater-detail-source={presentation.source}
    >
      <button
        type="button"
        className="v2-td-back"
        aria-label={`Back to ${resolvedBackLabel}`}
        onClick={onBack}
      >
        ← {resolvedBackLabel}
      </button>

      <div className="v2-td-hero" data-td-section="hero">
        <img
          className="v2-td-hero-image"
          src={presentation.heroImageUrl}
          alt=""
        />
        <div className="v2-td-hero-actions">
          <button
            type="button"
            className="v2-td-icon-btn"
            aria-label={presentation.shareLabel}
            onClick={() =>
              announce('share', presentation.shareLabel, presentation.deferredMessages.share)
            }
          >
            <IconShare width={18} height={18} />
          </button>
          <button
            type="button"
            className={
              isFavorite ? 'v2-td-icon-btn v2-td-icon-btn-on' : 'v2-td-icon-btn'
            }
            aria-label={presentation.favoriteLabel}
            aria-pressed={isFavorite}
            onClick={handleFavorite}
          >
            <IconHeart width={18} height={18} />
          </button>
        </div>
      </div>

      <header className="v2-td-header">
        <div className="v2-td-title-row">
          <h1 id="v2-td-title" className="v2-td-title">
            {presentation.name}
          </h1>
          {isFavorite ? (
            <span className="v2-td-favorite-badge">
              {presentation.favoriteBadgeLabel}
            </span>
          ) : null}
        </div>
        <p className="v2-td-address">
          <IconPin width={12} height={12} aria-hidden="true" />
          {presentation.addressLabel}
        </p>
        <div className="v2-td-action-row">
          <a
            className="v2-td-outline-btn"
            href={presentation.websiteUrl}
            target="_blank"
            rel="noreferrer noopener"
          >
            <IconLink width={14} height={14} aria-hidden="true" />
            {presentation.websiteLabel}
          </a>
          <a
            className="v2-td-outline-btn"
            href={presentation.directionsUrl}
            target="_blank"
            rel="noreferrer noopener"
          >
            <IconWalk width={14} height={14} aria-hidden="true" />
            {presentation.directionsLabel}
          </a>
        </div>
        <p className="v2-td-description">
          {descriptionExpanded
            ? presentation.descriptionFull
            : presentation.descriptionPreview}
        </p>
        <button
          type="button"
          className="v2-td-read-more"
          aria-expanded={descriptionExpanded}
          onClick={() => setDescriptionExpanded((v) => !v)}
        >
          {descriptionExpanded
            ? presentation.readLessLabel
            : presentation.readMoreLabel}
          <IconChevron aria-hidden="true" />
        </button>
      </header>

      <section
        className="v2-td-stats"
        data-td-section="stats"
        aria-label="Theater features"
      >
        <ul className="v2-td-stats-grid" role="list">
          {presentation.stats.map((stat) => {
            const Icon = STAT_ICONS[stat.icon] ?? IconFilm;
            return (
              <li key={stat.id} className="v2-td-stat">
                <span className="v2-td-stat-icon" aria-hidden="true">
                  <Icon width={16} height={16} />
                </span>
                <span className="v2-td-stat-value">{stat.value}</span>
                <span className="v2-td-stat-label">{stat.label}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <section
        className="v2-td-section"
        data-td-section="amenities"
        aria-labelledby="v2-td-amenities-h"
      >
        <h2 id="v2-td-amenities-h" className="v2-td-section-label">
          {presentation.amenitiesTitle}
        </h2>
        <ul className="v2-td-amenities" role="list">
          {presentation.amenities.map((item) => {
            const Icon = AMENITY_ICONS[item.icon] ?? IconPopcorn;
            return (
              <li key={item.id} className="v2-td-amenity">
                <span className="v2-td-amenity-icon" aria-hidden="true">
                  <Icon width={16} height={16} />
                </span>
                <span>{item.label}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <section
        className="v2-td-pricing-hours"
        data-td-section="pricingHours"
        aria-label="Pricing and hours"
      >
        <div className="v2-td-pricing">
          <h2 className="v2-td-section-label">{presentation.pricing.title}</h2>
          <ul className="v2-td-meta-list" role="list">
            {presentation.pricing.rows.map((row) => (
              <li key={row.label} className="v2-td-meta-row">
                <span>{row.label}</span>
                <span>{row.value}</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="v2-td-link-btn"
            onClick={() =>
              announce(
                'pricing',
                presentation.pricing.linkLabel,
                presentation.deferredMessages.pricing,
              )
            }
          >
            {presentation.pricing.linkLabel} <span aria-hidden="true">›</span>
          </button>
        </div>
        <div className="v2-td-hours">
          <h2 className="v2-td-section-label">
            <IconClock width={12} height={12} aria-hidden="true" />
            {presentation.hours.title}
          </h2>
          <ul className="v2-td-meta-list" role="list">
            {presentation.hours.rows.map((row) => (
              <li key={row.label} className="v2-td-meta-row">
                <span>{row.label}</span>
                <span>{row.value}</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="v2-td-link-btn"
            onClick={() =>
              announce(
                'hours',
                presentation.hours.linkLabel,
                presentation.deferredMessages.hours,
              )
            }
          >
            {presentation.hours.linkLabel} <span aria-hidden="true">›</span>
          </button>
        </div>
      </section>

      <section
        className="v2-td-section"
        data-td-section="nowShowing"
        aria-labelledby="v2-td-now-h"
      >
        <div className="v2-td-section-head">
          <h2 id="v2-td-now-h" className="v2-td-section-label">
            {presentation.nowShowing.title}
          </h2>
          <button
            type="button"
            className="v2-td-link-btn"
            onClick={() =>
              announce(
                'view-all',
                presentation.nowShowing.viewAllLabel,
                presentation.deferredMessages.viewAll,
              )
            }
          >
            {presentation.nowShowing.viewAllLabel}
          </button>
        </div>
        <ul className="v2-td-now-row" role="list">
          {presentation.nowShowing.films.map((film) => (
            <li key={film.filmKey}>
              <button
                type="button"
                className="v2-td-now-card"
                onClick={() =>
                  onOpenFilmDetail?.({
                    filmKey: film.filmKey,
                    opportunityKey: null,
                  })
                }
              >
                <span className="v2-td-now-poster">
                  {film.badge ? (
                    <span className="v2-td-now-badge">{film.badge}</span>
                  ) : null}
                  <img src={film.posterUrl} alt="" draggable="false" />
                </span>
                <span className="v2-td-now-title">{film.title}</span>
                <span className="v2-td-now-meta">{film.detailLabel}</span>
                <span className="v2-td-format-chip">{film.formatLabel}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section
        className="v2-td-section"
        data-td-section="todaysShowtimes"
        aria-labelledby="v2-td-showtimes-h"
      >
        <div className="v2-td-section-head">
          <h2 id="v2-td-showtimes-h" className="v2-td-section-label">
            {presentation.todaysShowtimes.title}
          </h2>
          <button
            type="button"
            className="v2-td-link-btn"
            onClick={() =>
              announce(
                'view-week',
                presentation.todaysShowtimes.viewWeekLabel,
                presentation.deferredMessages.viewWeek,
              )
            }
          >
            {presentation.todaysShowtimes.viewWeekLabel}
          </button>
        </div>

        <div className="v2-td-showtimes-controls">
          <div
            className="v2-td-screen-tabs"
            role="toolbar"
            aria-label="Screens"
          >
            {presentation.todaysShowtimes.screenTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={
                  screenTabId === tab.id
                    ? 'v2-td-screen-tab v2-td-screen-tab-active'
                    : 'v2-td-screen-tab'
                }
                aria-pressed={screenTabId === tab.id}
                onClick={() => setScreenTabId(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="v2-td-filters-btn"
            onClick={() =>
              announce(
                'filters',
                presentation.todaysShowtimes.filtersLabel,
                presentation.deferredMessages.filters,
              )
            }
          >
            <IconSliders aria-hidden="true" />
            {presentation.todaysShowtimes.filtersLabel}
          </button>
        </div>

        <article className="v2-td-featured-film">
          <button
            type="button"
            className="v2-td-featured-main"
            onClick={() =>
              onOpenFilmDetail?.({
                filmKey: presentation.todaysShowtimes.featuredFilm.filmKey,
                opportunityKey: null,
              })
            }
          >
            <img
              className="v2-td-featured-poster"
              src={presentation.todaysShowtimes.featuredFilm.posterUrl}
              alt=""
            />
            <span className="v2-td-featured-copy">
              <span className="v2-td-featured-title">
                {presentation.todaysShowtimes.featuredFilm.title}
                <IconChevron aria-hidden="true" />
              </span>
              <span className="v2-td-featured-meta">
                {presentation.todaysShowtimes.featuredFilm.metaLabel}
              </span>
              <span className="v2-td-format-chip">
                {presentation.todaysShowtimes.featuredFilm.formatLabel}
              </span>
            </span>
          </button>

          {visibleScreens.map((screen) => (
            <div key={screen.id} className="v2-td-screen-block">
              <p className="v2-td-screen-label">
                {screen.label}
                <span className="v2-td-screen-note">{screen.seatingNote}</span>
              </p>
              <div
                className="v2-td-time-row"
                role="group"
                aria-label={`${screen.label} showtimes`}
              >
                {screen.times.map((time) => (
                  <button
                    key={time.id}
                    type="button"
                    className={
                      selectedTimeId === time.id
                        ? 'v2-td-time-btn v2-td-time-btn-active'
                        : 'v2-td-time-btn'
                    }
                    aria-pressed={selectedTimeId === time.id}
                    onClick={() => {
                      setSelectedTimeId(time.id);
                      announce(
                        'showtime',
                        time.label,
                        presentation.deferredMessages.showtime,
                      );
                    }}
                  >
                    {time.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </article>
      </section>

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
