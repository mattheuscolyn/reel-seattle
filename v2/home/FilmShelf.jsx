import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
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
 * Horizontal film shelf with native swipe scrolling and optional inline
 * quick-detail expansion. On narrow Home layouts, CSS sizes cards so four
 * fit the viewport; remaining cards stay reachable via overflow-x scroll.
 *
 * @param {{
 *   id: string,
 *   title: string,
 *   shelf: { status: string, reason?: string, films: object[] },
 *   homeData: object | null,
 *   enrichmentIndex?: object | null,
 *   expandedFilmKey: string | null,
 *   onExpandFilm: (filmKey: string | null) => void,
 *   onSeeAll?: (() => void) | null,
 *   onMoreDetails: (payload: { filmKey: string, opportunityKey: string | null }) => void,
 *   detailOverride?: object | null,
 *   hideStatusNotes?: boolean,
 *   hideSeeAll?: boolean,
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
  onSeeAll = null,
  onMoreDetails,
  detailOverride = null,
  hideStatusNotes = false,
  hideSeeAll = false,
}) {
  const headingId = `${id}-heading`;
  const panelId = useId();
  const panelRef = useRef(null);
  const rowRef = useRef(null);
  const itemRefs = useRef(/** @type {Record<string, HTMLElement | null>} */ ({}));
  const [actionRevision, setActionRevision] = useState(0);
  const [caretLeftPx, setCaretLeftPx] = useState(null);
  const films = Array.isArray(shelf?.films) ? shelf.films : [];
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

  useLayoutEffect(() => {
    if (!expandedFilmKey || !rowRef.current) {
      setCaretLeftPx(null);
      return;
    }
    const item = itemRefs.current[expandedFilmKey];
    if (!item) {
      setCaretLeftPx(null);
      return;
    }
    item.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    const shelfNode = rowRef.current.closest('.v2-shelf');
    if (!shelfNode) return;
    const shelfRect = shelfNode.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    setCaretLeftPx(itemRect.left + itemRect.width / 2 - shelfRect.left);
  }, [expandedFilmKey, films.length]);

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
        {!hideSeeAll && typeof onSeeAll === 'function' ? (
          <button type="button" className="v2-shelf-see-all" onClick={onSeeAll}>
            See all
          </button>
        ) : null}
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

      {films.length > 0 ? (
        <>
          <div
            ref={rowRef}
            className="v2-shelf-row"
            role="list"
            data-shelf-visible-slots="4"
          >
            {films.map((film) => {
              const isExpanded = film.filmKey === expandedFilmKey;
              return (
                <div
                  key={film.filmKey}
                  className="v2-shelf-item"
                  role="listitem"
                  data-film-key={film.filmKey}
                  ref={(node) => {
                    itemRefs.current[film.filmKey] = node;
                  }}
                >
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
                style={
                  caretLeftPx == null
                    ? undefined
                    : { left: `${caretLeftPx}px` }
                }
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
