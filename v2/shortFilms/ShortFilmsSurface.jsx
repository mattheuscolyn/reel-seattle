/**
 * Short Films full-list destination — Home shelf-detail consumer.
 *
 * Reuses HomeShelfDetailSurface / HomeShelfDetailFilmCard chrome.
 * Cards are individual Shorts (not ShortsPrograms). No Save / Seen / NI.
 */

import { useState } from 'react';
import HomeShelfDetailFilmCard from '../homeShelfDetail/HomeShelfDetailFilmCard.jsx';
import HomeShelfDetailSurface from '../homeShelfDetail/HomeShelfDetailSurface.jsx';
import { buildLiveShortFilmsPresentation } from '../shortsPrograms/composeHomeShortFilms.js';

/**
 * @param {{
 *   homeData?: object | null,
 *   shortsIndex?: object | null,
 *   enrichmentIndex?: object | null,
 *   onOpenShortDetail?: (payload: {
 *     shortId: string,
 *     shortsProgramId?: string | null,
 *   }) => void,
 * }} props
 */
export default function ShortFilmsSurface({
  homeData = null,
  shortsIndex = null,
  enrichmentIndex = null,
  onOpenShortDetail,
}) {
  const basePresentation = buildLiveShortFilmsPresentation(
    homeData,
    shortsIndex,
    enrichmentIndex,
  );
  const [expandedFilmKey, setExpandedFilmKey] = useState(null);

  const toggleExpand = (filmKey) => {
    setExpandedFilmKey((current) => (current === filmKey ? null : filmKey));
  };

  const isUnavailable = basePresentation.source === 'live-unavailable';
  const isEmpty = basePresentation.source === 'live-empty';

  return (
    <HomeShelfDetailSurface
      title={basePresentation.pageTitle}
      source={basePresentation.source}
      resultCountLabel={basePresentation.countLabel}
      unavailable={
        isUnavailable
          ? {
              title: basePresentation.unavailableTitle,
              body: basePresentation.unavailableBody,
            }
          : null
      }
      empty={
        isEmpty
          ? {
              title: basePresentation.emptyTitle,
              body: basePresentation.emptyBody,
            }
          : null
      }
      sections={basePresentation.sections}
      showSectionTitles={false}
      showFilmList={!isUnavailable && !isEmpty}
      expandedFilmKey={expandedFilmKey}
      onToggleExpand={toggleExpand}
      filmCardProps={{
        hideFilmActions: true,
        filmActionState: () => ({
          filmRef: null,
          saved: false,
          notInterested: false,
        }),
        onToggleSave: () => {},
        onToggleNotInterested: () => {},
        onOpenFilmDetail: ({ shortId, primaryShortsProgramId, filmKey }) => {
          const id =
            (typeof shortId === 'string' && shortId.trim()) ||
            (typeof filmKey === 'string' && filmKey.trim()) ||
            null;
          if (!id) return;
          onOpenShortDetail?.({
            shortId: id,
            shortsProgramId: primaryShortsProgramId ?? null,
          });
        },
      }}
      renderFilmCard={(film, { expanded }) => (
        <HomeShelfDetailFilmCard
          key={film.filmKey}
          film={film}
          expanded={expanded}
          onToggleExpand={toggleExpand}
          hideFilmActions
          filmActionState={() => ({
            filmRef: null,
            saved: false,
            notInterested: false,
          })}
          onToggleSave={() => {}}
          onToggleNotInterested={() => {}}
          onOpenFilmDetail={({ shortId, primaryShortsProgramId, filmKey }) => {
            const id =
              (typeof shortId === 'string' && shortId.trim()) ||
              (typeof filmKey === 'string' && filmKey.trim()) ||
              null;
            if (!id) return;
            onOpenShortDetail?.({
              shortId: id,
              shortsProgramId: primaryShortsProgramId ?? null,
            });
          }}
        />
      )}
    />
  );
}
