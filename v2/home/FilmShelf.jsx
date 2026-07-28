import { useEffect, useId, useRef } from 'react';
import FilmShelfCard from './FilmShelfCard.jsx';
import InlineQuickDetail from './InlineQuickDetail.jsx';
import { buildInlineQuickDetail } from './shelfData.js';

/**
 * Horizontal film shelf with optional inline quick-detail expansion.
 *
 * @param {{
 *   id: string,
 *   title: string,
 *   shelf: { status: string, reason?: string, films: object[] },
 *   homeData: object | null,
 *   expandedFilmKey: string | null,
 *   onExpandFilm: (filmKey: string | null) => void,
 *   onSeeAll: () => void,
 *   onMoreDetails: (payload: { filmKey: string, opportunityKey: string | null }) => void,
 * }} props
 */
export default function FilmShelf({
  id,
  title,
  shelf,
  homeData,
  expandedFilmKey,
  onExpandFilm,
  onSeeAll,
  onMoreDetails,
}) {
  const headingId = `${id}-heading`;
  const panelId = useId();
  const panelRef = useRef(null);
  const films = Array.isArray(shelf?.films) ? shelf.films : [];
  const expandedFilm =
    films.find((film) => film.filmKey === expandedFilmKey) ?? null;
  const detail =
    expandedFilm && homeData
      ? buildInlineQuickDetail(homeData, expandedFilm)
      : null;

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

      {shelf.status === 'unavailable' ? (
        <p className="v2-shelf-unavailable" role="status">
          {shelf.reason}
        </p>
      ) : null}

      {shelf.status === 'provisional' ? (
        <p className="v2-shelf-provisional" role="note">
          {shelf.reason}
        </p>
      ) : null}

      {films.length > 0 ? (
        <>
          <div className="v2-shelf-row" role="list">
            {films.slice(0, 4).map((film) => {
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
                  left: `calc(${(films
                    .slice(0, 4)
                    .findIndex((f) => f.filmKey === expandedFilmKey) +
                    0.5) *
                    25}% )`,
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
              />
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
