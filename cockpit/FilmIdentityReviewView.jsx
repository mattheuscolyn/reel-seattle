/**
 * Film Identity Review — local-only cockpit surface (T-FILMID-01).
 * Reads allowlisted artifacts; writes decisions via localhost API or patch export.
 */
import { useEffect, useMemo, useState } from 'react';

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
  const [busy, setBusy] = useState(false);

  const reload = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(QUEUE_URL).then((r) => {
        if (!r.ok) throw new Error(`Review queue HTTP ${r.status}`);
        return r.json();
      }),
      fetch(COVERAGE_URL).then((r) => (r.ok ? r.json() : null)),
      fetch(DECISIONS_URL).then((r) => {
        if (!r.ok) throw new Error(`Decisions HTTP ${r.status}`);
        return r.json();
      }),
    ])
      .then(([queueDoc, coverageDoc, decisionsDoc]) => {
        setQueue(queueDoc);
        setCoverage(coverageDoc);
        setDecisions(decisionsDoc);
        const first = (queueDoc.items || [])[0];
        setSelectedId(first?.queue_id ?? null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reload();
  }, []);

  const items = queue?.items || [];
  const selected = useMemo(
    () => items.find((item) => item.queue_id === selectedId) || null,
    [items, selectedId],
  );

  useEffect(() => {
    if (!selected) {
      setSelectedCandidateId(null);
      return;
    }
    setSelectedCandidateId(selected.proposed_tmdb_id ?? selected.candidates?.[0]?.tmdb_id ?? null);
  }, [selected]);

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
    try {
      const decisionPayload = buildDecision(actionId);
      if (!decisionPayload) return;
      if (exportOnly) {
        exportPatch(decisionPayload);
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
      setStatusMessage(`Saved decision (${decisionPayload.decision}). Re-run matcher to refresh queue.`);
      reload();
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const runManualSearch = async () => {
    setBusy(true);
    setStatusMessage(null);
    try {
      const params = new URLSearchParams({ query: manualSearch || selected?.normalized_title || '' });
      if (selected?.year_hint) params.set('year', String(selected.year_hint));
      const response = await fetch(`/api/film-identity/tmdb/search?${params}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || `Search HTTP ${response.status}`);
      setSearchResults(body.results || []);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const validateManualId = async () => {
    setBusy(true);
    setStatusMessage(null);
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
      setStatusMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="cockpit-section" aria-labelledby="film-identity-heading">
      <h2 id="film-identity-heading">Film Identity Review</h2>
      <p className="cockpit-secondary">
        Local-only TMDB identity review (T-FILMID-01). Secrets never reach the browser.
        Apply decisions here or export a patch for{' '}
        <code>python scripts/apply_tmdb_match_decisions.py</code>, then rebuild with{' '}
        <code>python scripts/match_tmdb_films.py</code>.
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
              {coverage.unmatched ?? 0} · non-film {coverage.non_film ?? 0} · queue{' '}
              {items.length}
              {decisions ? ` · authored decisions ${decisions.decisions?.length ?? 0}` : ''}
            </p>
          ) : null}

          <div className="cockpit-film-identity-layout">
            <div className="cockpit-film-identity-list" role="list">
              {items.length === 0 ? (
                <p>No actionable review items.</p>
              ) : (
                items.map((item) => (
                  <button
                    key={item.queue_id}
                    type="button"
                    className={
                      item.queue_id === selectedId
                        ? 'cockpit-film-identity-item is-selected'
                        : 'cockpit-film-identity-item'
                    }
                    onClick={() => setSelectedId(item.queue_id)}
                  >
                    <strong>{item.source_title || item.normalized_title || item.queue_id}</strong>
                    <span>
                      {item.source} · {item.match_status}
                      {item.match_confidence != null ? ` · ${item.match_confidence}` : ''}
                    </span>
                  </button>
                ))
              )}
            </div>

            <div className="cockpit-film-identity-detail">
              {selected ? (
                <>
                  <h3>{selected.source_title || selected.normalized_title}</h3>
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
                      <dt>Year / runtime</dt>
                      <dd>
                        {selected.year_hint ?? '—'} / {selected.runtime_min ?? '—'}
                      </dd>
                    </div>
                    <div>
                      <dt>Fallback film id</dt>
                      <dd>
                        <code>{selected.film_id_fallback}</code>
                      </dd>
                    </div>
                    <div>
                      <dt>Warnings</dt>
                      <dd>{(selected.warnings || []).join(', ') || '—'}</dd>
                    </div>
                  </dl>

                  <h4>Candidates</h4>
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

                  <div className="cockpit-film-identity-tools">
                    <label>
                      Manual TMDB search
                      <input
                        value={manualSearch}
                        onChange={(event) => setManualSearch(event.target.value)}
                        placeholder={selected.normalized_title || 'Title'}
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
                            className="cockpit-candidate"
                            onClick={() => {
                              setSelectedCandidateId(row.id);
                              setManualTmdbId(String(row.id));
                            }}
                          >
                            <strong>
                              {row.title} ({String(row.release_date || '').slice(0, 4) || '?'})
                            </strong>{' '}
                            · TMDB {row.id}
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

          {statusMessage ? (
            <p className="cockpit-secondary" role="status">
              {statusMessage}
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
