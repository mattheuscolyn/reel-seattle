/**
 * Just Announced full-list destination — Home shelf-detail consumer.
 *
 * Owns presentation + sort state. No category pills; no theater filter
 * (mixed availability would hide films without showtimes unintuitively).
 * Shared chrome/list/card live in `homeShelfDetail/`.
 */

import { useId, useMemo, useState } from 'react';
import HomeShelfDetailFilmCard from '../homeShelfDetail/HomeShelfDetailFilmCard.jsx';
import HomeShelfDetailSurface from '../homeShelfDetail/HomeShelfDetailSurface.jsx';
import { useBodyScrollLock } from '../homeShelfDetail/useBodyScrollLock.js';
import { filmRefFromHomeFilm } from '../save/filmRefFromFilm.js';
import {
  isFilmSaved,
  toggleSavedFilm,
} from '../stores/savedFilmsStore.js';
import {
  isFilmNotInterested,
  toggleFilmNotInterested,
} from '../stores/notInterestedFilmsStore.js';
import { buildLiveJustAnnouncedPresentation } from './buildLiveJustAnnouncedPresentation.js';
import {
  JUST_ANNOUNCED_SORT_OPTIONS,
  resolveJustAnnouncedSortOption,
  sortJustAnnouncedFilms,
} from './justAnnouncedListControls.js';

function getBrowserStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/**
 * @param {{
 *   homeData?: object | null,
 *   enrichmentIndex?: object | null,
 *   onOpenFilmDetail?: (payload: { filmKey: string, opportunityKey?: string | null }) => void,
 *   onOpenShowtimes?: (payload: { filmKey: string, theaterId?: string | null, opportunityKey?: string | null }) => void,
 *   onOpenShowtimesBrowse?: () => void,
 * }} props
 */
export default function JustAnnouncedSurface({
  homeData = null,
  enrichmentIndex = null,
  onOpenFilmDetail,
  onOpenShowtimes,
  onOpenShowtimesBrowse,
}) {
  const basePresentation = buildLiveJustAnnouncedPresentation(
    homeData,
    enrichmentIndex,
  );
  const storage = getBrowserStorage();
  const sortMenuId = useId();
  const [expandedFilmKey, setExpandedFilmKey] = useState(null);
  const [actionRevision, setActionRevision] = useState(0);
  const [sortId, setSortId] = useState('recently-announced');
  const [sortOpen, setSortOpen] = useState(false);

  useBodyScrollLock(sortOpen);

  const toggleExpand = (filmKey) => {
    setExpandedFilmKey((current) => (current === filmKey ? null : filmKey));
  };

  const filmActionState = (film) => {
    void actionRevision;
    const filmRef = filmRefFromHomeFilm(film);
    return {
      filmRef,
      saved: filmRef ? isFilmSaved(storage, filmRef) : false,
      notInterested: filmRef ? isFilmNotInterested(storage, filmRef) : false,
    };
  };

  const handleToggleSave = (film) => {
    const { filmRef } = filmActionState(film);
    if (!filmRef) return;
    toggleSavedFilm(storage, filmRef, {
      title: film.title,
      posterUrl: film.posterUrl,
    });
    setActionRevision((n) => n + 1);
  };

  const handleToggleNotInterested = (film) => {
    const { filmRef } = filmActionState(film);
    if (!filmRef) return;
    toggleFilmNotInterested(storage, filmRef, {
      title: film.title,
      posterUrl: film.posterUrl,
    });
    setActionRevision((n) => n + 1);
  };

  const sortOption = resolveJustAnnouncedSortOption(sortId);

  const visibleFilms = useMemo(
    () => sortJustAnnouncedFilms(basePresentation.films, sortId),
    [basePresentation.films, sortId],
  );

  const isUnavailable = basePresentation.source === 'live-unavailable';
  const isEmpty = basePresentation.source === 'live-empty';
  const showControls =
    !isUnavailable && !isEmpty && basePresentation.films.length > 0;

  const visibleSections = useMemo(
    () =>
      visibleFilms.length > 0
        ? [{ id: 'just-announced', label: 'Just Announced', films: visibleFilms }]
        : [],
    [visibleFilms],
  );

  const controls = showControls ? (
    <div className="v2-shelf-detail-control">
      <button
        type="button"
        className="v2-shelf-detail-page-sort"
        aria-label={`${basePresentation.sortLabel}: ${sortOption.label}`}
        aria-expanded={sortOpen}
        aria-controls={sortMenuId}
        onClick={() => setSortOpen((open) => !open)}
      >
        <span className="v2-shelf-detail-page-sort-label">
          {basePresentation.sortLabel}
        </span>
        <span className="v2-shelf-detail-page-sort-value">
          {sortOption.label}
          <span aria-hidden="true"> ▾</span>
        </span>
      </button>
      {sortOpen ? (
        <ul
          id={sortMenuId}
          className="v2-shelf-detail-menu"
          role="listbox"
          aria-label="Sort Just Announced"
        >
          {JUST_ANNOUNCED_SORT_OPTIONS.map((option) => (
            <li key={option.id} role="none">
              <button
                type="button"
                role="option"
                aria-selected={option.id === sortId}
                className={
                  option.id === sortId
                    ? 'v2-shelf-detail-menu-item is-active'
                    : 'v2-shelf-detail-menu-item'
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
  ) : null;

  return (
    <HomeShelfDetailSurface
      title={basePresentation.pageTitle}
      titleId="v2-just-announced-page-title"
      source={basePresentation.source}
      rootProps={{ 'data-just-announced-source': basePresentation.source }}
      resultCountLabel={null}
      unavailable={
        isUnavailable
          ? {
              title: basePresentation.unavailableTitle,
              body: basePresentation.unavailableBody,
              actionLabel: 'Browse showtimes',
              onAction: () => onOpenShowtimesBrowse?.(),
            }
          : null
      }
      empty={
        isEmpty
          ? {
              title: basePresentation.emptyTitle,
              body: basePresentation.emptyBody,
              actionLabel: 'Browse showtimes',
              onAction: () => onOpenShowtimesBrowse?.(),
            }
          : null
      }
      categoryChips={null}
      controls={controls}
      filteredEmptyMessage={null}
      sections={visibleSections}
      showSectionTitles={false}
      showFilmList={showControls && visibleFilms.length > 0}
      expandedFilmKey={expandedFilmKey}
      onToggleExpand={toggleExpand}
      renderFilmCard={(film, { expanded }) => (
        <HomeShelfDetailFilmCard
          film={film}
          expanded={expanded}
          onToggleExpand={toggleExpand}
          onOpenFilmDetail={onOpenFilmDetail}
          onOpenShowtimes={onOpenShowtimes}
          filmActionState={filmActionState}
          onToggleSave={handleToggleSave}
          onToggleNotInterested={handleToggleNotInterested}
          expandIdPrefix="v2-just-announced-expand"
        />
      )}
    />
  );
}
