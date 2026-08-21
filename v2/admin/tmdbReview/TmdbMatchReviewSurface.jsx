/**
 * Internal TMDB Match Review workspace.
 * Desktop-first three-pane layout; not consumer branding.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../auth/useAuth.js';
import {
  fetchTmdbMovieDetail,
  fetchTmdbSearchResults,
  posterUrlFromTmdbPath,
  yearFromReleaseDate,
} from '../../search/tmdbSearchClient.js';
import { REVIEW_DECISIONS, REVIEW_TABS } from './reviewDecisions.js';
import {
  buildTmdbReviewQueue,
  filterReviewIdentities,
  listReviewSources,
  nextReviewKeyAfterSave,
} from './reviewQueueModel.js';
import {
  fetchFilmIdentityReviews,
  saveFilmIdentityReview,
} from './reviewSync.js';
import {
  buildReviewDecisionSnapshot,
  inferSelectionMethod,
  SELECTION_METHODS,
} from './reviewSnapshot.js';
import {
  fetchMatcherCatalogIndex,
  matcherContextForIdentity,
} from './matcherCatalog.js';
import { profileIsAdmin } from './sourceIdentity.js';

const TABS = [
  { id: REVIEW_TABS.unmatched, label: 'Unmatched' },
  { id: REVIEW_TABS.reviewMatched, label: 'Review Matched' },
  { id: REVIEW_TABS.flagged, label: 'Flagged' },
  { id: REVIEW_TABS.needsFollowUp, label: 'Needs Follow-up' },
];

/**
 * @param {{
 *   homeData?: object | null,
 *   enrichmentIndex?: object | null,
 *   onBack?: () => void,
 * }} props
 */
