import { useMemo, useState } from 'react';
import { COLLECTION_IDS, COLLECTION_TITLES } from '../explore/exploreIds.js';
import { buildExploreCollection } from '../explore/exploreCatalog.js';
import { buildSuggestedStarts } from '../explore/exploreSuggestedStarts.js';
import {
  buildLeavingSoonShelf,
} from '../home/shelfData.js';
import {
  loadDismissedFilmKeys,
  saveDismissedFilmKeys,
  undismissFilm,
} from '../explore/dismissedFilmsStore.js';
import {
  loadSeenFilmKeys,
  saveSeenFilmKeys,
  unmarkFilmSeen,
} from '../explore/seenFilmsStore.js';

function getStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/**
 * Explore-associated collection / directory scaffold.
 */
export default function CollectionSurface({
  collectionId,
  query = null,
  homeData,
  onBack,
  onOpenFilmDetail,
  onOpenCollection,
}) {
  const storage = getStorage();
  const [dismissedKeys, setDismissedKeys] = useState(() =>
    loadDismissedFilmKeys(storage),
  );
  const [seenKeys, setSeenKeys] = useState(() => loadSeenFilmKeys(storage));

  const title = COLLECTION_TITLES[collectionId] ?? 'Explore';

  const content = useMemo(() => {
    // Opening This Week is a designed Stage 1 surface (OpeningThisWeekSurface).
    // Keep Leaving Soon and other collections on this scaffold.
    if (collectionId === COLLECTION_IDS.leavingSoon) {
      const shelf = buildLeavingSoonShelf(homeData);
      return {
        status: 'unavailable',
        kind: 'films',
        reason: shelf.reason,
        films: [],
        theaters: [],
        formats: [],
      };
    }
    return (
      buildExploreCollection(homeData, collectionId, {
        query,
        dismissedKeys,
        seenKeys,
      }) ?? {
        status: 'unavailable',
        kind: 'empty',
        reason: 'Unknown surface.',
        films: [],
        theaters: [],
        formats: [],
      }
    );
  }, [collectionId, homeData, query, dismissedKeys, seenKeys]);

  const suggested = useMemo(() => buildSuggestedStarts(), []);

  return (
    <section className="v2-collection" aria-labelledby="v2-collection-title">
      <button type="button" className="v2-film-detail-back" onClick={onBack}>
        ← Back
      </button>
      <p className="v2-destination-eyebrow">Explore · scaffold</p>
      <h1 id="v2-collection-title">{title}</h1>
      {query ? (
        <p className="v2-collection-query">
          Query: <strong>{query}</strong>
        </p>
      ) : null}

      {content.reason ? (
        <p
          className={
            content.status === 'unavailable'
              ? 'v2-shelf-unavailable'
              : 'v2-shelf-provisional'
          }
          role="status"
        >
          {content.reason}
        </p>
      ) : null}

      {content.note ? (
        <p className="v2-shelf-provisional" role="note">
          {content.note}
        </p>
      ) : null}

      {content.kind === 'suggested-starts' ? (
        <ul className="v2-collection-list">
          {suggested.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="v2-collection-row"
                onClick={() =>
                  onOpenCollection?.({
                    collectionId: item.id,
                    originPrimary: 'explore',
                  })
                }
              >
                <span className="v2-collection-row-copy">
                  <span className="v2-collection-row-title">{item.title}</span>
                  <span className="v2-collection-row-meta">{item.subtitle}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {content.kind === 'film-activity' ? (
        <ul className="v2-collection-list">
          <li>
            <button
              type="button"
              className="v2-collection-row"
              onClick={() =>
                onOpenCollection?.({
                  collectionId: COLLECTION_IDS.seen,
                  originPrimary: 'explore',
                })
              }
            >
              <span className="v2-collection-row-copy">
                <span className="v2-collection-row-title">
                  Seen ({seenKeys.length})
                </span>
                <span className="v2-collection-row-meta">
                  Films you’ve watched on this device
                </span>
              </span>
            </button>
          </li>
          <li>
            <button
              type="button"
              className="v2-collection-row"
              onClick={() =>
                onOpenCollection?.({
                  collectionId: COLLECTION_IDS.hidden,
                  originPrimary: 'explore',
                })
              }
            >
              <span className="v2-collection-row-copy">
                <span className="v2-collection-row-title">
                  Not interested ({dismissedKeys.length})
                </span>
                <span className="v2-collection-row-meta">
                  Local dismissed-film store
                </span>
              </span>
            </button>
          </li>
        </ul>
      ) : null}

      {content.films?.length > 0 ? (
        <ul className="v2-collection-list">
          {content.films.map((film) => (
            <li key={film.filmKey}>
              <div className="v2-collection-row-wrap">
                <button
                  type="button"
                  className="v2-collection-row"
                  onClick={() =>
                    onOpenFilmDetail({
                      filmKey: film.filmKey,
                      opportunityKey: film.nextOpportunityKey,
                    })
                  }
                >
                  <span className="v2-collection-row-poster">
                    {film.posterUrl ? (
                      <img src={film.posterUrl} alt="" />
                    ) : (
                      <span
                        className="v2-shelf-poster-fallback"
                        aria-hidden="true"
                      />
                    )}
                  </span>
                  <span className="v2-collection-row-copy">
                    <span className="v2-collection-row-title">{film.title}</span>
                    {film.metaLabel ? (
                      <span className="v2-collection-row-meta">
                        {film.metaLabel}
                      </span>
                    ) : null}
                  </span>
                </button>
                {collectionId === COLLECTION_IDS.hidden ? (
                  <button
                    type="button"
                    className="v2-hidden-undo"
                    onClick={() => {
                      const next = undismissFilm(film.filmKey, dismissedKeys);
                      setDismissedKeys(next);
                      saveDismissedFilmKeys(storage, next);
                    }}
                  >
                    undo
                  </button>
                ) : null}
                {collectionId === COLLECTION_IDS.seen ? (
                  <button
                    type="button"
                    className="v2-hidden-undo"
                    onClick={() => {
                      const next = unmarkFilmSeen(film.filmKey, seenKeys);
                      setSeenKeys(next);
                      saveSeenFilmKeys(storage, next);
                    }}
                  >
                    remove
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {content.theaters?.length > 0 ? (
        <ul className="v2-collection-list">
          {content.theaters.map((theater) => (
            <li key={theater.id}>
              <div className="v2-collection-row v2-collection-row-static">
                <span className="v2-collection-row-copy">
                  <span className="v2-collection-row-title">{theater.name}</span>
                  {theater.metaLabel ? (
                    <span className="v2-collection-row-meta">
                      {theater.metaLabel}
                    </span>
                  ) : null}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {content.formats?.length > 0 ? (
        <ul className="v2-collection-list">
          {content.formats.map((format) => (
            <li key={format.tag}>
              <div className="v2-collection-row v2-collection-row-static">
                <span className="v2-collection-row-copy">
                  <span className="v2-collection-row-title">{format.tag}</span>
                  <span className="v2-collection-row-meta">
                    {format.count} showtimes
                  </span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {content.status === 'ready' &&
      content.kind === 'films' &&
      content.films.length === 0 &&
      !content.reason ? (
        <p className="v2-shelf-unavailable" role="status">
          No films in this selection for the current window.
        </p>
      ) : null}
    </section>
  );
}
