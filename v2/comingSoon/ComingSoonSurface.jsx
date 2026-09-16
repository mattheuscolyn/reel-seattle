/**
 * Explore → Coming Soon. Compact chronological list of upcoming theatrical titles.
 */

import { useEffect, useId, useMemo, useState } from 'react';
import { IconChevron, IconSliders } from '../icons.jsx';
import { TheaterVenueImage } from '../theaters/TheaterVenueImage.jsx';
import { useBodyScrollLock } from '../homeShelfDetail/useBodyScrollLock.js';
import {
  LIST_RESTORE_ATTR,
  restoreListPosition,
} from '../navigation/listPositionRestore.js';
import {
  COMING_SOON_KIND_FILTERS,
  COMING_SOON_LOCAL_FILTERS,
  DEFAULT_COMING_SOON_FILTERS,
  composeComingSoonPage,
  normalizeComingSoonFilters,
} from './comingSoonModel.js';

/**
 * @param {{
 *   row: object,
 *   onOpen: (row: object) => void,
 * }} props
 */
function ComingSoonRow({ row, onOpen }) {
  const className = row.hasPoster
    ? 'v2-cs-row v2-cs-row-has-poster'
    : 'v2-cs-row v2-cs-row-text';

  return (
    <button
      type="button"
      className={className}
      data-coming-soon-entry={row.entryId}
      data-coming-soon-classification={row.classification}
      data-coming-soon-has-poster={row.hasPoster ? 'true' : 'false'}
      data-coming-soon-open={row.openTarget?.type ?? ''}
      {...{ [LIST_RESTORE_ATTR]: row.entryId }}
      onClick={() => onOpen(row)}
    >
      {row.hasPoster ? (
        <span className="v2-cs-row-poster" aria-hidden="true">
          <TheaterVenueImage src={row.posterUrl} alt="" loading="lazy" />
        </span>
      ) : null}
      <span className="v2-cs-row-copy">
        <span className="v2-cs-row-title">{row.title}</span>
        <span className="v2-cs-row-date">{row.expectedDateLabel}</span>
        <span className="v2-cs-row-status">{row.localStatusLabel}</span>
        {row.theaterLine ? (
          <span className="v2-cs-row-theaters">{row.theaterLine}</span>
        ) : null}
        {row.kindChip ? (
          <span className="v2-cs-row-chip" data-coming-soon-kind={row.kindChip.id}>
            {row.kindChip.label}
          </span>
        ) : null}
      </span>
      <span className="v2-cs-row-chevron" aria-hidden="true">
        <IconChevron />
      </span>
    </button>
  );
}

/**
 * @param {{
 *   artifact?: object | null,
 *   loadStatus?: string,
 *   filters?: { local?: string, kinds?: string[] },
 *   listRestore?: object | null,
 *   onFiltersChange?: (filters: { local: string, kinds: string[] }) => void,
 *   onListRestoreConsumed?: () => void,
 *   onOpenRow?: (row: object) => void,
 * }} props
 */
export default function ComingSoonSurface({
  artifact = null,
  loadStatus = 'ready',
  filters = DEFAULT_COMING_SOON_FILTERS,
  listRestore = null,
  onFiltersChange,
  onListRestoreConsumed,
  onOpenRow,
}) {
  const filtersTitleId = useId();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState(() =>
    normalizeComingSoonFilters(filters),
  );

  const presentation = useMemo(
    () => composeComingSoonPage(artifact, filters, { loadStatus }),
    [artifact, filters, loadStatus],
  );

  useBodyScrollLock(filtersOpen);

  useEffect(() => {
    if (!listRestore) return undefined;
    const frame = requestAnimationFrame(() => {
      restoreListPosition(listRestore, { itemAttr: LIST_RESTORE_ATTR });
      onListRestoreConsumed?.();
    });
    return () => cancelAnimationFrame(frame);
  }, [listRestore, onListRestoreConsumed, presentation.visibleCount]);

  const openFilters = () => {
    setDraftFilters(normalizeComingSoonFilters(filters));
    setFiltersOpen(true);
  };

  const applyFilters = () => {
    onFiltersChange?.(normalizeComingSoonFilters(draftFilters));
    setFiltersOpen(false);
  };

  const resetFilters = () => {
    const next = normalizeComingSoonFilters(DEFAULT_COMING_SOON_FILTERS);
    setDraftFilters(next);
    onFiltersChange?.(next);
    setFiltersOpen(false);
  };

  const toggleKind = (id) => {
    setDraftFilters((prev) => {
      const has = prev.kinds.includes(id);
      return {
        ...prev,
        kinds: has
          ? prev.kinds.filter((item) => item !== id)
          : [...prev.kinds, id],
      };
    });
  };

  return (
    <section
      className="v2-cs-page"
      aria-labelledby="v2-cs-page-title"
      data-coming-soon-surface="list"
      data-coming-soon-state={presentation.state}
    >
      <header className="v2-cs-page-header">
        <h1 id="v2-cs-page-title" className="v2-cs-page-title">
          {presentation.pageTitle}
        </h1>
        <p className="v2-cs-page-tagline">{presentation.pageTagline}</p>
      </header>

      <div className="v2-cs-page-controls">
        {presentation.countLabel ? (
          <p className="v2-cs-page-count">{presentation.countLabel}</p>
        ) : (
          <p className="v2-cs-page-count">&nbsp;</p>
        )}
        <button
          type="button"
          className="v2-ecol-filters-btn"
          onClick={openFilters}
          aria-expanded={filtersOpen}
          aria-controls={filtersOpen ? filtersTitleId : undefined}
        >
          <IconSliders width={14} height={14} aria-hidden="true" />
          {presentation.filtersLabel}
          {presentation.activeFilterCount > 0
            ? ` · ${presentation.activeFilterCount}`
            : ''}
        </button>
      </div>

      {presentation.emptyMessage && presentation.sections.length === 0 ? (
        <p className="v2-cs-empty" role="status">
          {presentation.emptyMessage}
        </p>
      ) : (
        presentation.sections.map((section) => (
          <section
            key={section.id}
            className="v2-cs-week"
            data-coming-soon-week={section.id}
            aria-labelledby={`v2-cs-week-${section.id}`}
          >
            <h2 id={`v2-cs-week-${section.id}`} className="v2-cs-week-heading">
              {section.label}
            </h2>
            <ul className="v2-cs-list" role="list">
              {section.entries.map((row) => (
                <li key={row.entryId}>
                  <ComingSoonRow row={row} onOpen={(item) => onOpenRow?.(item)} />
                </li>
              ))}
            </ul>
          </section>
        ))
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
              <legend>Local status</legend>
              {COMING_SOON_LOCAL_FILTERS.map((opt) => (
                <label key={opt.id} className="v2-fe-filter-check">
                  <input
                    type="radio"
                    name="coming-soon-local-filter"
                    checked={draftFilters.local === opt.id}
                    onChange={() =>
                      setDraftFilters((prev) => ({ ...prev, local: opt.id }))
                    }
                  />
                  {opt.label}
                </label>
              ))}
            </fieldset>

            <fieldset className="v2-fe-filter-fieldset">
              <legend>Type</legend>
              {COMING_SOON_KIND_FILTERS.map((opt) => (
                <label key={opt.id} className="v2-fe-filter-check">
                  <input
                    type="checkbox"
                    checked={draftFilters.kinds.includes(opt.id)}
                    onChange={() => toggleKind(opt.id)}
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
