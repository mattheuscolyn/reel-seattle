/**
 * Canonical Home shelf-detail page shell.
 *
 * Shared chrome for Home “See all” destinations (Opening This Week, Leaving Soon,
 * Just Announced, Special Presentations): title, optional category pills, optional
 * sort/filter controls slot, sectioned film list, unavailable/empty/filtered-empty
 * states.
 *
 * Visual classes: `.v2-shelf-detail-*` (neutral shared template).
 *
 * Shelf-specific business rules stay in each shelf wrapper — this shell only
 * renders prepared UI. Date, theater, and control fields are optional on cards.
 */

import { useId } from 'react';
import TmdbAttribution from '../enrichment/TmdbAttribution.jsx';
import HomeShelfDetailFilmCard from './HomeShelfDetailFilmCard.jsx';

/**
 * @param {{
 *   title: string,
 *   titleId?: string,
 *   source?: string | null,
 *   rootProps?: Record<string, string | undefined>,
 *   resultCountLabel?: string | null,
 *   unavailable?: {
 *     title: string,
 *     body?: string | null,
 *     actionLabel?: string | null,
 *     onAction?: (() => void) | null,
 *   } | null,
 *   empty?: {
 *     title: string,
 *     body?: string | null,
 *     actionLabel?: string | null,
 *     onAction?: (() => void) | null,
 *   } | null,
 *   categoryChips?: { id: string, label: string }[] | null,
 *   categoryId?: string | null,
 *   onCategoryChange?: ((id: string) => void) | null,
 *   categoryAriaLabel?: string,
 *   controls?: import('react').ReactNode,
 *   filteredEmptyMessage?: string | null,
 *   sections?: { id: string, label: string, films: object[] }[] | null,
 *   showSectionTitles?: boolean,
 *   showFilmList?: boolean,
 *   expandedFilmKey?: string | null,
 *   onToggleExpand?: ((filmKey: string) => void) | null,
 *   renderFilmCard?: ((film: object, ctx: { expanded: boolean }) => import('react').ReactNode) | null,
 *   filmCardProps?: object | null,
 *   stubMessage?: string | null,
 * }} props
 */
export default function HomeShelfDetailSurface({
  title,
  titleId = 'v2-shelf-detail-page-title',
  source = null,
  rootProps = null,
  resultCountLabel = null,
  unavailable = null,
  empty = null,
  categoryChips = null,
  categoryId = null,
  onCategoryChange = null,
  categoryAriaLabel = 'Categories',
  controls = null,
  filteredEmptyMessage = null,
  sections = null,
  showSectionTitles = true,
  showFilmList = false,
  expandedFilmKey = null,
  onToggleExpand = null,
  renderFilmCard = null,
  filmCardProps = null,
  stubMessage = null,
}) {
  const stubStatusId = useId();
  const chips = Array.isArray(categoryChips) ? categoryChips : [];
  const showCategories = chips.length > 0 && typeof onCategoryChange === 'function';
  const listSections = Array.isArray(sections) ? sections : [];

  return (
    <section
      className="v2-shelf-detail-page"
      aria-labelledby={titleId}
      data-shelf-detail-surface=""
      data-shelf-detail-source={source ?? undefined}
      {...(rootProps ?? {})}
    >
      <header
        className="v2-shelf-detail-page-header"
        data-shelf-detail-section="header"
      >
        <h1 id={titleId} className="v2-shelf-detail-page-title">
          {title}
        </h1>
        {resultCountLabel ? (
          <p className="v2-shelf-detail-page-count">{resultCountLabel}</p>
        ) : null}
      </header>

      {unavailable ? (
        <div className="v2-shelf-detail-state" role="status">
          <p className="v2-shelf-detail-state-title">{unavailable.title}</p>
          {unavailable.body ? (
            <p className="v2-shelf-detail-state-body">{unavailable.body}</p>
          ) : null}
          {unavailable.actionLabel && typeof unavailable.onAction === 'function' ? (
            <button
              type="button"
              className="v2-shelf-detail-state-action"
              onClick={unavailable.onAction}
            >
              {unavailable.actionLabel}
            </button>
          ) : null}
        </div>
      ) : null}

      {empty ? (
        <div className="v2-shelf-detail-state" role="status">
          <p className="v2-shelf-detail-state-title">{empty.title}</p>
          {empty.body ? (
            <p className="v2-shelf-detail-state-body">{empty.body}</p>
          ) : null}
          {empty.actionLabel && typeof empty.onAction === 'function' ? (
            <button
              type="button"
              className="v2-shelf-detail-state-action"
              onClick={empty.onAction}
            >
              {empty.actionLabel}
            </button>
          ) : null}
        </div>
      ) : null}

      {showCategories ? (
        <div
          className="v2-shelf-detail-chip-row"
          role="group"
          aria-label={categoryAriaLabel}
          data-shelf-detail-section="categories"
        >
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className={
                categoryId === chip.id
                  ? 'v2-search-chip v2-search-chip-active'
                  : 'v2-search-chip'
              }
              aria-pressed={categoryId === chip.id}
              onClick={() => onCategoryChange(chip.id)}
            >
              {chip.label}
            </button>
          ))}
        </div>
      ) : null}

      {controls ? (
        <div
          className="v2-shelf-detail-page-controls"
          data-shelf-detail-section="controls"
        >
          {controls}
        </div>
      ) : null}

      {filteredEmptyMessage ? (
        <p className="v2-shelf-detail-empty" role="status">
          {filteredEmptyMessage}
        </p>
      ) : null}

      {showFilmList && listSections.length > 0 ? (
        <div data-shelf-detail-section="filmList">
          {listSections.map((section) => (
            <section
              key={section.id}
              className="v2-shelf-detail-section"
              aria-label={section.label}
            >
              {showSectionTitles ? (
                <h2 className="v2-shelf-detail-section-title">{section.label}</h2>
              ) : null}
              <ul className="v2-shelf-detail-page-list" role="list">
                {(section.films ?? []).map((film) => (
                  <li key={film.filmKey}>
                    {typeof renderFilmCard === 'function'
                      ? renderFilmCard(film, {
                          expanded: expandedFilmKey === film.filmKey,
                        })
                      : (
                        <HomeShelfDetailFilmCard
                          film={film}
                          expanded={expandedFilmKey === film.filmKey}
                          onToggleExpand={onToggleExpand}
                          {...(filmCardProps ?? {})}
                        />
                      )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : null}

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
