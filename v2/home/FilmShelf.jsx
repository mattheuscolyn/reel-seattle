import { useEffect, useId, useRef, useState } from 'react';
import FilmShelfCard from './FilmShelfCard.jsx';
import InlineQuickDetail from './InlineQuickDetail.jsx';
import { buildInlineQuickDetail } from './shelfData.js';
import {
  isFilmSaved,
  toggleSavedFilm,
} from '../stores/savedFilmsStore.js';
import {
  isFilmSeen,
  toggleFilmSeen,
} from '../stores/seenFilmsStore.js';
import {
  isFilmNotInterested,
  toggleFilmNotInterested,
} from '../stores/notInterestedFilmsStore.js';
import { filmRefFromHomeFilm } from '../save/filmRefFromFilm.js';
import { subscribeFilmStoreMutations } from '../auth/filmStoreMutationBridge.js';

function getBrowserStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/**
 * Horizontal film shelf with optional inline quick-detail expansion.
 *
 * @param {{
 *   id: string,
 *   title: string,
 *   shelf: { status: string, reason?: string, films: object[] },
 *   homeData: object | null,
 *   enrichmentIndex?: object | null,
 *   expandedFilmKey: string | null,
 *   onExpandFilm: (filmKey: string | null) => void,
 *   onSeeAll: () => void,
 *   onMoreDetails: (payload: { filmKey: string, opportunityKey: string | null }) => void,
 *   detailOverride?: object | null,
 *   hideStatusNotes?: boolean,
 *   maxVisible?: number,
 * }} props
 */
export default function FilmShelf({
  id,
  title,
  shelf,
  homeData,
  enrichmentIndex = null,
  expandedFilmKey,
  onExpandFilm,
  onSeeAll,
  onMoreDetails,
  detailOverride = null,
  hideStatusNotes = false,
  maxVisible = 4,
}) {
  const headingId = `${id}-heading`;
  const panelId = useId();
  const panelRef = useRef(null);
  const [actionRevision, setActionRevision] = useState(0);
  const films = Array.isArray(shelf?.films) ? shelf.films : [];
  const visibleFilms = films.slice(0, Math.max(1, maxVisible));
  useEffect(() => {
    return subscribeFilmStoreMutations(() => {
      setActionRevision((value) => value + 1);
    });
  }, []);

  const expandedFilm =
    films.find((film) => film.filmKey === expandedFilmKey) ?? null;
  const detail =
    detailOverride &&
    expandedFilm &&
    detailOverride.filmKey === expandedFilm.filmKey
      ? detailOverride
      : expandedFilm && homeData
        ? buildInlineQuickDetail(homeData, expandedFilm, enrichmentIndex)
        : null;

  const storage = getBrowserStorage();
  void actionRevision;
  // Prefer shared parent-aware filmRef so variants share Saved/Seen/NI state.
  const filmRef = detail ? filmRefFromHomeFilm(detail) : null;
  const saved = filmRef ? isFilmSaved(storage, filmRef) : false;
  const seen = filmRef ? isFilmSeen(storage, filmRef) : false;
  const notInterested = filmRef
    ? isFilmNotInterested(storage, filmRef)
    : false;

  useEffect(() => {
    if (!expandedFilm || !panelRef.current) return;
    const node = panelRef.current;
    const rect = node.getBoundingClientRect();
    const navReserve = 88;
    if (rect.bottom > window.innerHeight - navReserve) {
      node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [expandedFilmKey, expandedFilm]);

  useEffect(() => {
    if (!expandedFilm) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onExpandFilm(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expandedFilm, onExpandFilm]);

  return (
    <section id={id} className="v2-shelf" aria-labelledby={headingId}>
      <div className="v2-shelf-header">
        <h2 id={headingId} className="v2-shelf-heading">
          {title}
        </h2>
        <button type="button" className="v2-shelf-see-all" onClick={onSeeAll}>
          See all
        </button>
      </div>

      {!hideStatusNotes &&
      shelf.status === 'provisional' &&
      films.length > 0 &&
      shelf.reason ? (
        <p className="v2-shelf-note" role="note">
          {shelf.reason}
        </p>
      ) : null}

      {!hideStatusNotes &&
      shelf.status === 'unavailable' &&
      films.length === 0 ? (
        <div className="v2-shelf-empty" role="status">
          <p className="v2-shelf-empty-title">
            {shelf.emptyTitle || shelf.reason || 'Unavailable'}
          </p>
          {shelf.emptyBody ? (
            <p className="v2-shelf-empty-body">{shelf.emptyBody}</p>
          ) : null}
        </div>
      ) : null}

      {visibleFilms.length > 0 ? (
        <>
          <div
            className={
              maxVisible > 4
                ? 'v2-shelf-row v2-shelf-row-wide'
                : 'v2-shelf-row'
            }
            role="list"
          >
            {visibleFilms.map((film) => {
              const isExpanded = film.filmKey === expandedFilmKey;
              return (
                <div key={film.filmKey} className="v2-shelf-item" role="listitem">
                  <FilmShelfCard
                    film={film}
                    expanded={isExpanded}
                    controlsId={isExpanded ? panelId : undefined}
                    onToggle={() =>
                      onExpandFilm(isExpanded ? null : film.filmKey)
                    }
                  />
                </div>
              );
            })}
          </div>

          {detail ? (
            <div ref={panelRef} className="v2-shelf-expansion">
              <div
                className="v2-shelf-expansion-caret"
                style={{
                  left: `calc(${(visibleFilms
                    .findIndex((f) => f.filmKey === expandedFilmKey) +
                    0.5) *
                    (100 / visibleFilms.length)}% )`,
                }}
                aria-hidden="true"
              />
              <InlineQuickDetail
                detail={detail}
                panelId={panelId}
                onClose={() => onExpandFilm(null)}
                onMoreDetails={() =>
                  onMoreDetails({
                    filmKey: detail.filmKey,
                    opportunityKey: detail.opportunityKey,
                  })
                }
                saved={saved}
                seen={seen}
                notInterested={notInterested}
                onToggleSave={() => {
                  if (!filmRef) return;
                  toggleSavedFilm(storage, filmRef, {
                    title: detail.title,
                    posterUrl: detail.posterUrl,
                  });
                  setActionRevision((n) => n + 1);
                }}
                onToggleSeen={() => {
                  if (!filmRef) return;
                  toggleFilmSeen(storage, filmRef, {
                    title: detail.title,
                    posterUrl: detail.posterUrl,
                  });
                  setActionRevision((n) => n + 1);
                }}
                onToggleNotInterested={() => {
                  if (!filmRef) return;
                  toggleFilmNotInterested(storage, filmRef, {
                    title: detail.title,
                    posterUrl: detail.posterUrl,
                  });
                  setActionRevision((n) => n + 1);
                }}
              />
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
