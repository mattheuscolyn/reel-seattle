/**
 * Film Identity Review — local-only cockpit surface (T-FILMID-01).
 * Reads allowlisted artifacts; writes decisions via localhost API or patch export.
 */
import { useEffect, useMemo, useRef, useState } from 'react';

const QUEUE_URL = '/data/film_identity/tmdb_match_review_queue.json';
const COVERAGE_URL = '/data/audits/tmdb_film_identity_coverage.json';
const DECISIONS_URL = '/data/film_identity/tmdb_match_decisions.json';

const ACTIONS = [
  { id: 'confirm', label: 'Confirm proposed' },
  { id: 'confirm_alternate', label: 'Confirm selected alternate' },
  { id: 'reject_candidate', label: 'Reject candidate' },
  { id: 'unmapped', label: 'Mark unmapped' },
  { id: 'non_film', label: 'Mark non-film' },
  { id: 'defer', label: 'Defer' },
];

function posterUrl(path) {
  if (!path) return null;
  if (String(path).startsWith('http')) return path;
  return `https://image.tmdb.org/t/p/w92${path}`;
}

function sourceIdentityKey(sourceIdentity) {
  const source = String(sourceIdentity?.source || '').trim();
  const sid = sourceIdentity?.source_film_id;
  const key = sourceIdentity?.showtime_film_key;
  if (sid != null && sid !== '') return `${source}|id|${sid}`;
  return `${source}|key|${key}`;
}

function itemSourceKey(item) {
  return sourceIdentityKey({
    source: item.source,
    source_film_id: item.source_film_id,
    showtime_film_key: item.showtime_film_key,
  });
}

function formatDecisionLabel(decision) {
  if (!decision) return '';
  const name = decision.decision;
  if (name === 'confirm' && decision.tmdb_id) return `confirm → tmdb:${decision.tmdb_id}`;
  if (name === 'reject_candidate' && decision.tmdb_id) {
    return `reject → tmdb:${decision.tmdb_id}`;
  }
  return name;
}

