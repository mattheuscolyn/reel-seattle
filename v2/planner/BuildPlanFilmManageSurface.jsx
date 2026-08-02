/**
 * Shared Build a Plan film-management surface.
 * Modes: mustInclude | wouldLove | notInterested
 *
 * Live candidates come from HomeData eligible showtimes (T-V2-LAUNCH-PLANNER-01).
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  IconBookmark,
  IconBuilding,
  IconClose,
  IconPlus,
  IconSearch,
  IconChevron,
  IconFilm,
} from '../icons.jsx';
import {
  getBuildPlanFilmManageConfig,
} from './buildPlanFilmManageConfig.js';
import {
  getBuildPlanFormSession,
  setBuildPlanFormSession,
  subscribeBuildPlanFormSession,
} from './buildPlanFormSession.js';
import {
  resolveBuildPlanFilmManageCandidates,
} from '../fixtures/buildPlanFilmManageMockupFixture.js';
import { isBuildPlanMockupMode } from '../fixtures/buildPlanMockupFixture.js';
import {
  annotatePlannerFilmCandidates,
  applyFilmBucketSelection,
  filterPlannerFilmCandidates,
  listPlannerCatalogFilterOptions,
  listPlannerEligibleFilms,
} from './buildPlanFilmCatalog.js';
import { pacificDateString } from '../explore/exploreCatalog.js';

function filmMeta(film) {
  const bits = [film.detailLabel ?? film.theaterLabel ?? 'Any theater'];
  if (film.isNotInterested) bits.push('Not interested');
  if (film.isSaved) bits.push('Saved');
  return bits.join(' · ');
}

function FilmRow({ film, action }) {
  return (
    <div
      className="v2-bp-manage-row"
      data-ni={film.isNotInterested ? '1' : undefined}
      data-saved={film.isSaved ? '1' : undefined}
    >
      {film.imageUrl ? (
        <img className="v2-bp-manage-poster" src={film.imageUrl} alt="" />
      ) : (
        <span className="v2-bp-manage-poster v2-bp-manage-poster-fallback" />
      )}
      <span className="v2-bp-manage-row-copy">
        <span className="v2-bp-manage-row-title">{film.title}</span>
        <span className="v2-bp-manage-row-meta">{filmMeta(film)}</span>
      </span>
      {action}
    </div>
  );
}

/**
 * @param {{
 *   mode: 'mustInclude' | 'wouldLove' | 'notInterested',
 *   onDone: () => void,
 *   onBack: () => void,
 *   homeData?: object | null,
 * }} props
 */