export default function TmdbMatchReviewSurface({
  homeData = null,
  enrichmentIndex = null,
  onBack,
}) {
  const auth = useAuth();
  const isAdmin = profileIsAdmin(auth.profile);
  const [reviews, setReviews] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [tab, setTab] = useState(REVIEW_TABS.unmatched);
  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [selectedKey, setSelectedKey] = useState(null);
  const [draftDecision, setDraftDecision] = useState(null);
  const [adminNote, setAdminNote] = useState('');
  const [selectedTmdb, setSelectedTmdb] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchError, setSearchError] = useState(null);
  const [searchBusy, setSearchBusy] = useState(false);
  const [previewMovie, setPreviewMovie] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [saveStatus, setSaveStatus] = useState(null);
  const [searchAttempted, setSearchAttempted] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [matcherByKey, setMatcherByKey] = useState(() => new Map());
  const searchInputRef = useRef(null);
  const queueSearchRef = useRef(null);
  const queueRef = useRef(null);

  const queue = useMemo(
    () => buildTmdbReviewQueue(homeData, reviews, enrichmentIndex),
    [homeData, reviews, enrichmentIndex],
  );
  const sources = useMemo(
    () => listReviewSources(queue.identities),
    [queue.identities],
  );
  const visible = useMemo(
    () =>
      filterReviewIdentities(queue.identities, {
        tab,
        query,
        source: sourceFilter,
      }),
    [queue.identities, tab, query, sourceFilter],
  );
  const selected =
    visible.find((row) => row.sourceIdentityKey === selectedKey) ||
    visible[0] ||
    null;

  useEffect(() => {
    if (!isAdmin) return undefined;
    let cancelled = false;
    fetchFilmIdentityReviews().then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setLoadError(result.error || 'Could not load reviews.');
        return;
      }
      setLoadError(null);
      setReviews(result.reviews);
    });
    fetchMatcherCatalogIndex().then((result) => {
      if (cancelled || !result.ok) return;
      setMatcherByKey(result.byKey);
    });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!selected) {
      setSelectedKey(null);
      return;
    }
    setSelectedKey(selected.sourceIdentityKey);
    setSearchQuery(selected.rawTitle || selected.displayTitle || '');
    setDraftDecision(null);
    setSelectedTmdb(
      selected.review?.tmdb_id
        ? { tmdbId: selected.review.tmdb_id }
        : parseTmdb(selected.canonicalFilmId),
    );
    setAdminNote(selected.review?.admin_note || '');
    setSearchResults([]);
    setSearchAttempted(false);
    setPreviewMovie(null);
    setSaveError(null);
    setSaveStatus(null);
  }, [selected?.sourceIdentityKey]);

  useEffect(() => {
    const onKey = (event) => {
      const typingInField =
        event.target instanceof HTMLElement &&
        (event.target.tagName === 'INPUT' ||
          event.target.tagName === 'TEXTAREA' ||
          event.target.tagName === 'SELECT');
      if (event.key === '/' && !typingInField) {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
      if (
        (event.key === 'k' || event.key === 'K') &&
        (event.metaKey || event.ctrlKey) &&
        !typingInField
      ) {
        event.preventDefault();
        queueSearchRef.current?.focus();
      }
      if (
        (event.key === 'ArrowDown' || event.key === 'ArrowUp') &&
        queueRef.current?.contains(document.activeElement)
      ) {
        event.preventDefault();
        const index = visible.findIndex(
          (row) => row.sourceIdentityKey === selected?.sourceIdentityKey,
        );
        const next =
          event.key === 'ArrowDown'
            ? visible[Math.min(visible.length - 1, index + 1)]
            : visible[Math.max(0, index - 1)];
        if (next) setSelectedKey(next.sourceIdentityKey);
      }
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const runSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    setSearchBusy(true);
    setSearchError(null);
    setSearchAttempted(true);
    const result = await fetchTmdbSearchResults(q, { limit: 5 });
    setSearchBusy(false);
    if (!result.ok) {
      setSearchError('TMDB search failed.');
      setSearchResults([]);
      return;
    }
    setSearchResults(result.results);
    if (result.results.length === 0) {
      setSearchError(null);
    }
  }, [searchQuery]);

  const selectedMatcherContext = useMemo(
    () => matcherContextForIdentity(matcherByKey, selected?.sourceIdentityKey),
    [matcherByKey, selected?.sourceIdentityKey],
  );
  const matcherCandidates = Array.isArray(selectedMatcherContext?.candidates)
    ? selectedMatcherContext.candidates
    : [];

  const handlePreview = async (
    candidate,
    { fromManualSearch = true, fromMatcherCandidate = false, candidateRank = null } = {},
  ) => {
    const selectionMethod = inferSelectionMethod({
      selectedTmdbId: candidate.tmdbId,
      canonicalFilmId: selected?.canonicalFilmId,
      proposedTmdbId: selectedMatcherContext?.proposed_tmdb_id ?? null,
      fromManualSearch,
      fromMatcherCandidate,
    });
    setSelectedTmdb({
      tmdbId: candidate.tmdbId,
      title: candidate.title,
      originalTitle: candidate.originalTitle ?? null,
      year: candidate.year,
      overview: candidate.synopsis,
      posterUrl: candidate.posterUrl,
      selectionMethod,
      candidateRank,
    });
    setDraftDecision(REVIEW_DECISIONS.matched);
    setSaveStatus(null);
    setSaveError(null);
    const detail = await fetchTmdbMovieDetail(candidate.filmId);
    if (detail.ok && detail.movie) {
      setPreviewMovie(detail.movie);
      setSelectedTmdb((prev) =>
        prev && prev.tmdbId === candidate.tmdbId
          ? {
              ...prev,
              originalTitle:
                detail.movie.originalTitle ?? prev.originalTitle ?? null,
              runtimeMin: detail.movie.runtimeMin ?? prev.runtimeMin ?? null,
              year: detail.movie.year ?? prev.year,
              overview: detail.movie.synopsis ?? prev.overview,
            }
          : prev,
      );
    }
  };

  const handleSave = async () => {
    if (!selected || saveBusy) return;
    const decision = draftDecision;
    if (!decision) {
      setSaveError('Choose a decision before saving.');
      return;
    }
    if (decision === REVIEW_DECISIONS.matched && !selectedTmdb?.tmdbId) {
      setSaveError('Select a TMDB title before saving a match.');
      return;
    }
    setSaveBusy(true);
    setSaveError(null);
    const reviewedAt = new Date().toISOString();
    const result = await saveFilmIdentityReview({
      sourceIdentityKey: selected.sourceIdentityKey,
      source: selected.source,
      sourceFilmId: selected.sourceFilmId,
      showtimeFilmKey: selected.showtimeFilmKey,
      decision,
      tmdbId: selectedTmdb?.tmdbId ?? null,
      adminNote,
      snapshot: buildReviewDecisionSnapshot({
        identity: selected,
        decision,
        selectedTmdb,
        matcherContext: selectedMatcherContext,
        reviewedAt,
      }),
    });
    setSaveBusy(false);
    if (!result.ok) {
      setSaveError(result.error || 'Save failed.');
      return;
    }
    setReviews((prev) => {
      const next = prev.filter(
        (row) => row.source_identity_key !== selected.sourceIdentityKey,
      );
      next.unshift(result.review);
      return next;
    });
    const nextKey = nextReviewKeyAfterSave(
      visible,
      selected.sourceIdentityKey,
    );
    setSaveStatus(
      nextKey
        ? 'Decision saved. Advanced to the next item in this queue.'
        : 'Decision saved. Open another tab to revisit reviewed records.',
    );
    if (nextKey) setSelectedKey(nextKey);
  };

  if (auth.status === 'loading') {
    return (
      <div className="v2-admin-review">
        <p>Checking admin access…</p>
      </div>
    );
  }

  if (!auth.signedIn || !isAdmin) {
    return (
      <div className="v2-admin-review">
        <button type="button" className="v2-admin-review-back" onClick={onBack}>
          Back
        </button>
        <h1>Not found</h1>
        <p>This admin tool isn’t available for this account.</p>
      </div>
    );
  }

  return (
    <div className="v2-admin-review">
      <header className="v2-admin-review-top">
        <div>
          <button type="button" className="v2-admin-review-back" onClick={onBack}>
            Back
          </button>
          <h1>TMDB Match Review</h1>
          <p>Admin-only film identity review.</p>
        </div>
        <div className="v2-admin-review-pills">
          <span className="v2-admin-review-pill v2-admin-review-pill-ok">
            Authorized admin
          </span>
          <span className="v2-admin-review-pill">
            Signed in as {auth.user?.email || 'admin'}
          </span>
        </div>
        <label className="v2-admin-review-search">
          <span className="v2-sr-only">Search the review queue</span>
          <input
            ref={queueSearchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search queue"
            aria-keyshortcuts="Control+K Meta+K"
          />
        </label>
      </header>

      <nav className="v2-admin-review-tabs" aria-label="Review queues">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={
              tab === item.id
                ? 'v2-admin-review-tab v2-admin-review-tab-on'
                : 'v2-admin-review-tab'
            }
            onClick={() => {
              setTab(item.id);
              setSelectedKey(null);
            }}
          >
            {item.label} ({queue.counts[item.id] || 0})
          </button>
        ))}
      </nav>

      {loadError ? (
        <p className="v2-admin-review-banner" role="status">
          {loadError}
        </p>
      ) : null}

      <div className="v2-admin-review-grid">
        <section
          className="v2-admin-review-pane"
          aria-label="Review queue"
          ref={queueRef}
        >
          <div className="v2-admin-review-filters">
            <label>
              Source
              <select
                value={sourceFilter}
                onChange={(event) => setSourceFilter(event.target.value)}
              >
                <option value="">All sources</option>
                {sources.map((source) => (
                  <option key={source} value={source}>
                    {source}
                  </option>
                ))}
              </select>
            </label>
            <p>{visible.length} results</p>
          </div>
          <ul className="v2-admin-review-queue">
            {visible.map((row) => {
              const selectedRow =
                row.sourceIdentityKey === selected?.sourceIdentityKey;
              return (
                <li key={row.sourceIdentityKey}>
                  <button
                    type="button"
                    className={
                      selectedRow
                        ? 'v2-admin-review-queue-item v2-admin-review-queue-item-on'
                        : 'v2-admin-review-queue-item'
                    }
                    data-source-identity-key={row.sourceIdentityKey}
                    aria-current={selectedRow ? 'true' : undefined}
                    onClick={() => setSelectedKey(row.sourceIdentityKey)}
                  >
                    <strong>{row.displayTitle}</strong>
                    <span>
                      {row.theaters[0] || row.source} · {row.statusLabel}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {visible.length === 0 ? (
            <p className="v2-admin-review-empty">No identities in this queue.</p>
          ) : null}
        </section>

        <section className="v2-admin-review-pane" aria-label="Source evidence">
          {selected ? (
            <>
              <h2>Source evidence</h2>
              {selected.canonicalFilmId ? (
                <aside className="v2-admin-review-current-match">
                  <h3>Current match</h3>
                  <p>
                    {selected.enrichment?.title || selected.displayTitle}
                    {selected.enrichment?.year
                      ? ` (${selected.enrichment.year})`
                      : ''}
                  </p>
                  <p>
                    {selected.canonicalFilmId} · {matchOriginLabel(selected)}
                  </p>
                </aside>
              ) : !selected.review ? (
                <p className="v2-admin-review-alert">No confident TMDB match.</p>
              ) : null}
              <dl className="v2-admin-review-dl">
                <dt>Raw source title</dt>
                <dd>{selected.rawTitle}</dd>
                <dt>Normalized / display title</dt>
                <dd>{selected.normalizedTitle}</dd>
                <dt>Source / theaters</dt>
                <dd>
                  {selected.source}
                  {selected.theaters.length
                    ? ` · ${selected.theaters.join(', ')}`
                    : ''}
                </dd>
                <dt>Source identity key</dt>
                <dd>
                  <code>{selected.sourceIdentityKey}</code>
                </dd>
                <dt>Source film ID</dt>
                <dd>{selected.sourceFilmId || '—'}</dd>
                <dt>Canonical film ID</dt>
                <dd>{selected.canonicalFilmId || '—'}</dd>
                <dt>Match origin</dt>
                <dd>{matchOriginLabel(selected)}</dd>
                <dt>Runtime</dt>
                <dd>
                  {selected.runtimeMin != null
                    ? `${selected.runtimeMin} min (from source)`
                    : '—'}
                </dd>
                {selected.sourceUrl ? (
                  <>
                    <dt>Source URL</dt>
                    <dd>
                      <a href={selected.sourceUrl} target="_blank" rel="noreferrer">
                        Open source page
                      </a>
                    </dd>
                  </>
                ) : null}
              </dl>
              <h3>Upcoming / current showtimes</h3>
              <ul className="v2-admin-review-showtimes">
                {selected.showtimes.map((show, index) => (
                  <li key={`${show.date}-${show.time}-${index}`}>
                    {show.date} {show.time} · {show.theaterName}
                  </li>
                ))}
              </ul>
              {selected.showtimes.length >= 8 ? (
                <p>Showing first 8 showtimes.</p>
              ) : null}
              {selected.enrichment && !selected.canonicalFilmId ? (
                <aside className="v2-admin-review-current">
                  <h3>Current enrichment</h3>
                  <p>
                    {selected.enrichment.title}
                    {selected.enrichment.year
                      ? ` (${selected.enrichment.year})`
                      : ''}
                  </p>
                </aside>
              ) : null}
              <label className="v2-admin-review-note">
                Admin note
                <textarea
                  maxLength={500}
                  value={adminNote}
                  onChange={(event) => setAdminNote(event.target.value)}
                  rows={4}
                />
                <span>{adminNote.length}/500</span>
              </label>
            </>
          ) : (
            <p>Select a queue item.</p>
          )}
        </section>

        <section className="v2-admin-review-pane" aria-label="TMDB candidates">
          <h2>TMDB candidates</h2>
          {selectedMatcherContext ? (
            <div className="v2-admin-review-matcher-context">
              <p>
                Matcher: {selectedMatcherContext.match_status || '—'}
                {selectedMatcherContext.search_title
                  ? ` · search “${selectedMatcherContext.search_title}”`
                  : ''}
                {selectedMatcherContext.auto_confirm_blocked_reason
                  ? ` · blocked: ${selectedMatcherContext.auto_confirm_blocked_reason}`
                  : ''}
              </p>
              {matcherCandidates.length > 0 ? (
                <ul className="v2-admin-review-candidates">
                  {matcherCandidates.map((candidate) => (
                    <li key={`matcher-${candidate.tmdb_id}`}>
                      <article
                        className={
                          selectedTmdb?.tmdbId === candidate.tmdb_id
                            ? 'v2-admin-review-candidate v2-admin-review-candidate-on'
                            : 'v2-admin-review-candidate'
                        }
                      >
                        <div>
                          <strong>
                            #{candidate.rank} {candidate.title || 'Untitled'}
                          </strong>
                          {candidate.release_year ? (
                            <span> ({candidate.release_year})</span>
                          ) : null}
                          <div>
                            score {candidate.score ?? '—'} · TMDB {candidate.tmdb_id}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            void handlePreview(
                              {
                                tmdbId: candidate.tmdb_id,
                                filmId: `tmdb:${candidate.tmdb_id}`,
                                title: candidate.title,
                                originalTitle: candidate.original_title,
                                year: candidate.release_year,
                                synopsis: null,
                                posterUrl: null,
                              },
                              {
                                fromManualSearch: false,
                                fromMatcherCandidate: true,
                                candidateRank: candidate.rank,
                              },
                            )
                          }
                        >
                          Use matcher candidate
                        </button>
                      </article>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No persisted matcher candidates for this identity.</p>
              )}
            </div>
          ) : (
            <p>
              Matcher catalog not loaded locally — manual TMDB search still
              works; snapshot will omit ranked candidate telemetry.
            </p>
          )}
          <div className="v2-admin-review-tmdb-search">
            <input
              ref={searchInputRef}
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void runSearch();
                }
              }}
              placeholder="Search TMDB"
            />
            <button type="button" onClick={() => void runSearch()} disabled={searchBusy}>
              {searchBusy ? 'Searching…' : 'Search TMDB'}
            </button>
          </div>
          {searchError ? <p role="status">{searchError}</p> : null}
          {!searchBusy &&
          searchAttempted &&
          searchResults.length === 0 &&
          !searchError ? (
            <p>No TMDB candidates. Try a simpler title.</p>
          ) : null}
          <ul className="v2-admin-review-candidates">
            {searchResults.map((candidate) => (
              <li key={candidate.filmId}>
                <article
                  className={
                    selectedTmdb?.tmdbId === candidate.tmdbId
                      ? 'v2-admin-review-candidate v2-admin-review-candidate-on'
                      : 'v2-admin-review-candidate'
                  }
                >
                  {candidate.posterUrl ? (

                    <img src={candidate.posterUrl} alt="" />
                  ) : (
                    <div className="v2-admin-review-poster-ph" />
                  )}
                  <div>
                    <strong>{candidate.title}</strong>
                    {selectedTmdb?.tmdbId === candidate.tmdbId ? (
                      <p className="v2-admin-review-selected-badge">Selected</p>
                    ) : null}
                    {candidate.originalTitle ? (
                      <p>Original: {candidate.originalTitle}</p>
                    ) : null}
                    <p>
                      {candidate.year || 'Year unknown'} · TMDB {candidate.tmdbId}
                    </p>
                    {candidate.synopsis ? <p>{candidate.synopsis}</p> : null}
                    <div className="v2-admin-review-candidate-actions">
                      <button type="button" onClick={() => void handlePreview(candidate)}>
                        Preview
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void handlePreview(candidate, {
                            fromManualSearch: true,
                            fromMatcherCandidate: false,
                          });
                        }}
                      >
                        Use this match
                      </button>
                    </div>
                  </div>
                </article>
              </li>
            ))}
          </ul>
          {previewMovie ? (
            <aside className="v2-admin-review-preview">
              <h3>Previewing</h3>
              <p>
                {previewMovie.title} (
                {yearFromReleaseDate(previewMovie.release_date) || '—'})
              </p>
              {previewMovie.runtime ? <p>{previewMovie.runtime} min</p> : null}
              {previewMovie.poster_path ? (
                <img
                  src={posterUrlFromTmdbPath(previewMovie.poster_path, 'w185')}
                  alt=""
                />
              ) : null}
            </aside>
          ) : null}
        </section>
      </div>

      <footer className="v2-admin-review-footer">
        <div className="v2-admin-review-pending">
          <p>
            Flagging classifies the identity. It does not delete the source
            record. Revisit Flagged or Needs Follow-up to change a prior
            decision.
          </p>
          {selected ? (
            <p>
              {pendingDecisionLabel(draftDecision, selectedTmdb, selected)}
            </p>
          ) : null}
        </div>
        <div className="v2-admin-review-actions">
          <button
            type="button"
            className={actionClass(draftDecision, REVIEW_DECISIONS.matched)}
            onClick={() => setDraftDecision(REVIEW_DECISIONS.matched)}
            disabled={!selectedTmdb?.tmdbId}
          >
            {selected?.canonicalFilmId &&
            selectedTmdb?.tmdbId &&
            parseTmdb(selected.canonicalFilmId)?.tmdbId !== selectedTmdb.tmdbId
              ? 'Replace with selected TMDB title'
              : 'Match to selected TMDB title'}
          </button>
          <button
            type="button"
            className={
              draftDecision === REVIEW_DECISIONS.matched &&
              selectedTmdb?.tmdbId &&
              parseTmdb(selected?.canonicalFilmId)?.tmdbId === selectedTmdb.tmdbId
                ? 'v2-admin-review-action v2-admin-review-action-on'
                : 'v2-admin-review-action'
            }
            onClick={() => {
              const existing = parseTmdb(selected?.canonicalFilmId);
              if (existing) {
                setSelectedTmdb({
                  ...existing,
                  title:
                    selected?.enrichment?.title || selected?.displayTitle || null,
                  year: selected?.enrichment?.year ?? null,
                  selectionMethod: SELECTION_METHODS.confirmExistingCanonical,
                  candidateRank:
                    matcherCandidates.find((row) => row.tmdb_id === existing.tmdbId)
                      ?.rank ?? null,
                });
              }
              setDraftDecision(REVIEW_DECISIONS.matched);
              setSaveStatus(null);
              setSaveError(null);
            }}
            disabled={!selected?.canonicalFilmId}
            title="Keep the current pipeline/admin TMDB id"
          >
            Confirm existing match
          </button>
          <button
            type="button"
            className={actionClass(draftDecision, REVIEW_DECISIONS.notFilm)}
            onClick={() => setDraftDecision(REVIEW_DECISIONS.notFilm)}
            title="Classify as not a film. Does not delete the record."
          >
            Mark not a film
          </button>
          <button
            type="button"
            className={actionClass(draftDecision, REVIEW_DECISIONS.multipleShorts)}
            onClick={() => setDraftDecision(REVIEW_DECISIONS.multipleShorts)}
            title="Classify as a shorts program. Does not delete the record."
          >
            Mark as multiple shorts
          </button>
          <button
            type="button"
            className={actionClass(draftDecision, REVIEW_DECISIONS.needsFollowUp)}
            onClick={() => setDraftDecision(REVIEW_DECISIONS.needsFollowUp)}
            title="Defer matching. Does not delete the record."
          >
            Needs follow-up
          </button>
          <button
            type="button"
            className="v2-admin-review-save"
            onClick={() => void handleSave()}
            disabled={saveBusy}
          >
            {saveBusy ? 'Saving…' : 'Save decision'}
          </button>
        </div>
        {saveError ? (
          <p className="v2-admin-review-error" role="alert">
            {saveError}
          </p>
        ) : null}
        {saveStatus ? <p role="status">{saveStatus}</p> : null}
      </footer>
    </div>
  );
}