export default function FilmIdentityReviewView() {
  const [queue, setQueue] = useState(null);
  const [coverage, setCoverage] = useState(null);
  const [decisions, setDecisions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState(null);
  const [manualTmdbId, setManualTmdbId] = useState('');
  const [manualSearch, setManualSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [statusMessage, setStatusMessage] = useState(null);
  const [statusTone, setStatusTone] = useState('info');
  const [busy, setBusy] = useState(false);
  const selectedIdRef = useRef(null);

  const activeDecisionsByKey = useMemo(() => {
    const map = new Map();
    for (const decision of decisions?.decisions || []) {
      if (decision.active === false) continue;
      map.set(sourceIdentityKey(decision.source_identity || {}), decision);
    }
    return map;
  }, [decisions]);

  const activeDecisionCount = activeDecisionsByKey.size;

  const reload = async (preferredId = null) => {
    setLoading(true);
    setError(null);
    try {
      const [queueDoc, coverageDoc, decisionsDoc] = await Promise.all([
        fetch(QUEUE_URL).then((r) => {
          if (!r.ok) throw new Error(`Review queue HTTP ${r.status}`);
          return r.json();
        }),
        fetch(COVERAGE_URL).then((r) => (r.ok ? r.json() : null)),
        fetch(DECISIONS_URL).then((r) => {
          if (!r.ok) throw new Error(`Decisions HTTP ${r.status}`);
          return r.json();
        }),
      ]);
      setQueue(queueDoc);
      setCoverage(coverageDoc);
      setDecisions(decisionsDoc);
      const ids = (queueDoc.items || []).map((item) => item.queue_id);
      if (preferredId && ids.includes(preferredId)) {
        setSelectedId(preferredId);
      } else if (!ids.includes(selectedIdRef.current)) {
        setSelectedId(ids[0] ?? null);
      }
      return { queueDoc, decisionsDoc };
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const items = queue?.items || [];
  const selected = useMemo(
    () => items.find((item) => item.queue_id === selectedId) || null,
    [items, selectedId],
  );
  const selectedActiveDecision = selected
    ? activeDecisionsByKey.get(itemSourceKey(selected)) || null
    : null;

  const prevSelectedIdRef = useRef(null);

  useEffect(() => {
    selectedIdRef.current = selectedId;
    const item = items.find((row) => row.queue_id === selectedId) || null;
    if (!item) {
      setSelectedCandidateId(null);
      setSearchResults([]);
      return;
    }
    const locked = activeDecisionsByKey.get(itemSourceKey(item));
    setSelectedCandidateId(
      locked?.tmdb_id ?? item.proposed_tmdb_id ?? item.candidates?.[0]?.tmdb_id ?? null,
    );
    if (locked?.tmdb_id) {
      setManualTmdbId(String(locked.tmdb_id));
    }
    if (prevSelectedIdRef.current !== selectedId) {
      prevSelectedIdRef.current = selectedId;
      setSearchResults([]);
      setManualSearch(item.normalized_title || item.source_title || '');
    }
  }, [selectedId, items, activeDecisionsByKey]);

  const exportPatch = (decisionPayload) => {
    const blob = new Blob([JSON.stringify({ decisions: [decisionPayload] }, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `tmdb-decision-${decisionPayload.source_identity.source}-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const buildDecision = (actionId) => {
    if (!selected) return null;
    const source_identity = {
      source: selected.source,
      source_film_id: selected.source_film_id,
      showtime_film_key: selected.showtime_film_key,
    };
    if (actionId === 'confirm') {
      const tmdbId = Number(selected.proposed_tmdb_id || selectedCandidateId);
      if (!Number.isInteger(tmdbId) || tmdbId < 1) {
        throw new Error('No proposed TMDB id to confirm');
      }
      return {
        source_identity,
        decision: 'confirm',
        tmdb_id: tmdbId,
        reason: 'manual-review',
      };
    }
    if (actionId === 'confirm_alternate') {
      const tmdbId = Number(selectedCandidateId || manualTmdbId);
      if (!Number.isInteger(tmdbId) || tmdbId < 1) {
        throw new Error('Select or enter a TMDB id');
      }
      return {
        source_identity,
        decision: 'confirm',
        tmdb_id: tmdbId,
        reason: 'manual-review-alternate',
      };
    }
    if (actionId === 'reject_candidate') {
      const tmdbId = Number(selectedCandidateId || selected.proposed_tmdb_id);
      if (!Number.isInteger(tmdbId) || tmdbId < 1) {
        throw new Error('No candidate to reject');
      }
      return {
        source_identity,
        decision: 'reject_candidate',
        tmdb_id: tmdbId,
        reason: 'manual-review',
      };
    }
    return {
      source_identity,
      decision: actionId,
      tmdb_id: null,
      reason: 'manual-review',
    };
  };

  const submitDecision = async (actionId, { exportOnly = false } = {}) => {
    setBusy(true);
    setStatusMessage(null);
    setStatusTone('info');
    try {
      const decisionPayload = buildDecision(actionId);
      if (!decisionPayload) return;

      if (
        selectedActiveDecision &&
        selectedActiveDecision.decision === decisionPayload.decision &&
        selectedActiveDecision.tmdb_id === decisionPayload.tmdb_id
      ) {
        setStatusTone('success');
        setStatusMessage(
          `Already locked in: ${formatDecisionLabel(selectedActiveDecision)}. No new decision written.`,
        );
        return;
      }

      if (exportOnly) {
        exportPatch(decisionPayload);
        setStatusTone('info');
        setStatusMessage('Exported decision patch JSON for scripts/apply_tmdb_match_decisions.py');
        return;
      }
      const response = await fetch('/api/film-identity/decisions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decisions: [decisionPayload] }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || `Write failed HTTP ${response.status}`);
      }

      const label = formatDecisionLabel(decisionPayload);
      await reload(selected?.queue_id ?? null);
      setStatusTone('success');
      setStatusMessage(
        `Locked in: ${label}. This row stays visible until you re-run the matcher; the list marks it as locked.`,
      );
    } catch (err) {
      setStatusTone('error');
      setStatusMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const runManualSearch = async () => {
    setBusy(true);
    setStatusMessage(null);
    setStatusTone('info');
    try {
      // Do not auto-pass year_hint: festival/program years (e.g. 2026) wipe real film matches.
      const query = (manualSearch || selected?.normalized_title || '').trim();
      if (!query) throw new Error('Enter a title to search');
      const params = new URLSearchParams({ query });
      const response = await fetch(`/api/film-identity/tmdb/search?${params}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || `Search HTTP ${response.status}`);
      const results = body.results || [];
      setSearchResults(results);
      setStatusMessage(
        results.length
          ? `TMDB search: ${results.length} result${results.length === 1 ? '' : 's'} for “${query}”.`
          : `TMDB search: no results for “${query}”. Try a shorter title or Validate a known TMDB id.`,
      );
    } catch (err) {
      setSearchResults([]);
      setStatusTone('error');
      setStatusMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const validateManualId = async () => {
    setBusy(true);
    setStatusMessage(null);
    setStatusTone('info');
    try {
      const id = Number(manualTmdbId);
      if (!Number.isInteger(id) || id < 1) throw new Error('Enter a positive TMDB movie id');
      const response = await fetch(`/api/film-identity/tmdb/movie/${id}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || `Lookup HTTP ${response.status}`);
      setSearchResults([
        {
          id: body.id,
          title: body.title,
          original_title: body.original_title,
          release_date: body.release_date,
          overview: body.overview,
          poster_path: body.poster_path,
          runtime: body.runtime,
        },
      ]);
      setSelectedCandidateId(body.id);
      setStatusMessage(`Validated TMDB ${body.id}: ${body.title}`);
    } catch (err) {
      setStatusTone('error');
      setStatusMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const openCount = items.filter((item) => !activeDecisionsByKey.has(itemSourceKey(item))).length;
  const lockedInQueue = items.length - openCount;

  return (
    <section className="cockpit-section" aria-labelledby="film-identity-heading">
      <h2 id="film-identity-heading">Film Identity Review</h2>
      <p className="cockpit-secondary">
        Local-only TMDB identity review (T-FILMID-01). Secrets never reach the browser.
        Workflow: Search TMDB → click a result → <strong>Confirm selected alternate</strong>.
        Validate id is optional. Apply decisions here or export a patch, then rebuild with{' '}
        <code>python scripts/match_tmdb_films.py</code> to refresh the queue.
      </p>

      {loading ? (
        <p className="cockpit-loading" role="status">
          Loading review queue…
        </p>
      ) : null}

      {!loading && error ? (
        <div className="cockpit-error" role="alert">
          <h3>Unable to load film identity artifacts</h3>
          <p>{error}</p>
          <p className="cockpit-secondary">
            Generate with <code>python scripts/match_tmdb_films.py --offline-inventory-only</code>{' '}
            (or a live match run).
          </p>
        </div>
      ) : null}

      {!loading && !error ? (
        <>
          {coverage ? (
            <p className="cockpit-secondary" role="status">
              Coverage: auto {coverage.confirmed_automatic ?? 0} · manual{' '}
              {coverage.confirmed_manual ?? 0} · review {coverage.review_required ?? 0} · unmatched{' '}
              {coverage.unmatched ?? 0} · non-film {coverage.non_film ?? 0} · queue {items.length} (
              {openCount} open · {lockedInQueue} locked in) · active decisions {activeDecisionCount}
            </p>
          ) : null}

          <div className="cockpit-film-identity-layout">
            <div className="cockpit-film-identity-list" role="list">
              {items.length === 0 ? (
                <p>No actionable review items.</p>
              ) : (
                items.map((item) => {
                  const locked = activeDecisionsByKey.get(itemSourceKey(item));
                  const classes = [
                    'cockpit-film-identity-item',
                    item.queue_id === selectedId ? 'is-selected' : '',
                    locked ? 'is-locked' : '',
                  ]
                    .filter(Boolean)
                    .join(' ');
                  return (
                    <button
                      key={item.queue_id}
                      type="button"
                      className={classes}
                      onClick={() => {
                        if (item.queue_id !== selectedId) {
                          setStatusMessage(null);
                          setStatusTone('info');
                        }
                        setSelectedId(item.queue_id);
                      }}
                    >
                      <strong>{item.source_title || item.normalized_title || item.queue_id}</strong>
                      <span>
                        {locked
                          ? `locked · ${formatDecisionLabel(locked)}`
                          : `${item.source} · ${item.match_status}${
                              item.match_confidence != null ? ` · ${item.match_confidence}` : ''
                            }`}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="cockpit-film-identity-detail">
              {selected ? (
                <>
                  <h3>{selected.source_title || selected.normalized_title}</h3>

                  {selectedActiveDecision ? (
                    <div className="cockpit-decision-locked" role="status">
                      <strong>Locked in</strong>
                      <span>{formatDecisionLabel(selectedActiveDecision)}</span>
                      <span className="cockpit-secondary">
                        Authored decision is saved. This row stays in the stale match-run queue until
                        you re-run the matcher. Re-confirming the same match does nothing; choose a
                        different TMDB id or decision to update it.
                      </span>
                    </div>
                  ) : (
                    <p className="cockpit-secondary" role="status">
                      No authored decision yet for this queue item.
                    </p>
                  )}

                  {statusMessage ? (
                    <p
                      className={
                        statusTone === 'success'
                          ? 'cockpit-status is-success'
                          : statusTone === 'error'
                            ? 'cockpit-status is-error'
                            : 'cockpit-status'
                      }
                      role="status"
                    >
                      {statusMessage}
                    </p>
                  ) : null}

                  <dl className="cockpit-kv">
                    <div>
                      <dt>Source</dt>
                      <dd>{selected.source}</dd>
                    </div>
                    <div>
                      <dt>Source film id</dt>
                      <dd>{selected.source_film_id || '—'}</dd>
                    </div>
                    <div>
                      <dt>Showtime film key</dt>
                      <dd>{selected.showtime_film_key || '—'}</dd>
                    </div>
                    <div>
                      <dt>Normalized</dt>
                      <dd>{selected.normalized_title || '—'}</dd>
                    </div>
                    <div>
                      <dt>Entity kind</dt>
                      <dd>{selected.entity_kind || '—'}</dd>
                    </div>
                    <div>
                      <dt>Year / runtime</dt>
                      <dd>
                        scoring {selected.year_hint ?? '—'}
                        {selected.year_interpretation?.event_year != null
                          ? ` · event ${selected.year_interpretation.event_year}`
                          : ''}
                        {selected.year_interpretation?.canonical_year_candidate != null
                          ? ` · canonical ${selected.year_interpretation.canonical_year_candidate}`
                          : ''}
                        {selected.year_interpretation?.anniversary_years != null
                          ? ` · anniv ${selected.year_interpretation.anniversary_years}`
                          : ''}{' '}
                        / {selected.runtime_min ?? '—'}
                      </dd>
                    </div>
                    <div>
                      <dt>Presentation</dt>
                      <dd>
                        {(selected.presentation_labels || []).join(', ') || '—'}
                      </dd>
                    </div>
                    <div>
                      <dt>Fallback film id</dt>
                      <dd>
                        <code>{selected.film_id_fallback}</code>
                      </dd>
                    </div>
                    <div>
                      <dt>Directors</dt>
                      <dd>
                        raw: {selected.directors_raw || '—'}
                        <br />
                        normalized:{' '}
                        {(selected.directors_normalized || []).join(', ') || '—'}
                      </dd>
                    </div>
                    <div>
                      <dt>Margin / blocked</dt>
                      <dd>
                        {selected.top_candidate_margin ?? '—'} /{' '}
                        {selected.auto_confirm_blocked_reason || '—'}
                      </dd>
                    </div>
                    <div>
                      <dt>Warnings</dt>
                      <dd>{(selected.warnings || []).join(', ') || '—'}</dd>
                    </div>
                  </dl>

                  <h4>Candidates from match run</h4>
                  {(selected.candidates || []).length === 0 ? (
                    <p className="cockpit-secondary" role="status">
                      No precomputed TMDB candidates for this title (common for festival/program
                      listings). Use Search TMDB or Validate id below, then Confirm selected
                      alternate — or Mark non-film / Mark unmapped.
                    </p>
                  ) : (
                    <ul className="cockpit-candidate-list">
                      {(selected.candidates || []).map((candidate) => {
                        const active = candidate.tmdb_id === selectedCandidateId;
                        return (
                          <li key={candidate.tmdb_id}>
                            <button
                              type="button"
                              className={active ? 'cockpit-candidate is-selected' : 'cockpit-candidate'}
                              onClick={() => setSelectedCandidateId(candidate.tmdb_id)}
                            >
                              {posterUrl(candidate.poster_path) ? (
                                <img
                                  src={posterUrl(candidate.poster_path)}
                                  alt=""
                                  width="46"
                                  height="69"
                                />
                              ) : null}
                              <span>
                                <strong>
                                  {candidate.title} ({candidate.release_year ?? '?'})
                                </strong>
                                <br />
                                TMDB {candidate.tmdb_id} · score {candidate.score}
                                {candidate.original_title ? (
                                  <>
                                    <br />
                                    Original: {candidate.original_title}
                                  </>
                                ) : null}
                                {candidate.overview_excerpt ? (
                                  <>
                                    <br />
                                    {candidate.overview_excerpt}
                                  </>
                                ) : null}
                                <br />
                                Signals: {JSON.stringify(candidate.signals || {})}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  <div className="cockpit-film-identity-tools">
                    <label>
                      Manual TMDB search
                      <input
                        value={manualSearch}
                        onChange={(event) => setManualSearch(event.target.value)}
                        placeholder={selected.normalized_title || 'Title'}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            runManualSearch();
                          }
                        }}
                      />
                    </label>
                    <button type="button" onClick={runManualSearch} disabled={busy}>
                      Search TMDB
                    </button>
                    <label>
                      TMDB id
                      <input
                        value={manualTmdbId}
                        onChange={(event) => setManualTmdbId(event.target.value)}
                        inputMode="numeric"
                      />
                    </label>
                    <button type="button" onClick={validateManualId} disabled={busy}>
                      Validate id
                    </button>
                  </div>

                  {searchResults.length ? (
                    <ul className="cockpit-candidate-list">
                      {searchResults.map((row) => (
                        <li key={row.id}>
                          <button
                            type="button"
                            className={
                              row.id === selectedCandidateId
                                ? 'cockpit-candidate is-selected'
                                : 'cockpit-candidate'
                            }
                            onClick={() => {
                              setSelectedCandidateId(row.id);
                              setManualTmdbId(String(row.id));
                            }}
                          >
                            {posterUrl(row.poster_path) ? (
                              <img
                                src={posterUrl(row.poster_path)}
                                alt=""
                                width="46"
                                height="69"
                              />
                            ) : null}
                            <span>
                              <strong>
                                {row.title} ({String(row.release_date || '').slice(0, 4) || '?'})
                              </strong>
                              <br />
                              TMDB {row.id}
                              {row.overview ? (
                                <>
                                  <br />
                                  {String(row.overview).slice(0, 180)}
                                  {String(row.overview).length > 180 ? '…' : ''}
                                </>
                              ) : null}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <div className="cockpit-film-identity-actions">
                    {ACTIONS.map((action) => (
                      <button
                        key={action.id}
                        type="button"
                        disabled={busy}
                        onClick={() => submitDecision(action.id)}
                      >
                        {action.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={busy || !selected}
                      onClick={() => submitDecision('confirm_alternate', { exportOnly: true })}
                    >
                      Export patch JSON
                    </button>
                  </div>
                </>
              ) : (
                <p>Select a queue item.</p>
              )}
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
