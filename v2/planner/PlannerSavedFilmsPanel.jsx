/**
 * Planner — Saved Films tab panel.
 *
 * Canonical reference: Planner Main Page Saved Films.png
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  IconChevron,
  IconInfo,
  IconMore,
  IconSliders,
  IconTrash,
} from '../icons.jsx';
import { subscribeFilmStoreMutations } from '../auth/filmStoreMutationBridge.js';
import { isPlannerMockupMode } from '../fixtures/plannerLandingMockupFixture.js';
import { composePlannerSavedFilmsPresentation } from './composePlannerSavedFilmsPresentation.js';
import SavedFilmChooseShowtimeSheet from './SavedFilmChooseShowtimeSheet.jsx';
import { unsaveFilm } from '../stores/savedFilmsStore.js';
import {
  getScheduleSettings,
  subscribeScheduleSettings,
} from '../stores/scheduleSettingsStore.js';
import { listPlannedPerformanceKeys } from './addSavedFilmShowtimeToPlanner.js';

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
function PosterThumb({ url, title = '', className = 'v2-psf-poster' }) {
  if (url) {
    return <img className={className} src={url} alt="" />;
  }
  return (
    <span
      className={`${className} v2-psf-poster-fallback`}
      aria-hidden="true"
      data-title={title}
    />
  );
}

/**
 * @param {{
 *   homeData?: object | null,
 *   enrichmentIndex?: object | null,
 *   acceptedPlansRevision?: number,
 *   onOpenFilmDetail?: (payload: {
 *     filmKey: string,
 *     opportunityKey?: string | null,
 *   }) => void,
 *   onAcceptedPlansChange?: () => void,
 * }} props
 */