export default function BuildPlanFilmManageSurface({
  mode,
  onDone,
  onBack,
  homeData = null,
}) {
  const config = getBuildPlanFilmManageConfig(mode);
  const searchId = useId();
  const statusId = useId();
  const doneBusyRef = useRef(false);
  const [query, setQuery] = useState('');
  const [savedOnly, setSavedOnly] = useState(false);
  const [theaterIds, setTheaterIds] = useState([]);
  const [formatKeys, setFormatKeys] = useState([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedOpen, setSelectedOpen] = useState(true);
  const [statusMessage, setStatusMessage] = useState(null);
  const [formTick, setFormTick] = useState(0);
  const mockupMode = isBuildPlanMockupMode();

  useEffect(() => {
    return subscribeBuildPlanFormSession(() => {
      setFormTick((n) => n + 1);
    });
  }, []);

  const form = getBuildPlanFormSession();
  const selected = form?.[config.bucketKey] ?? [];
  const dateIso =
    form?.dateIso && /^\d{4}-\d{2}-\d{2}$/.test(form.dateIso)
      ? form.dateIso
      : pacificDateString(new Date());

  const liveCatalog = useMemo(() => {
    void formTick;
    if (mockupMode) return [];
    return annotatePlannerFilmCandidates(
      listPlannerEligibleFilms(homeData, { dateIso }),
    );
  }, [homeData, dateIso, formTick, mockupMode]);

  const candidates = useMemo(() => {
    void formTick;
    if (mockupMode) {
      return resolveBuildPlanFilmManageCandidates(mode, selected, []);
    }
    const selectedIds = new Set(
      selected.map((f) => f.id ?? f.filmKey).filter(Boolean),
    );
    // Would Love: hide films already in Must Include
    const mustIds = new Set(
      (form?.mustInclude ?? []).map((f) => f.id ?? f.filmKey),
    );
    return liveCatalog.filter((film) => {
      const id = film.id ?? film.filmKey;
      if (selectedIds.has(id)) return false;
      if (mode === 'wouldLove' && mustIds.has(id)) return false;
      return true;
    });
  }, [mode, selected, liveCatalog, formTick, mockupMode, form?.mustInclude]);

  const filterOptions = useMemo(
    () => listPlannerCatalogFilterOptions(candidates),
    [candidates],
  );

  const filteredCandidates = useMemo(() => {
    if (mockupMode) {
      const q = query.trim().toLowerCase();
      return candidates.filter((film) =>
        q ? String(film.title ?? '').toLowerCase().includes(q) : true,
      );
    }
    return filterPlannerFilmCandidates(candidates, {
      query,
      savedOnly,
      theaterIds,
      formatKeys,
    });
  }, [
    candidates,
    query,
    savedOnly,
    theaterIds,
    formatKeys,
    mockupMode,
  ]);

  const filtersActive =
    savedOnly || theaterIds.length > 0 || formatKeys.length > 0 || Boolean(query.trim());

  const announce = (message) => {
    setStatusMessage(message);
  };

  const handleRemove = (filmId) => {
    const next = {
      ...form,
      [config.bucketKey]: selected.filter((f) => f.id !== filmId),
    };
    setBuildPlanFormSession(next);
  };

  const handleAdd = (film) => {
    const result = applyFilmBucketSelection(form, mode, film);
    if (result.rejected === 'cap') {
      announce(config.capReachedMessage ?? 'Selection limit reached.');
      return;
    }
    if (result.rejected === 'must') {
      announce('That film is already in Must include.');
      return;
    }
    setBuildPlanFormSession({
      ...form,
      mustInclude: result.mustInclude,
      wouldLove: result.wouldLove,
      notInterested: result.notInterested,
    });
  };

  const handleDone = () => {
    if (doneBusyRef.current) return;
    doneBusyRef.current = true;
    onDone?.();
    window.setTimeout(() => {
      doneBusyRef.current = false;
    }, 400);
  };

  const toggleTheater = (id) => {
    setTheaterIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    );
  };

  const toggleFormat = (key) => {
    setFormatKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const resetFilters = () => {
    setQuery('');
    setSavedOnly(false);
    setTheaterIds([]);
    setFormatKeys([]);
  };

  const count = selected.length;
  const atCap = config.selectionCap != null && count >= config.selectionCap;

  return (
    <section
      className="v2-bp-manage-page"
      aria-labelledby="v2-bp-manage-title"
      data-build-plan-manage={mode}
      data-build-plan-manage-source={mockupMode ? 'build-plan-manage-mockup' : 'live'}
    >
      <header className="v2-bp-manage-header">
        <h1 id="v2-bp-manage-title" className="v2-bp-manage-title">
          {config.pageTitle}
        </h1>
        <p className="v2-bp-manage-support">{config.pageSupport}</p>
      </header>

      <div className="v2-bp-manage-search">
        <label className="v2-visually-hidden" htmlFor={searchId}>
          Search films
        </label>
        <span className="v2-bp-manage-search-icon" aria-hidden="true">
          <IconSearch width={13} height={13} />
        </span>
        <input
          id={searchId}
          type="search"
          className="v2-bp-manage-search-input"
          placeholder="Search films"
          value={query}
          autoComplete="off"
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {!mockupMode ? (
        <div className="v2-bp-manage-filters" role="toolbar" aria-label="Filters">
          <button
            type="button"
            className={`v2-bp-manage-chip${savedOnly ? ' is-selected' : ''}`}
            aria-pressed={savedOnly}
            onClick={() => setSavedOnly((v) => !v)}
          >
            <span aria-hidden="true">
              <IconBookmark width={11} height={11} />
            </span>
            <span>Saved</span>
          </button>
          <button
            type="button"
            className={`v2-bp-manage-chip${theaterIds.length ? ' is-selected' : ''}`}
            aria-pressed={theaterIds.length > 0}
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((v) => !v)}
          >
            <span aria-hidden="true">
              <IconBuilding width={11} height={11} />
            </span>
            <span>
              Theater{theaterIds.length ? ` (${theaterIds.length})` : ''}
            </span>
          </button>
          <button
            type="button"
            className={`v2-bp-manage-chip${formatKeys.length ? ' is-selected' : ''}`}
            aria-pressed={formatKeys.length > 0}
            onClick={() => setFiltersOpen((v) => !v)}
          >
            <span aria-hidden="true">
              <IconFilm width={11} height={11} />
            </span>
            <span>
              Format{formatKeys.length ? ` (${formatKeys.length})` : ''}
            </span>
          </button>
          {filtersActive ? (
            <button
              type="button"
              className="v2-bp-manage-chip v2-bp-manage-chip-reset"
              onClick={resetFilters}
            >
              Reset
            </button>
          ) : null}
        </div>
      ) : null}

      {!mockupMode && filtersOpen ? (
        <div className="v2-bp-manage-filter-panel" aria-label="Theater and format filters">
          {filterOptions.theaters.length > 0 ? (
            <div className="v2-bp-manage-filter-group">
              <p className="v2-bp-manage-filter-group-label">Theater</p>
              <div className="v2-bp-manage-filter-options">
                {filterOptions.theaters.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`v2-bp-manage-chip${
                      theaterIds.includes(t.id) ? ' is-selected' : ''
                    }`}
                    aria-pressed={theaterIds.includes(t.id)}
                    onClick={() => toggleTheater(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {filterOptions.formats.length > 0 ? (
            <div className="v2-bp-manage-filter-group">
              <p className="v2-bp-manage-filter-group-label">Format</p>
              <div className="v2-bp-manage-filter-options">
                {filterOptions.formats.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    className={`v2-bp-manage-chip${
                      formatKeys.includes(f.key) ? ' is-selected' : ''
                    }`}
                    aria-pressed={formatKeys.includes(f.key)}
                    onClick={() => toggleFormat(f.key)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <section
        className="v2-bp-manage-block"
        aria-labelledby="v2-bp-manage-sel-h"
      >
        <button
          type="button"
          className="v2-bp-manage-section-head"
          aria-expanded={selectedOpen}
          aria-controls="v2-bp-manage-selected-list"
          id="v2-bp-manage-sel-h"
          onClick={() => setSelectedOpen((v) => !v)}
        >
          <span className="v2-bp-manage-section-title">
            {config.selectedHeading}
          </span>
          <span className="v2-bp-manage-section-meta">
            <span className="v2-bp-manage-count-badge" aria-hidden="true">
              {count}
            </span>
            <span
              className={`v2-bp-manage-disc${selectedOpen ? ' is-open' : ''}`}
              aria-hidden="true"
            >
              <IconChevron width={12} height={12} />
            </span>
          </span>
        </button>
        <div
          id="v2-bp-manage-selected-list"
          className="v2-bp-manage-list"
          hidden={!selectedOpen}
        >
          {selected.length === 0 ? (
            <p className="v2-bp-manage-empty">{config.emptySelected}</p>
          ) : (
            selected.map((film) => (
              <FilmRow
                key={film.id}
                film={film}
                action={
                  <button
                    type="button"
                    className="v2-bp-manage-remove"
                    aria-label={config.removeAria(film.title)}
                    onClick={() => handleRemove(film.id)}
                  >
                    <IconClose width={8} height={8} aria-hidden="true" />
                  </button>
                }
              />
            ))
          )}
        </div>
      </section>

      <section
        className="v2-bp-manage-block"
        aria-labelledby="v2-bp-manage-cand-h"
      >
        <div className="v2-bp-manage-section-head v2-bp-manage-section-head-static">
          <h2 id="v2-bp-manage-cand-h" className="v2-bp-manage-section-title">
            {config.candidateHeading}
          </h2>
        </div>
        <div className="v2-bp-manage-list">
          {filteredCandidates.length === 0 ? (
            <p className="v2-bp-manage-empty">
              {query.trim() || filtersActive
                ? 'No films match your filters'
                : config.emptyCandidates}
            </p>
          ) : (
            filteredCandidates.map((film) => (
              <FilmRow
                key={film.id}
                film={film}
                action={
                  <button
                    type="button"
                    className="v2-bp-manage-add"
                    aria-label={config.addAria(film.title)}
                    disabled={atCap}
                    aria-disabled={atCap}
                    title={
                      atCap ? config.capReachedMessage ?? undefined : undefined
                    }
                    onClick={() => handleAdd(film)}
                  >
                    <IconPlus width={10} height={10} aria-hidden="true" />
                  </button>
                }
              />
            ))
          )}
        </div>
      </section>

      <footer className="v2-bp-manage-footer" aria-label="Selection summary">
        <div className="v2-bp-manage-footer-copy">
          <p className="v2-bp-manage-footer-count">
            {config.footerCountLabel(count)}
          </p>
          <p className="v2-bp-manage-footer-support">{config.footerSupport}</p>
        </div>
        <button
          type="button"
          className="v2-bp-manage-done"
          onClick={handleDone}
        >
          Done
        </button>
      </footer>

      <p id={statusId} className="v2-visually-hidden" role="status">
        {statusMessage}
      </p>
    </section>
  );
}
