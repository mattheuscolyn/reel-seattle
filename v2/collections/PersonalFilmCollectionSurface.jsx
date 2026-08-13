import { useEffect, useId, useMemo, useState } from 'react';
import {
  IconChevron,
  IconEye,
  IconInfo,
  IconLock,
  IconTicket,
} from '../icons.jsx';
import { COLLECTION_IDS } from '../explore/exploreIds.js';
import { subscribeFilmStoreMutations } from '../auth/filmStoreMutationBridge.js';
import { useAuth } from '../auth/useAuth.js';
import {
  getSavedFilms,
  unsaveFilm,
} from '../stores/savedFilmsStore.js';
import {
  getSeenFilms,
  markFilmUnseen,
} from '../stores/seenFilmsStore.js';
import {
  getNotInterestedFilms,
  clearFilmNotInterested,
} from '../stores/notInterestedFilmsStore.js';
import {
  buildPersonalCollectionModel,
  isPersonalCollectionId,
} from './personalCollectionModel.js';
import PersonalCollectionSegmentedControl from './PersonalCollectionSegmentedControl.jsx';
import PersonalCollectionFilmRow from './PersonalCollectionFilmRow.jsx';

function getStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function SectionIcon({ name }) {
  if (name === 'ticket') return <IconTicket width={16} height={16} aria-hidden="true" />;
  if (name === 'eye') return <IconEye width={16} height={16} aria-hidden="true" />;
  return null;
}

/**
 * Shared personal film collection surface for Saved / Seen / Not Interested.
 */
export default function PersonalFilmCollectionSurface({
  collectionId = COLLECTION_IDS.saved,
  homeData = null,
  enrichmentIndex = null,
  onOpenFilmDetail,
  onOpenCollection,
}) {
  const storage = getStorage();
  const auth = useAuth();
  const sortMenuId = useId();
  const signedIn = Boolean(auth?.signedIn);

  const [revision, setRevision] = useState(0);
  const [sortId, setSortId] = useState(null);
  const [sortOpen, setSortOpen] = useState(false);

  useEffect(() => {
    return subscribeFilmStoreMutations(() => {
      setRevision((n) => n + 1);
    });
  }, []);

  useEffect(() => {
    setSortId(null);
    setSortOpen(false);
  }, [collectionId]);

  const savedItems = useMemo(() => {
    void revision;
    return getSavedFilms(storage);
  }, [storage, revision]);

  const seenItems = useMemo(() => {
    void revision;
    return getSeenFilms(storage);
  }, [storage, revision]);

  const notInterestedItems = useMemo(() => {
    void revision;
    return getNotInterestedFilms(storage);
  }, [storage, revision]);

  const model = useMemo(
    () =>
      buildPersonalCollectionModel({
        collectionId,
        homeData,
        enrichmentIndex,
        savedItems,
        seenItems,
        notInterestedItems,
        sortId,
        signedIn,
      }),
    [
      collectionId,
      homeData,
      enrichmentIndex,
      savedItems,
      seenItems,
      notInterestedItems,
      sortId,
      signedIn,
    ],
  );

  const activeSortLabel =
    model.sortOptions.find((o) => o.id === model.sortId)?.label ?? 'Sort';

  const handleRemove = (row) => {
    if (!row?.filmRef) return;
    if (row.kind === 'saved') {
      unsaveFilm(storage, row.filmRef);
    } else if (row.kind === 'seen') {
      markFilmUnseen(storage, row.filmRef);
    } else if (row.kind === 'hidden') {
      clearFilmNotInterested(storage, row.filmRef);
    }
    setRevision((n) => n + 1);
  };

  if (!isPersonalCollectionId(collectionId)) {
    return null;
  }

  return (
    <section
      className="v2-pfc"
      aria-labelledby="v2-pfc-title"
      data-pfc-kind={model.kind}
    >
      <header className="v2-pfc-header">
        <h1 id="v2-pfc-title" className="v2-pfc-title">
          {model.title}
        </h1>
        <p className="v2-pfc-subtitle">{model.subtitle}</p>
      </header>

      <PersonalCollectionSegmentedControl
        activeSegmentId={model.segmentId}
        onSelectSegment={(_segmentId, nextCollectionId) => {
          if (nextCollectionId && nextCollectionId !== collectionId) {
            onOpenCollection?.({ collectionId: nextCollectionId });
          }
        }}
      />

      <div className="v2-pfc-toolbar">
        <p className="v2-pfc-count">
          {model.totalCount} {model.totalCount === 1 ? 'FILM' : 'FILMS'}
        </p>
        <div className="v2-pfc-sort">
          <button
            type="button"
            className="v2-pfc-sort-btn"
            aria-haspopup="listbox"
            aria-expanded={sortOpen}
            aria-controls={sortMenuId}
            onClick={() => setSortOpen((v) => !v)}
          >
            <span>{activeSortLabel}</span>
            <IconChevron width={14} height={14} aria-hidden="true" />
          </button>
          {sortOpen ? (
            <ul
              id={sortMenuId}
              className="v2-pfc-sort-menu"
              role="listbox"
              aria-label="Sort collection"
            >
              {model.sortOptions.map((option) => (
                <li key={option.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={option.id === model.sortId}
                    className={
                      option.id === model.sortId
                        ? 'v2-pfc-sort-option is-active'
                        : 'v2-pfc-sort-option'
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
      </div>

      <div
        id="v2-pfc-panel"
        role="tabpanel"
        aria-labelledby={`v2-pfc-tab-${model.segmentId}`}
        className="v2-pfc-panel"
      >
        {model.totalCount === 0 ? (
          <div className="v2-pfc-empty" role="status">
            <p className="v2-pfc-empty-title">{model.emptyTitle}</p>
            <p className="v2-pfc-empty-body">{model.emptyBody}</p>
          </div>
        ) : (
          model.sections.map((section) => (
            <section
              key={section.id}
              className="v2-pfc-section"
              aria-labelledby={
                section.title ? `v2-pfc-section-${section.id}` : undefined
              }
            >
              {section.title ? (
                <div className="v2-pfc-section-head">
                  <h2
                    id={`v2-pfc-section-${section.id}`}
                    className="v2-pfc-section-title"
                  >
                    <SectionIcon name={section.icon} />
                    <span>{section.title}</span>
                  </h2>
                  {section.subtitle ? (
                    <p className="v2-pfc-section-subtitle">{section.subtitle}</p>
                  ) : null}
                </div>
              ) : null}
              <ul className="v2-pfc-list" role="list">
                {section.rows.map((row) => (
                  <PersonalCollectionFilmRow
                    key={row.rowKey}
                    row={row}
                    onOpenFilm={onOpenFilmDetail}
                    onRemove={handleRemove}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      <footer
        className={
          model.privacyTone === 'info' ? 'v2-pfc-privacy v2-pfc-privacy-info' : 'v2-pfc-privacy'
        }
      >
        {model.privacyTone === 'info' ? (
          <IconInfo width={16} height={16} aria-hidden="true" />
        ) : (
          <IconLock width={14} height={14} aria-hidden="true" />
        )}
        <p>{model.privacyNote}</p>
      </footer>
    </section>
  );
}
