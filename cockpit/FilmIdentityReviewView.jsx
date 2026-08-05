/**
 * Film Identity Review — unmatched/ambiguous diagnostics cockpit.
 * Secrets stay on the local server; browser never sees TMDB tokens.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  REVIEW_MODES,
  SORT_OPTIONS,
  buildDecisionPayload,
  candidateRoleLabel,
  copyTmdbRequestText,
  filterReviewRecords,
  formatTitleTransform,
  sortReviewRecords,
} from './filmIdentityReviewFormat.js';

const DECISIONS_URL = '/data/film_identity/tmdb_match_decisions.json';
const COVERAGE_URL = '/data/audits/tmdb_film_identity_coverage.json';

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
  const [pack, setPack] = useState(null);
  const [coverage, setCoverage] = useState(null);
  const [decisions, setDecisions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [explain, setExplain] = useState(null);
  const [explainBusy, setExplainBusy] = useState(false);
  const [explainError, setExplainError] = useState(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);
  const [statusTone, setStatusTone] = useState('info');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState('unmatched');
  const [sortId, setSortId] = useState('impact');
  const [filters, setFilters] = useState({
    source: '',
    venue: '',
    matchStatus: '',
    missingYear: false,
    missingRuntime: false,
    hasQualifier: false,
    likelyNonFilm: false,
  });
  const [panel, setPanel] = useState('diagnostics'); // diagnostics | bulk | reference
  const [notesDraft, setNotesDraft] = useState('');
  const [categoryDraft, setCategoryDraft] = useState('unknown');
  const [expTitle, setExpTitle] = useState('');
  const [expYear, setExpYear] = useState('');
  const [expRuntime, setExpRuntime] = useState('');
  const [expIncludeYear, setExpIncludeYear] = useState(true);
  const [expResult, setExpResult] = useState(null);
  const [ruleProposal, setRuleProposal] = useState(null);
  const selectedIdRef = useRef(null);

  const activeDecisionsByKey = useMemo(() => {
    const map = new Map();
    for (const decision of decisions?.decisions || []) {
      if (decision.active === false) continue;
      map.set(sourceIdentityKey(decision.source_identity || {}), decision);
    }
    return map;
  }, [decisions]);

  const reloadPack = async (preferredId = null) => {
    setLoading(true);
    setError(null);
    try {
      const [packRes, coverageDoc, decisionsDoc] = await Promise.all([
        fetch('/api/film-identity/review-pack', { method: 'POST' }).then(async (r) => {
          const body = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(body.error || `Review pack HTTP ${r.status}`);
          return body;
        }),
        fetch(COVERAGE_URL).then((r) => (r.ok ? r.json() : null)),
        fetch(DECISIONS_URL).then((r) => {
          if (!r.ok) throw new Error(`Decisions HTTP ${r.status}`);
          return r.json();
        }),
      ]);
      const nextPack = packRes.pack || packRes;
      setPack(nextPack);
      setCoverage(coverageDoc);
      setDecisions(decisionsDoc);
      const ids = (nextPack.records || []).map((row) => row.record_id);
      if (preferredId && ids.includes(preferredId)) {
        setSelectedId(preferredId);
      } else if (!ids.includes(selectedIdRef.current)) {
        const filtered = sortReviewRecords(
          filterReviewRecords(nextPack.records || [], { mode: 'unmatched' }),
          'impact',
        );
        setSelectedId(filtered[0]?.record_id ?? ids[0] ?? null);
      }
      return nextPack;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reloadPack();
  }, []);

  const filtered = useMemo(() => {
    const rows = filterReviewRecords(pack?.records || [], { ...filters, mode });
    return sortReviewRecords(rows, sortId);
  }, [pack, filters, mode, sortId]);

  const selected = useMemo(
    () => (pack?.records || []).find((row) => row.record_id === selectedId) || null,
    [pack, selectedId],
  );

  const selectedActiveDecision = selected
    ? activeDecisionsByKey.get(
        sourceIdentityKey({
          source: selected.source?.source_name,
          source_film_id: selected.source?.source_film_id,
          showtime_film_key: selected.source?.showtime_film_key,
        }),
      ) ||
      selected.decision ||
      null
    : null;

  useEffect(() => {
    selectedIdRef.current = selectedId;
    if (!selected) {
      setExplain(null);
      setExpResult(null);
      return;
    }
    setNotesDraft(selected.reviewer_notes || '');
    setCategoryDraft(selected.diagnostic_category || 'unknown');
    setExpTitle(selected.source?.normalized_search_title || selected.source?.original_source_title || '');
    setExpYear(
      selected.source?.source_release_year != null
        ? String(selected.source.source_release_year)
        : '',
    );
    setExpRuntime(
      selected.source?.source_runtime != null ? String(selected.source.source_runtime) : '',
    );
    setExpIncludeYear(true);
    setExpResult(null);
    setRuleProposal(null);
    setSelectedCandidateId(null);
    setExplainError(null);

    let cancelled = false;
    const run = async () => {
      setExplainBusy(true);
      try {
        const response = await fetch('/api/film-identity/explain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source_title: selected.source?.original_source_title,
            runtime_min: selected.source?.source_runtime ?? null,
            year: selected.source?.source_release_year ?? null,
            directors_raw: null,
          }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || `Explain HTTP ${response.status}`);
        if (cancelled) return;
        setExplain(body);
        setSelectedCandidateId(
          body.winning_candidate?.tmdb_id || body.candidates?.[0]?.tmdb_id || null,
        );
      } catch (err) {
        if (cancelled) return;
        setExplain(null);
        setExplainError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setExplainBusy(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps -- reload diagnostics when selection changes

  const transform = formatTitleTransform(
    explain?.title_transform || selected?.source?.title_transform,
  );

  const submitDecision = async (actionId, { exportOnly = false } = {}) => {
    setBusy(true);
    setStatusMessage(null);
    setStatusTone('info');
    try {
      const decisionPayload = buildDecisionPayload(selected, actionId, selectedCandidateId);
      if (exportOnly) {
        const blob = new Blob([JSON.stringify({ decisions: [decisionPayload] }, null, 2)], {
          type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `tmdb-decision-${decisionPayload.source_identity.source}-${Date.now()}.json`;
        anchor.click();
        URL.revokeObjectURL(url);
        setStatusMessage('Exported decision patch JSON (not applied).');
        return;
      }
      const response = await fetch('/api/film-identity/decisions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decisions: [decisionPayload] }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Write failed HTTP ${response.status}`);
      await reloadPack(selected?.record_id ?? null);
      setStatusTone('success');
      setStatusMessage(`Locked in: ${formatDecisionLabel(decisionPayload)}`);
    } catch (err) {
      setStatusTone('error');
      setStatusMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const saveNotes = async () => {
    if (!selected) return;
    setBusy(true);
    setStatusMessage(null);
    try {
      const response = await fetch('/api/film-identity/review-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          record_id: selected.record_id,
          notes: notesDraft,
          diagnostic_category: categoryDraft,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Notes HTTP ${response.status}`);
      await reloadPack(selected.record_id);
      setStatusTone('success');
      setStatusMessage('Review notes saved locally (data/film_identity/review_notes.json).');
    } catch (err) {
      setStatusTone('error');
      setStatusMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const runExperimental = async ({ compare = false } = {}) => {
    if (!selected) return;
    setBusy(true);
    setStatusMessage(null);
    try {
      const body = {
        source_title: selected.source?.original_source_title,
        search_title: expTitle,
        year: expYear === '' ? null : Number(expYear),
        runtime_min: expRuntime === '' ? null : Number(expRuntime),
        include_year: expIncludeYear,
      };
      const response = await fetch('/api/film-identity/experimental-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `Experimental HTTP ${response.status}`);
      setExpResult(payload);
      setStatusTone('info');
      setStatusMessage(
        compare
          ? `Experimental vs pipeline search “${payload.pipeline_search_title}”. Decisions were NOT saved.`
          : 'Experimental search complete. Decisions were NOT saved.',
      );
    } catch (err) {
      setStatusTone('error');
      setStatusMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const resetExperimental = () => {
    if (!selected) return;
    setExpTitle(selected.source?.normalized_search_title || selected.source?.original_source_title || '');
    setExpYear(
      selected.source?.source_release_year != null
        ? String(selected.source.source_release_year)
        : '',
    );
    setExpRuntime(
      selected.source?.source_runtime != null ? String(selected.source.source_runtime) : '',
    );
    setExpIncludeYear(true);
    setExpResult(null);
  };

  const proposeRule = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const response = await fetch('/api/film-identity/propose-normalization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          original_title: selected.source?.original_source_title,
          proposed_base_title:
            selected.source?.normalized_search_title || selected.source?.extracted_parent_title,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Propose HTTP ${response.status}`);
      setRuleProposal(body.proposal);
      setStatusTone('info');
      setStatusMessage(
        'Normalization proposal only — production normalization code was not modified.',
      );
    } catch (err) {
      setStatusTone('error');
      setStatusMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const exportReport = async () => {
    setBusy(true);
    try {
      const response = await fetch('/api/film-identity/export-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pack,
          explains: selectedId && explain ? { [selectedId]: explain } : {},
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Export HTTP ${response.status}`);
      setStatusTone('success');
      setStatusMessage(`Exported ${body.json_path} + ${body.csv_path} (left unstaged).`);
    } catch (err) {
      setStatusTone('error');
      setStatusMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const copyRequest = async (request) => {
    const text = copyTmdbRequestText(request);
    try {
      await navigator.clipboard.writeText(text);
      setStatusMessage('Copied logical TMDB request (no secrets).');
      setStatusTone('success');
    } catch {
      setStatusMessage(text);
      setStatusTone('info');
    }
  };

  const renderCandidates = (candidates) => {
    if (!candidates?.length) {
      return <p className="cockpit-secondary">No candidates retained.</p>;
    }
    return (
      <ul className="cockpit-candidate-list">
        {candidates.map((candidate) => {
          const active = candidate.tmdb_id === selectedCandidateId;
          return (
            <li key={`${candidate.tmdb_id}-${candidate.result_order || ''}`}>
              <button
                type="button"
                className={active ? 'cockpit-candidate is-selected' : 'cockpit-candidate'}
                onClick={() => setSelectedCandidateId(candidate.tmdb_id)}
              >
                {posterUrl(candidate.poster_path) ? (
                  <img src={posterUrl(candidate.poster_path)} alt="" width="46" height="69" />
                ) : null}
                <span>
                  <strong>
                    {candidate.title} ({candidate.release_year ?? '?'})
                  </strong>
                  <br />
                  <span className="cockpit-pill">{candidateRoleLabel(candidate.role)}</span>
                  {candidate.detail_enriched ? (
                    <span className="cockpit-pill">detail lookup</span>
                  ) : (
                    <span className="cockpit-pill">search result</span>
                  )}
                  <br />
                  TMDB {candidate.tmdb_id} · score {candidate.score}
                  {candidate.original_title ? (
                    <>
                      <br />
                      Original: {candidate.original_title}
                    </>
                  ) : null}
                  {candidate.runtime_min != null ? (
                    <>
                      <br />
                      Runtime: {candidate.runtime_min}m
                    </>
                  ) : null}
                  {candidate.popularity != null ? <> · pop {candidate.popularity}</> : null}
                  {candidate.vote_count != null ? <> · votes {candidate.vote_count}</> : null}
                  {candidate.adult ? <> · adult</> : null}
                  {candidate.overview_excerpt ? (
                    <>
                      <br />
                      {candidate.overview_excerpt}
                    </>
                  ) : null}
                  <br />
                  <a
                    href={candidate.tmdb_url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(event) => event.stopPropagation()}
                  >
                    Open TMDB
                  </a>
                  <details className="cockpit-score-details">
                    <summary>Score breakdown</summary>
                    <ul>
                      {(candidate.score_factors || []).map((factor) => (
                        <li key={`${candidate.tmdb_id}-${factor.factor}`}>
                          <code>{factor.factor}</code>
                          {factor.weight != null ? ` weight=${factor.weight}` : ''}
                          {factor.matched != null ? ` matched=${String(factor.matched)}` : ''}
                          {factor.kind ? ` (${factor.kind})` : ''}
                          {factor.value !== undefined ? ` = ${JSON.stringify(factor.value)}` : ''}
                        </li>
                      ))}
                    </ul>
                    <p>
                      AUTO_CONFIRM {candidate.auto_confirm_threshold} (Δ{' '}
                      {candidate.distance_to_auto_confirm}) · REVIEW{' '}
                      {candidate.review_threshold} (Δ {candidate.distance_to_review})
                    </p>
                  </details>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    );
  };

  const unresolvedCount = (pack?.counts?.unmatched || 0) + (pack?.counts?.ambiguous || 0);

  return (
    <section className="cockpit-section" aria-labelledby="film-identity-heading">
      <h2 id="film-identity-heading">Film Identity Review</h2>
      <p className="cockpit-secondary">
        Evidence-first unmatched / ambiguous diagnostics. TMDB tokens never enter the browser.
        Matching rules are not changed from this surface — only decisions, notes, and proposals.
      </p>

      {loading ? (
        <p className="cockpit-loading" role="status">
          Building review pack…
        </p>
      ) : null}

      {!loading && error ? (
        <div className="cockpit-error" role="alert">
          <h3>Unable to load review diagnostics</h3>
          <p>{error}</p>
        </div>
      ) : null}

      {!loading && !error && pack ? (
        <>
          <p className="cockpit-secondary" role="status">
            Reviewable {pack.counts?.records ?? 0} · unmatched {pack.counts?.unmatched ?? 0} ·
            ambiguous {pack.counts?.ambiguous ?? 0} · source-only {pack.counts?.source_only ?? 0} ·
            thin enrichment {pack.counts?.thin_enrichment ?? 0}
            {coverage
              ? ` · catalog auto ${coverage.confirmed_automatic ?? 0} / manual ${coverage.confirmed_manual ?? 0}`
              : ''}
            {` · unresolved focus ~${unresolvedCount}`}
          </p>

          <div className="cockpit-film-identity-toolbar">
            <label>
              Mode
              <select value={mode} onChange={(e) => setMode(e.target.value)}>
                {REVIEW_MODES.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Sort
              <select value={sortId} onChange={(e) => setSortId(e.target.value)}>
                {SORT_OPTIONS.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Source
              <input
                value={filters.source}
                onChange={(e) => setFilters((f) => ({ ...f, source: e.target.value }))}
                placeholder="amc, siiff…"
              />
            </label>
            <label>
              Venue
              <input
                value={filters.venue}
                onChange={(e) => setFilters((f) => ({ ...f, venue: e.target.value }))}
              />
            </label>
            <label>
              Match status
              <input
                value={filters.matchStatus}
                onChange={(e) => setFilters((f) => ({ ...f, matchStatus: e.target.value }))}
                placeholder="unmatched"
              />
            </label>
            <label className="cockpit-check">
              <input
                type="checkbox"
                checked={filters.missingYear}
                onChange={(e) => setFilters((f) => ({ ...f, missingYear: e.target.checked }))}
              />
              Missing year
            </label>
            <label className="cockpit-check">
              <input
                type="checkbox"
                checked={filters.missingRuntime}
                onChange={(e) => setFilters((f) => ({ ...f, missingRuntime: e.target.checked }))}
              />
              Missing runtime
            </label>
            <label className="cockpit-check">
              <input
                type="checkbox"
                checked={filters.hasQualifier}
                onChange={(e) => setFilters((f) => ({ ...f, hasQualifier: e.target.checked }))}
              />
              Screening qualifier
            </label>
            <label className="cockpit-check">
              <input
                type="checkbox"
                checked={filters.likelyNonFilm}
                onChange={(e) => setFilters((f) => ({ ...f, likelyNonFilm: e.target.checked }))}
              />
              Likely non-film
            </label>
            <button type="button" onClick={() => setPanel('diagnostics')}>
              Film diagnostics
            </button>
            <button type="button" onClick={() => setPanel('bulk')}>
              Bulk patterns
            </button>
            <button type="button" onClick={() => setPanel('reference')}>
              Reference cases
            </button>
            <button type="button" disabled={busy} onClick={exportReport}>
              Export review report
            </button>
          </div>

          {panel === 'bulk' ? (
            <div className="cockpit-bulk-patterns">
              <h3>Bulk diagnosis</h3>
              {(pack.bulk_patterns || []).length === 0 ? (
                <p>No clusters yet.</p>
              ) : (
                <ul>
                  {(pack.bulk_patterns || []).map((cluster) => (
                    <li key={cluster.cluster_id}>
                      <strong>{cluster.label}</strong>
                      <div>
                        {cluster.film_count} films · {cluster.showtime_count} showtimes · risk{' '}
                        {cluster.general_rule_risk}
                      </div>
                      <div className="cockpit-secondary">
                        Examples: {(cluster.example_titles || []).join(' · ')}
                      </div>
                      <div>{cluster.likely_remediation}</div>
                      <button
                        type="button"
                        onClick={() => {
                          setPanel('diagnostics');
                          if (cluster.record_ids?.[0]) setSelectedId(cluster.record_ids[0]);
                        }}
                      >
                        Open first example
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {panel === 'reference' ? (
            <div className="cockpit-reference-cases">
              <h3>Reference explanations</h3>
              {(pack.reference_cases || []).map((row) => (
                <article key={row.case_id} className="cockpit-reference-card">
                  <h4>
                    {row.title}{' '}
                    <span className="cockpit-pill">{row.kind}</span>
                  </h4>
                  <p>{row.summary}</p>
                  <pre>{JSON.stringify(row.original_source_evidence, null, 2)}</pre>
                  {row.selected_tmdb_id ? (
                    <p>
                      Selected TMDB{' '}
                      <a href={row.tmdb_url} target="_blank" rel="noreferrer">
                        {row.selected_tmdb_id}
                      </a>
                    </p>
                  ) : null}
                  {row.durable_decision ? (
                    <pre>{JSON.stringify(row.durable_decision, null, 2)}</pre>
                  ) : null}
                </article>
              ))}
            </div>
          ) : null}

          {panel === 'diagnostics' ? (
            <div className="cockpit-film-identity-layout">
              <div className="cockpit-film-identity-list" role="list">
                {filtered.length === 0 ? (
                  <p>No films in this mode/filter.</p>
                ) : (
                  filtered.map((item) => {
                    const locked = activeDecisionsByKey.get(
                      sourceIdentityKey({
                        source: item.source?.source_name,
                        source_film_id: item.source?.source_film_id,
                        showtime_film_key: item.source?.showtime_film_key,
                      }),
                    );
                    const classes = [
                      'cockpit-film-identity-item',
                      item.record_id === selectedId ? 'is-selected' : '',
                      locked ? 'is-locked' : '',
                    ]
                      .filter(Boolean)
                      .join(' ');
                    return (
                      <button
                        key={item.record_id}
                        type="button"
                        className={classes}
                        onClick={() => {
                          setStatusMessage(null);
                          setSelectedId(item.record_id);
                        }}
                      >
                        <strong>
                          {item.source?.original_source_title || item.record_id}
                        </strong>
                        <span>
                          {item.source?.showtime_count ?? 0} showtimes ·{' '}
                          {item.source?.venue_count ?? 0} venues · {item.diagnostic_category}
                          {locked ? ` · locked ${formatDecisionLabel(locked)}` : ''}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>

              <div className="cockpit-film-identity-detail">
                {selected ? (
                  <>
                    <h3>{selected.source?.original_source_title}</h3>
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

                    {selectedActiveDecision ? (
                      <div className="cockpit-decision-locked" role="status">
                        <strong>Authored decision</strong>
                        <span>{formatDecisionLabel(selectedActiveDecision)}</span>
                      </div>
                    ) : null}

                    <h4>Source-input diagnostics</h4>
                    <div className="cockpit-title-transform" role="status">
                      <div>
                        <span className="cockpit-muted">Original</span>
                        <div>{transform.original || '—'}</div>
                      </div>
                      <div className="cockpit-arrow">→</div>
                      <div>
                        <span className="cockpit-muted">Normalized search</span>
                        <div>{transform.normalized || '—'}</div>
                      </div>
                    </div>
                    {transform.removed?.length ? (
                      <p>
                        Removed / transformed:{' '}
                        {transform.removed.map((seg) => (
                          <code key={seg} className="cockpit-removed-seg">
                            {seg}
                          </code>
                        ))}
                      </p>
                    ) : null}
                    <dl className="cockpit-kv">
                      <div>
                        <dt>Source</dt>
                        <dd>{selected.source?.source_name}</dd>
                      </div>
                      <div>
                        <dt>Source film / event key</dt>
                        <dd>
                          {selected.source?.source_film_id || '—'} /{' '}
                          <code>{selected.source?.showtime_film_key}</code>
                        </dd>
                      </div>
                      <div>
                        <dt>Presentation title</dt>
                        <dd>{selected.source?.presentation_title || '—'}</dd>
                      </div>
                      <div>
                        <dt>Parent / extracted</dt>
                        <dd>
                          {selected.source?.parent_display_title || '—'} /{' '}
                          {selected.source?.extracted_parent_title || '—'}
                        </dd>
                      </div>
                      <div>
                        <dt>Screening qualifier</dt>
                        <dd>{selected.source?.screening_variant_type || '—'}</dd>
                      </div>
                      <div>
                        <dt>Year / runtime</dt>
                        <dd>
                          {selected.source?.source_release_year ?? '—'} /{' '}
                          {selected.source?.source_runtime ?? '—'}
                        </dd>
                      </div>
                      <div>
                        <dt>Venues / showtimes</dt>
                        <dd>
                          {(selected.source?.venues || []).join(', ') || '—'} (
                          {selected.source?.showtime_count ?? 0})
                        </dd>
                      </div>
                      <div>
                        <dt>Poster</dt>
                        <dd>
                          {selected.source?.source_poster_url ? (
                            <img
                              src={selected.source.source_poster_url}
                              alt=""
                              width="46"
                              height="69"
                            />
                          ) : (
                            '—'
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>URLs</dt>
                        <dd>{(selected.source?.source_urls || []).join(' · ') || '—'}</dd>
                      </div>
                      <div>
                        <dt>Canonical / status</dt>
                        <dd>
                          {selected.source?.canonical_key || '—'} / {selected.source?.match_status}
                        </dd>
                      </div>
                      <div>
                        <dt>Eligibility</dt>
                        <dd>
                          {selected.eligibility?.status} · {selected.eligibility?.entity_kind}
                          <br />
                          {(selected.eligibility?.reasons || []).join(', ') || '—'}
                        </dd>
                      </div>
                    </dl>

                    <h4>TMDB request diagnostics</h4>
                    {explainBusy ? <p className="cockpit-loading">Loading live explain…</p> : null}
                    {explainError ? (
                      <p className="cockpit-status is-error">{explainError}</p>
                    ) : null}
                    {explain?.tmdb_request ? (
                      <>
                        <dl className="cockpit-kv">
                          <div>
                            <dt>Endpoint</dt>
                            <dd>{explain.tmdb_request.endpoint}</dd>
                          </div>
                          <div>
                            <dt>Query</dt>
                            <dd>{explain.tmdb_request.query}</dd>
                          </div>
                          <div>
                            <dt>Year param</dt>
                            <dd>
                              {explain.tmdb_request.year ?? '—'} (include=
                              {String(explain.tmdb_request.include_year_parameter)})
                            </dd>
                          </div>
                          <div>
                            <dt>Language / region / page</dt>
                            <dd>
                              {explain.tmdb_request.language} /{' '}
                              {explain.tmdb_request.region ?? '—'} / {explain.tmdb_request.page}
                            </dd>
                          </div>
                          <div>
                            <dt>Cache / alt titles</dt>
                            <dd>
                              {String(explain.tmdb_request.from_cache)} /{' '}
                              {String(explain.tmdb_request.alternate_title_lookup)}
                            </dd>
                          </div>
                          <div>
                            <dt>Status</dt>
                            <dd>{explain.request_status || explain.tmdb_request.status}</dd>
                          </div>
                          <div>
                            <dt>Detail follow-ups</dt>
                            <dd>
                              {(explain.tmdb_request.follow_up_detail_requests || [])
                                .map((r) => r.endpoint)
                                .join(', ') || '—'}
                            </dd>
                          </div>
                        </dl>
                        <button type="button" onClick={() => copyRequest(explain.tmdb_request)}>
                          Copy query/details
                        </button>
                      </>
                    ) : null}

                    <h4>Outcome</h4>
                    <p className="cockpit-plain-reason">
                      {explain?.plain_language_reason ||
                        'Open explain to generate a plain-language reason.'}
                    </p>
                    <p>
                      Category: <code>{selected.diagnostic_category}</code>
                      {explain?.diagnostic_category
                        ? ` (live suggest: ${explain.diagnostic_category})`
                        : ''}
                    </p>
                    {explain ? (
                      <p className="cockpit-secondary">
                        Bucket {explain.bucket} · margin {explain.first_second_margin ?? '—'} ·
                        auto Δ {explain.thresholds?.distance_to_auto_confirm ?? '—'} · review Δ{' '}
                        {explain.thresholds?.distance_to_review ?? '—'}
                      </p>
                    ) : null}

                    <h4>TMDB candidates (top 10 retained)</h4>
                    {renderCandidates(explain?.candidates)}

                    <h4>Failure classification & notes</h4>
                    <div className="cockpit-film-identity-tools">
                      <label>
                        Diagnostic category
                        <select
                          value={categoryDraft}
                          onChange={(e) => setCategoryDraft(e.target.value)}
                        >
                          {(pack.diagnostic_categories || []).map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="cockpit-notes-label">
                        Reviewer notes
                        <textarea
                          value={notesDraft}
                          onChange={(e) => setNotesDraft(e.target.value)}
                          rows={3}
                          placeholder="e.g. Remove festival prefix before matching."
                        />
                      </label>
                      <button type="button" disabled={busy} onClick={saveNotes}>
                        Save notes (local artifact)
                      </button>
                    </div>

                    <h4>Experimental search (does not save decisions)</h4>
                    <div className="cockpit-film-identity-tools">
                      <label>
                        Search title
                        <input value={expTitle} onChange={(e) => setExpTitle(e.target.value)} />
                      </label>
                      <label>
                        Year
                        <input value={expYear} onChange={(e) => setExpYear(e.target.value)} />
                      </label>
                      <label>
                        Runtime
                        <input
                          value={expRuntime}
                          onChange={(e) => setExpRuntime(e.target.value)}
                        />
                      </label>
                      <label className="cockpit-check">
                        <input
                          type="checkbox"
                          checked={expIncludeYear}
                          onChange={(e) => setExpIncludeYear(e.target.checked)}
                        />
                        Include year parameter
                      </label>
                      <button type="button" disabled={busy} onClick={() => runExperimental()}>
                        Run test search
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => runExperimental({ compare: true })}
                      >
                        Compare with pipeline search
                      </button>
                      <button type="button" onClick={resetExperimental}>
                        Reset
                      </button>
                    </div>
                    {expResult ? (
                      <div className="cockpit-experimental-result">
                        <p className="cockpit-secondary">
                          Experimental={String(expResult.experimental)} · persists_decision=
                          {String(expResult.persists_decision)} · pipeline title “
                          {expResult.pipeline_search_title}”
                        </p>
                        <p>{expResult.plain_language_reason}</p>
                        {renderCandidates(expResult.candidates)}
                      </div>
                    ) : null}

                    <h4>Review actions</h4>
                    <div className="cockpit-film-identity-actions">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => submitDecision('confirm_selected')}
                      >
                        Confirm selected TMDB candidate
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => submitDecision('unmapped')}
                      >
                        Keep unmatched
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => submitDecision('non_film')}
                      >
                        Mark as non-film event
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => submitDecision('program_block')}
                      >
                        Mark as program/festival block
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => submitDecision('defer')}
                      >
                        Preserve / defer (distinct cut)
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => submitDecision('confirm_selected', { exportOnly: true })}
                      >
                        Export decision patch
                      </button>
                      <button type="button" disabled={busy} onClick={proposeRule}>
                        Add normalization-rule suggestion
                      </button>
                    </div>
                    {ruleProposal ? (
                      <div className="cockpit-rule-proposal">
                        <p>
                          <strong>General normalization proposal</strong> (not applied to
                          production code)
                        </p>
                        <pre>{JSON.stringify(ruleProposal, null, 2)}</pre>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p>Select a film.</p>
                )}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