export default function PlannerSavedFilmsPanel({
  homeData = null,
  enrichmentIndex = null,
  acceptedPlansRevision = 0,
  onOpenFilmDetail = null,
  onAcceptedPlansChange = null,
}) {
  const storage = getBrowserStorage();
  const mockupMode = isPlannerMockupMode();
  const [savedRevision, setSavedRevision] = useState(0);
  const [settingsTick, setSettingsTick] = useState(0);
  const [sortId, setSortId] = useState('urgent');
  const [filterId, setFilterId] = useState('all');
  const [sortOpen, setSortOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [menuFilmKey, setMenuFilmKey] = useState(null);
  const [chooseFilmKey, setChooseFilmKey] = useState(null);
  const [chooseRow, setChooseRow] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);
  const sortMenuId = useId();
  const filterMenuId = useId();
  const panelRef = useRef(null);

  useEffect(() => subscribeFilmStoreMutations(() => setSavedRevision((n) => n + 1)), []);
  useEffect(
    () => subscribeScheduleSettings(() => setSettingsTick((n) => n + 1)),
    [],
  );
  void settingsTick;
  void savedRevision;
  void acceptedPlansRevision;

  useEffect(() => {
    const onDocClick = (event) => {
      if (!panelRef.current?.contains(event.target)) {
        setSortOpen(false);
        setFilterOpen(false);
        setMenuFilmKey(null);
      }
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  const timeFormatId = getScheduleSettings(storage).timeFormatId;
  const plannedKeys = useMemo(
    () => (mockupMode ? null : listPlannedPerformanceKeys(storage)),
    [storage, mockupMode, acceptedPlansRevision, savedRevision],
  );

  const presentation = useMemo(
    () =>
      composePlannerSavedFilmsPresentation({
        storage,
        homeData,
        enrichmentIndex,
        timeFormatId,
        sortId,
        filterId,
        mockupMode,
        plannedPerformanceKeys: plannedKeys ?? undefined,
      }),
    [
      storage,
      homeData,
      enrichmentIndex,
      timeFormatId,
      sortId,
      filterId,
      mockupMode,
      plannedKeys,
      savedRevision,
      acceptedPlansRevision,
    ],
  );

  const activeSort =
    presentation.sortOptions.find((o) => o.id === presentation.sortId) ??
    presentation.sortOptions[0];
  const activeFilter =
    presentation.filterOptions.find((o) => o.id === presentation.filterId) ??
    presentation.filterOptions[0];

  const openChooseShowtime = (row) => {
    if (!row.chooseShowtimeEnabled) return;
    setMenuFilmKey(null);
    setChooseFilmKey(row.filmKey);
    setChooseRow(row);
  };

  const closeChooseShowtime = () => {
    setChooseFilmKey(null);
    setChooseRow(null);
  };

  const handleViewFilmDetails = (row) => {
    setMenuFilmKey(null);
    if (typeof onOpenFilmDetail !== 'function' || !row.filmKey) return;
    onOpenFilmDetail({
      filmKey: row.filmKey,
      opportunityKey: row.nextOpportunityKey ?? null,
    });
  };

  const handleRemoveFromSaved = (row) => {
    setMenuFilmKey(null);
    if (mockupMode) {
      setStatusMessage('Removed from Saved (fixture preview).');
      return;
    }
    if (!row.filmRef) return;
    const result = unsaveFilm(storage, row.filmRef);
    if (result.ok && result.changed) {
      setSavedRevision((n) => n + 1);
      setStatusMessage('Removed from Saved.');
    }
  };

  const isFilteredEmpty =
    presentation.queueCount > 0 && presentation.count === 0;

  return (
    <div
      ref={panelRef}
      className="v2-psf"
      data-planner-section="savedFilms"
      data-planner-saved-source={presentation.source}
    >
      <header className="v2-psf-header">
        <div className="v2-psf-header-row">
          <h2 className="v2-psf-section-title">{presentation.sectionTitle}</h2>
          <span className="v2-psf-count">
            {presentation.count} film{presentation.count === 1 ? '' : 's'}
          </span>
        </div>
        {presentation.count > 0 ? (
          <p className="v2-psf-intro">{presentation.intro}</p>
        ) : null}
      </header>

      {presentation.queueCount > 0 ? (
        <div className="v2-psf-controls">
          <div className="v2-psf-control-wrap">
            <button
              type="button"
              className="v2-psf-control-btn"
              aria-expanded={sortOpen}
              aria-controls={sortMenuId}
              onClick={(e) => {
                e.stopPropagation();
                setFilterOpen(false);
                setSortOpen((v) => !v);
              }}
            >
              <span className="v2-psf-control-icon" aria-hidden="true">
                ≡
              </span>
              Sort: {activeSort.label}
            </button>
            {sortOpen ? (
              <ul id={sortMenuId} className="v2-psf-menu" role="menu">
                {presentation.sortOptions.map((option) => (
                  <li key={option.id} role="none">
                    <button
                      type="button"
                      role="menuitem"
                      className={
                        option.id === presentation.sortId
                          ? 'v2-psf-menu-item v2-psf-menu-item-active'
                          : 'v2-psf-menu-item'
                      }
                      onClick={() => {
                        setSortId(option.id);
                        setSortOpen(false);
                      }}
                    >
                      {option.label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="v2-psf-control-wrap">
            <button
              type="button"
              className="v2-psf-control-btn"
              aria-expanded={filterOpen}
              aria-controls={filterMenuId}
              onClick={(e) => {
                e.stopPropagation();
                setSortOpen(false);
                setFilterOpen((v) => !v);
              }}
            >
              <IconSliders width={14} height={14} aria-hidden="true" />
              Filter
              {presentation.filterId !== 'all' ? `: ${activeFilter.label}` : ''}
            </button>
            {filterOpen ? (
              <ul id={filterMenuId} className="v2-psf-menu v2-psf-menu-right" role="menu">
                {presentation.filterOptions.map((option) => (
                  <li key={option.id} role="none">
                    <button
                      type="button"
                      role="menuitem"
                      className={
                        option.id === presentation.filterId
                          ? 'v2-psf-menu-item v2-psf-menu-item-active'
                          : 'v2-psf-menu-item'
                      }
                      onClick={() => {
                        setFilterId(option.id);
                        setFilterOpen(false);
                      }}
                    >
                      {option.label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}

      {presentation.count > 0 ? (
        <ul className="v2-psf-list">
          {presentation.rows.map((row) => (
            <li key={row.id}>
              <article
                className="v2-psf-card"
                data-film-key={row.filmKey}
              >
                <div className="v2-psf-card-top">
                  <PosterThumb url={row.posterUrl} title={row.title} />
                  <div className="v2-psf-card-copy">
                    <div className="v2-psf-title-row">
                      <h3 className="v2-psf-title">{row.title}</h3>
                      {row.urgencyBadge ? (
                        <span className="v2-psf-urgency">{row.urgencyBadge}</span>
                      ) : null}
                    </div>
                    <p className="v2-psf-availability">{row.showtimeSummary}</p>
                    {row.nextShowtimeLine ? (
                      <p className="v2-psf-next">{row.nextShowtimeLine}</p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="v2-psf-more"
                    aria-label={`More options for ${row.title}`}
                    aria-expanded={menuFilmKey === row.filmKey}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSortOpen(false);
                      setFilterOpen(false);
                      setMenuFilmKey((current) =>
                        current === row.filmKey ? null : row.filmKey,
                      );
                    }}
                  >
                    <IconMore width={18} height={18} />
                  </button>
                </div>

                {menuFilmKey === row.filmKey ? (
                  <div className="v2-psf-row-menu" role="menu">
                    <p className="v2-psf-row-menu-title">{row.title}</p>
                    <button
                      type="button"
                      className="v2-psf-row-menu-item"
                      role="menuitem"
                      onClick={() => handleViewFilmDetails(row)}
                    >
                      <IconInfo width={16} height={16} aria-hidden="true" />
                      View film details
                    </button>
                    <button
                      type="button"
                      className="v2-psf-row-menu-item v2-psf-row-menu-item-danger"
                      role="menuitem"
                      onClick={() => handleRemoveFromSaved(row)}
                    >
                      <IconTrash width={16} height={16} aria-hidden="true" />
                      Remove from Saved
                    </button>
                  </div>
                ) : null}

                <div className="v2-psf-card-footer">
                  <button
                    type="button"
                    className="v2-psf-choose-btn"
                    onClick={() => openChooseShowtime(row)}
                  >
                    Choose showtime
                    <IconChevron
                      width={14}
                      height={14}
                      className="v2-psf-choose-chevron"
                      aria-hidden="true"
                    />
                  </button>
                  {row.savedLabel ? (
                    <span className="v2-psf-saved-date">{row.savedLabel}</span>
                  ) : null}
                </div>
              </article>
            </li>
          ))}
        </ul>
      ) : (
        <div className="v2-planner-empty" role="status">
          <p className="v2-planner-empty-title">
            {isFilteredEmpty
              ? presentation.filteredEmptyTitle
              : presentation.emptyTitle}
          </p>
          <p className="v2-planner-empty-body">
            {isFilteredEmpty
              ? presentation.filteredEmptyBody
              : presentation.emptyBody}
          </p>
        </div>
      )}

      <SavedFilmChooseShowtimeSheet
        filmKey={chooseFilmKey}
        row={chooseRow}
        open={Boolean(chooseFilmKey)}
        onClose={closeChooseShowtime}
        storage={storage}
        homeData={homeData}
        enrichmentIndex={enrichmentIndex}
        onOpenFilmDetail={onOpenFilmDetail}
        onPlansChanged={onAcceptedPlansChange}
        onAdded={(msg) => {
          setStatusMessage(msg);
          closeChooseShowtime();
        }}
      />

      <p className="v2-psf-status" role="status" aria-live="polite">
        {statusMessage ?? ''}
      </p>
    </div>
  );
}