function parseTmdb(filmId) {
  if (typeof filmId !== 'string') return null;
  const match = /^tmdb:([1-9][0-9]*)$/.exec(filmId.trim());
  if (!match) return null;
  return { tmdbId: Number(match[1]) };
}

function matchOriginLabel(identity) {
  if (identity.matchOrigin === 'manual') {
    return identity.review?.decision === 'matched'
      ? 'Manual admin match'
      : 'Manual admin classification';
  }
  if (identity.matchOrigin === 'pipeline') {
    return `Automatic pipeline match (${identity.canonicalFilmId})`;
  }
  return 'No accepted match';
}

function pendingDecisionLabel(draft, selectedTmdb, selected) {
  if (draft === 'matched' && selectedTmdb?.tmdbId) {
    const title = selectedTmdb.title || selected?.enrichment?.title || 'selected TMDB title';
    const year = selectedTmdb.year ? ` (${selectedTmdb.year})` : '';
    return `Pending: match to ${title}${year} · TMDB ${selectedTmdb.tmdbId}`;
  }
  if (draft === 'not_film') return 'Pending: classify as not a film (record kept)';
  if (draft === 'multiple_shorts') {
    return 'Pending: classify as multiple shorts (record kept)';
  }
  if (draft === 'needs_follow_up') {
    return 'Pending: needs follow-up (auto-match paused)';
  }
  if (selected?.review?.decision) {
    return `Current decision: ${selected.statusLabel}. Choose a new action to change it.`;
  }
  return 'Choose a decision, then Save. Ctrl/Cmd+Enter also saves.';
}

function actionClass(draft, decision) {
  return draft === decision
    ? 'v2-admin-review-action v2-admin-review-action-on'
    : 'v2-admin-review-action';
}
