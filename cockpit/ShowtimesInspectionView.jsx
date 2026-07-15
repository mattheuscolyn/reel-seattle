import { useEffect, useState } from 'react';
import { formatMissingScalar, formatTimestamp } from './pipelineHealthFormat.js';
import { loadPipelineReportOnce } from './pipelineReportLoader.js';
import {
  hasShowtimesCurrentCache,
  loadShowtimesCurrentOnce,
  SHOWTIMES_CURRENT_REPO_PATH,
  SHOWTIMES_CURRENT_URL,
} from './showtimesCurrentLoader.js';
import {
  buildShowtimeInspectionResult,
  buildTheaterSelectOptions,
  defaultInspectionDate,
} from './showtimesInspectionFormat.js';
import { loadTheaterRegistryOnce } from './theaterRegistryLoader.js';

/**
 * Read-only showtime inspection by theater + date.
 * Does not fetch showtimes_current until the user presses Load/Apply.
 */
export default function ShowtimesInspectionView() {
  const [registry, setRegistry] = useState(null);
  const [registryError, setRegistryError] = useState(null);
  const [registryLoading, setRegistryLoading] = useState(true);

  const [draftTheaterId, setDraftTheaterId] = useState('');
  const [draftDate, setDraftDate] = useState('');

  const [artifactLoaded, setArtifactLoaded] = useState(() => hasShowtimesCurrentCache());
  const [loadingShowtimes, setLoadingShowtimes] = useState(false);
  const [showtimesError, setShowtimesError] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    let cancelled = false;

    loadTheaterRegistryOnce()
      .then((loaded) => {
        if (cancelled) return;
        setRegistry(loaded);
        setRegistryError(null);
        const options = buildTheaterSelectOptions(loaded);
        setDraftTheaterId((current) => current || options[0]?.id || '');
      })
      .catch((error) => {
        if (cancelled) return;
        setRegistry(null);
        setRegistryError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!cancelled) setRegistryLoading(false);
      });

    loadPipelineReportOnce()
      .then((report) => {
        if (cancelled) return;
        const preferred = defaultInspectionDate(report);
        if (preferred) {
          setDraftDate((current) => current || preferred);
        }
      })
      .catch(() => {
        // Pipeline failure is non-fatal; user can type a date manually.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const theaterOptions = buildTheaterSelectOptions(registry);
  const selectedDraftTheater = theaterOptions.find((option) => option.id === draftTheaterId);
  const canSubmit = Boolean(draftTheaterId && draftDate && !loadingShowtimes && !registryError);
  const buttonLabel = artifactLoaded
    ? 'Apply selection'
    : 'Load showtimes for selection';

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmit) return;

    setLoadingShowtimes(true);
    setShowtimesError(null);

    try {
      const { artifact, meta } = await loadShowtimesCurrentOnce();
      setArtifactLoaded(true);
      const theater = registry?.theaters?.find((entry) => entry?.id === draftTheaterId) || {
        id: draftTheaterId,
        name: selectedDraftTheater?.name,
        enabled: selectedDraftTheater?.enabled,
      };
      const nextResult = buildShowtimeInspectionResult(
        artifact,
        {
          theaterId: draftTheaterId,
          date: draftDate,
          theater,
        },
        meta,
      );
      setResult(nextResult);
    } catch (error) {
      setResult(null);
      setShowtimesError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingShowtimes(false);
    }
  }

  const generated = formatTimestamp(result?.generatedAt);

  return (
    <section className="cockpit-section" aria-labelledby="showtime-inspection-heading">
      <h2 id="showtime-inspection-heading">Showtime Inspection</h2>
      <p className="cockpit-secondary">
        Loads the current showtime artifact once for this browser session. Results
        update only when you press the button.
      </p>

      {registryLoading ? (
        <p className="cockpit-loading" role="status">
          Loading theater list…
        </p>
      ) : null}

      {!registryLoading && registryError ? (
        <div className="cockpit-error" role="alert">
          <h3>Theater selection unavailable</h3>
          <p>{registryError}</p>
          <p className="cockpit-secondary">
            Showtime Inspection needs the public theater registry to populate the
            theater list. Pipeline Health remains independent.
          </p>
        </div>
      ) : null}

      {!registryLoading && !registryError ? (
        <form className="cockpit-inspect-form" onSubmit={handleSubmit}>
          <div className="cockpit-inspect-controls">
            <label className="cockpit-field">
              <span>Theater</span>
              <select
                value={draftTheaterId}
                onChange={(event) => setDraftTheaterId(event.target.value)}
                disabled={loadingShowtimes}
              >
                {theaterOptions.length === 0 ? (
                  <option value="">No theaters in registry</option>
                ) : (
                  theaterOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))
                )}
              </select>
            </label>

            <label className="cockpit-field">
              <span>Date</span>
              <input
                type="date"
                value={draftDate}
                onChange={(event) => setDraftDate(event.target.value)}
                disabled={loadingShowtimes}
              />
            </label>

            <button type="submit" disabled={!canSubmit}>
              {buttonLabel}
            </button>
          </div>
        </form>
      ) : null}

      {loadingShowtimes ? (
        <p className="cockpit-loading" role="status">
          Loading showtimes…
        </p>
      ) : null}

      {!loadingShowtimes && showtimesError ? (
        <div className="cockpit-error" role="alert">
          <h3>Unable to load current showtimes</h3>
          <p>{showtimesError}</p>
          <p>
            Expected artifact path: <code>{SHOWTIMES_CURRENT_REPO_PATH}</code>
          </p>
          <p>
            Requested URL: <code>{SHOWTIMES_CURRENT_URL}</code>
          </p>
          <p className="cockpit-secondary">
            The cockpit reads the committed local artifact. Refresh the page to
            retry after updating <code>{SHOWTIMES_CURRENT_REPO_PATH}</code>.
          </p>
          {draftTheaterId || draftDate ? (
            <p className="cockpit-secondary">
              Attempted selection: <code>{draftTheaterId || '—'}</code> /{' '}
              <code>{draftDate || '—'}</code>
            </p>
          ) : null}
        </div>
      ) : null}

      {!loadingShowtimes && !showtimesError && result ? (
        <div className="cockpit-inspect-results">
          <div className="cockpit-registry-summary">
            <h3>Selection summary</h3>
            <dl className="cockpit-dl">
              <div>
                <dt>theater name</dt>
                <dd>{formatMissingScalar(result.theaterName)}</dd>
              </div>
              <div>
                <dt>theater id</dt>
                <dd>
                  <code>{result.theaterId}</code>
                </dd>
              </div>
              <div>
                <dt>enabled</dt>
                <dd>
                  {result.theaterEnabled === true
                    ? 'Yes'
                    : result.theaterEnabled === false
                      ? 'No — Disabled'
                      : '—'}
                </dd>
              </div>
              <div>
                <dt>date</dt>
                <dd>
                  <code>{result.date}</code>
                </dd>
              </div>
              <div>
                <dt>matching showtimes</dt>
                <dd>{result.matchedCount}</dd>
              </div>
              <div>
                <dt>displayed rows</dt>
                <dd>{result.displayedCount}</dd>
              </div>
              <div>
                <dt>generated_at</dt>
                <dd>
                  <code>{generated.raw}</code>
                  {generated.readable ? (
                    <span className="cockpit-secondary"> ({generated.readable})</span>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt>window</dt>
                <dd>
                  <code>
                    {formatMissingScalar(result.window?.start_date)} …{' '}
                    {formatMissingScalar(result.window?.end_date)}
                  </code>
                </dd>
              </div>
            </dl>

            {result.outsideWindow ? (
              <p className="cockpit-note" role="status">
                Selected date is outside the artifact window. Showing any matching
                rows that exist (usually none).
              </p>
            ) : null}

            {result.truncated ? (
              <p className="cockpit-note" role="status">
                Truncated: matched {result.matchedCount} showtimes; displaying first{' '}
                {result.displayedCount}.
              </p>
            ) : null}

            <p className="cockpit-secondary">
              Artifact load: {result.loadMs == null ? '—' : `${Math.round(result.loadMs)} ms`}
              {' · '}
              Selection filter: {Math.round(result.filterMs)} ms
              {' · '}
              Artifact size: {result.approximateSizeLabel}
            </p>

            <p className="cockpit-secondary">{result.duplicateObservation}</p>
          </div>

          {result.matchedCount === 0 ? (
            <p className="cockpit-empty" role="status">
              No showtimes were emitted for this theater and date.
            </p>
          ) : (
            <div className="cockpit-table-wrap">
              <table className="cockpit-table">
                <thead>
                  <tr>
                    <th scope="col">Time</th>
                    <th scope="col">Film</th>
                    <th scope="col">Status</th>
                    <th scope="col">Format tags</th>
                    <th scope="col">Runtime</th>
                    <th scope="col">Source</th>
                    <th scope="col">Source film ID</th>
                    <th scope="col">Showtime film key</th>
                    <th scope="col">Showtime ID</th>
                    <th scope="col">First seen</th>
                    <th scope="col">Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row) => (
                    <tr key={row.key}>
                      <td>
                        {row.timePrimary}
                        {row.timeSecondary ? (
                          <div className="cockpit-cell-secondary">
                            <code>{row.timeSecondary}</code>
                          </div>
                        ) : null}
                      </td>
                      <td>
                        {row.filmTitle}
                        {row.showParentContext ? (
                          <div className="cockpit-cell-secondary">
                            parent: {row.parentDisplayTitle} (
                            <code>{row.parentFilmKey}</code>
                            {row.screeningVariantType !== '—'
                              ? ` · ${row.screeningVariantType}`
                              : ''}
                            )
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <code>{row.status}</code>
                      </td>
                      <td>{row.formatTags}</td>
                      <td>{row.runtime}</td>
                      <td>
                        <code>{row.source}</code>
                      </td>
                      <td>
                        <code>{row.sourceFilmId}</code>
                      </td>
                      <td>
                        <code>{row.showtimeFilmKey}</code>
                      </td>
                      <td>
                        <code>{row.showtimeId}</code>
                      </td>
                      <td>
                        <code>{row.firstSeenRaw}</code>
                      </td>
                      <td>
                        <code>{row.lastSeenRaw}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
