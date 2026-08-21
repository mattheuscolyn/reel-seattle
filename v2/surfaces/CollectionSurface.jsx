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
import {
  getSavedFilms,
  unsaveFilm,
} from '../stores/savedFilmsStore.js';

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
  enrichmentIndex = null,
  onBack,
  onOpenFilmDetail,
  onOpenCollection,
}) {
  const storage = getStorage();
  const [dismissedKeys, setDismissedKeys] = useState(() =>
    loadDismissedFilmKeys(storage),
  );
  const [seenKeys, setSeenKeys] = useState(() => loadSeenFilmKeys(storage));
  const [savedItems, setSavedItems] = useState(() => getSavedFilms(storage));
  const savedKeys = useMemo(
    () => savedItems.map((item) => item.filmRef.showtimeFilmKey),
    [savedItems],
  );

  const title = COLLECTION_TITLES[collectionId] ?? 'Explore';

  const content = useMemo(() => {
    // Opening This Week is a designed Stage 1 surface (OpeningThisWeekSurface).
    // Leaving Soon stays gated with honest unavailable copy (LEAVE-01).
    if (collectionId === COLLECTION_IDS.leavingSoon) {
      const shelf = buildLeavingSoonShelf(homeData);
      return {
        status: 'unavailable',
        kind: 'leaving-soon',
        reason: shelf.reason,
        emptyTitle: shelf.emptyTitle,
        emptyBody: shelf.emptyBody,
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
        savedKeys,
        enrichmentIndex,
      }) ?? {
        status: 'unavailable',
        kind: 'empty',
        reason: 'Unknown surface.',
        films: [],
        theaters: [],
        formats: [],
      }
    );
  }, [collectionId, homeData, enrichmentIndex, query, dismissedKeys, seenKeys, savedKeys]);

  const suggested = useMemo(() => buildSuggestedStarts(), []);
  const isLeavingSoon = collectionId === COLLECTION_IDS.leavingSoon;

  return (
    <section className="v2-collection" aria-labelledby="v2-collection-title">
      <button type="button" className="v2-film-detail-back" onClick={onBack}>
        ← Back
      </button>
      {isLeavingSoon ? null : (
        <p className="v2-destination-eyebrow">Explore · scaffold</p>
      )}
      <h1 id="v2-collection-title">{title}</h1>
      {query ? (
        <p className="v2-collection-query">
          Query: <strong>{query}</strong>
        </p>
      ) : null}

      {isLeavingSoon ? (
        <div className="v2-collection-leaving-soon" role="status">
          <p className="v2-collection-leaving-soon-title">
            {content.emptyTitle ?? content.reason}
          </p>
          {content.emptyBody ? (
            <p className="v2-collection-leaving-soon-body">{content.emptyBody}</p>
          ) : null}
        </div>
      ) : content.reason ? (
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

      {content.note && !isLeavingSoon ? (
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
                {collectionId === COLLECTION_IDS.saved ? (
                  <button
                    type="button"
                    className="v2-hidden-undo"
                    onClick={() => {
                      unsaveFilm(storage, film.filmKey);
                      setSavedItems(getSavedFilms(storage));
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
