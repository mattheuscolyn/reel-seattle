/**
 * Explore → Collections index. Reuses existing page chrome / filter-sheet patterns.
 */

import { useId, useMemo, useState } from 'react';
import { IconChevron, IconSliders } from '../icons.jsx';
import { TheaterVenueImage } from '../theaters/TheaterVenueImage.jsx';
import {
  COLLECTION_FILTER_THEATERS,
  COLLECTION_FILTER_TYPES,
  normalizeCollectionFilters,
} from './collectionsModel.js';
import { composeCollectionsIndex } from './composeCollectionsIndex.js';

const EMPTY_FILTERS = { sources: [], types: [] };

/**
 * @param {{
 *   artifact?: object | null,
 *   homeData?: object | null,
 *   loadStatus?: string,
 *   onOpenCollectionDetail?: (payload: { collectionId: string }) => void,
 * }} props
 */
export default function CollectionsSurface({
  artifact = null,
  homeData = null,
  loadStatus = 'ready',
  onOpenCollectionDetail,
}) {
  const filtersTitleId = useId();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);

  const presentation = useMemo(
    () =>
      composeCollectionsIndex(artifact, {
        homeData,
        filters: appliedFilters,
      }),
    [artifact, homeData, appliedFilters],
  );

  const activeFilterCount =
    appliedFilters.sources.length + appliedFilters.types.length;

  const openFilters = () => {
    setDraftFilters(appliedFilters);
    setFiltersOpen(true);
  };

  const applyFilters = () => {
    setAppliedFilters(normalizeCollectionFilters(draftFilters));
    setFiltersOpen(false);
  };

  const resetFilters = () => {
    setDraftFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setFiltersOpen(false);
  };

  const toggleSource = (id) => {
    setDraftFilters((prev) => {
      const has = prev.sources.includes(id);
      return {
        ...prev,
        sources: has
          ? prev.sources.filter((item) => item !== id)
          : [...prev.sources, id],
      };
    });
  };

  const toggleType = (id) => {
    setDraftFilters((prev) => {
      const has = prev.types.includes(id);
      return {
        ...prev,
        types: has ? prev.types.filter((item) => item !== id) : [...prev.types, id],
      };
    });
  };

  return (
    <section
      className="v2-ecol-page"
      aria-labelledby="v2-ecol-page-title"
      data-ecol-section-root="index"
    >
      <header className="v2-ecol-page-header" data-ecol-section="header">
        <h1 id="v2-ecol-page-title" className="v2-ecol-page-title">
          {presentation.pageTitle}
        </h1>
        <p className="v2-ecol-page-tagline">{presentation.pageTagline}</p>
      </header>

      <div className="v2-ecol-page-controls" data-ecol-section="controls">
        <p className="v2-ecol-page-count">{presentation.countLabel}</p>
        <button
          type="button"
          className="v2-ecol-filters-btn"
          onClick={openFilters}
          aria-expanded={filtersOpen}
          aria-controls={filtersOpen ? filtersTitleId : undefined}
        >
          <IconSliders width={14} height={14} aria-hidden="true" />
          {presentation.filtersLabel}
          {activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}
        </button>
      </div>

      {loadStatus === 'unavailable' || !artifact ? (
        <p className="v2-ecol-empty" role="status">
          Collections aren’t available right now.
        </p>
      ) : presentation.collections.length === 0 ? (
        <p className="v2-ecol-empty" role="status">
          {activeFilterCount > 0
            ? 'No collections match these filters.'
            : 'No current collections with upcoming screenings.'}
        </p>
      ) : (
        <ul className="v2-ecol-list" data-ecol-section="list" role="list">
          {presentation.collections.map((collection) => (
            <li key={collection.collectionId}>
              <button
                type="button"
                className="v2-ecol-card"
                data-collection-id={collection.collectionId}
                data-upcoming-count={collection.upcomingCount}
                onClick={() =>
                  onOpenCollectionDetail?.({
                    collectionId: collection.collectionId,
                  })
                }
              >
                <span className="v2-ecol-card-thumb">
                  <TheaterVenueImage
                    src={collection.imageUrl}
                    loading="lazy"
                  />
                </span>
                <span className="v2-ecol-card-copy">
                  <span className="v2-ecol-card-title">{collection.title}</span>
                  <span className="v2-ecol-card-meta">
                    {collection.sourceLabel}
                    {collection.typeLabel ? ` · ${collection.typeLabel}` : ''}
                  </span>
                  {collection.description ? (
                    <span className="v2-ecol-card-desc">
                      {collection.description}
                    </span>
                  ) : null}
                  <span className="v2-ecol-card-facts">
                    <span className="v2-ecol-card-upcoming">
                      {collection.upcomingCount} upcoming
                    </span>
                    <span className="v2-ecol-card-dot" aria-hidden="true">
                      ·
                    </span>
                    <span className="v2-ecol-card-films">
                      {collection.memberCount}{' '}
                      {collection.memberCount === 1 ? 'film' : 'films'}
                    </span>
                  </span>
                </span>
                <span className="v2-ecol-card-chevron" aria-hidden="true">
                  <IconChevron />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {filtersOpen ? (
        <div
          className="v2-fe-filter-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby={filtersTitleId}
        >
          <div className="v2-fe-filter-sheet-panel">
            <div className="v2-fe-filter-sheet-head">
              <h2 id={filtersTitleId}>Filters</h2>
              <button
                type="button"
                className="v2-fe-filter-sheet-close"
                onClick={() => setFiltersOpen(false)}
              >
                Close
              </button>
            </div>

            <fieldset className="v2-fe-filter-fieldset">
              <legend>Theater</legend>
              {COLLECTION_FILTER_THEATERS.map((opt) => (
                <label key={opt.id} className="v2-fe-filter-check">
                  <input
                    type="checkbox"
                    checked={draftFilters.sources.includes(opt.id)}
                    onChange={() => toggleSource(opt.id)}
                  />
                  {opt.label}
                </label>
              ))}
            </fieldset>

            <fieldset className="v2-fe-filter-fieldset">
              <legend>Type</legend>
              {COLLECTION_FILTER_TYPES.map((opt) => (
                <label key={opt.id} className="v2-fe-filter-check">
                  <input
                    type="checkbox"
                    checked={draftFilters.types.includes(opt.id)}
                    onChange={() => toggleType(opt.id)}
                  />
                  {opt.label}
                </label>
              ))}
            </fieldset>

            <div className="v2-fe-filter-sheet-actions">
              <button type="button" onClick={resetFilters}>
                Reset
              </button>
              <button
                type="button"
                className="v2-fe-filter-sheet-apply"
                onClick={applyFilters}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
