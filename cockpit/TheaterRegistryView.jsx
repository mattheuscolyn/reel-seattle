import {
  buildTheaterRegistryRows,
  buildTheaterRegistrySummary,
} from './theaterRegistryFormat.js';
import { formatMissingScalar } from './pipelineHealthFormat.js';
import {
  THEATERS_REGISTRY_REPO_PATH,
  THEATERS_REGISTRY_URL,
} from './theaterRegistryLoader.js';

function CountMap({ title, counts }) {
  const entries = Object.entries(counts || {});
  return (
    <div className="cockpit-count-map">
      <h3>{title}</h3>
      {entries.length === 0 ? (
        <p className="cockpit-empty">None</p>
      ) : (
        <ul>
          {entries.map(([key, count]) => (
            <li key={`${title}-${key}`}>
              <code>{key}</code>: {count}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Read-only Theater Registry summary and table for public/data/theaters.json.
 */
export default function TheaterRegistryView({ registry }) {
  const summary = buildTheaterRegistrySummary(registry);
  const rows = buildTheaterRegistryRows(registry);
  const schemaVersion = formatMissingScalar(registry?.schema_version);
  const updatedAt = formatMissingScalar(registry?.updated_at);

  return (
    <div className="cockpit-registry">
      <p className="cockpit-secondary">
        schema_version: <code>{schemaVersion}</code>
        {' · '}
        updated_at: <code>{updatedAt}</code>
      </p>

      <div className="cockpit-registry-summary">
        <h3>Summary</h3>
        <dl className="cockpit-dl">
          <div>
            <dt>total theaters</dt>
            <dd>{summary.total}</dd>
          </div>
          <div>
            <dt>Enabled</dt>
            <dd>{summary.enabledCount}</dd>
          </div>
          <div>
            <dt>Disabled</dt>
            <dd>{summary.disabledCount}</dd>
          </div>
        </dl>
        <div className="cockpit-registry-counts">
          <CountMap title="By source" counts={summary.bySource} />
          <CountMap title="By type" counts={summary.byType} />
        </div>
      </div>

      <div className="cockpit-registry-observations">
        <h3>Observations</h3>
        <p className="cockpit-secondary">
          Completeness observations only — not validation errors. Null external IDs,
          empty aliases, and missing location fields are often expected.
        </p>
        <ul>
          <li>
            entries without <code>source_external_id</code>:{' '}
            {summary.observations.withoutExternalId}
          </li>
          <li>
            entries without aliases: {summary.observations.withoutAliases}
          </li>
          <li>entries without city: {summary.observations.withoutCity}</li>
          <li>
            entries without neighborhood: {summary.observations.withoutNeighborhood}
          </li>
          <li>Disabled entries: {summary.observations.disabledCount}</li>
        </ul>
      </div>

      <aside className="cockpit-semantics-note" aria-label="Disabled theater semantics">
        <p>
          Disabled entries remain part of the registry and are intentionally visible
          here. Disabled AMC registry matches may appear in pipeline warnings. This
          cockpit does not decide whether a theater should be Enabled.
        </p>
        <p className="cockpit-secondary">
          Artifact: <code>{THEATERS_REGISTRY_REPO_PATH}</code> (requested as{' '}
          <code>{THEATERS_REGISTRY_URL}</code>)
        </p>
      </aside>

      <div className="cockpit-table-wrap">
        <table className="cockpit-table">
          <thead>
            <tr>
              <th scope="col">name</th>
              <th scope="col">id</th>
              <th scope="col">source</th>
              <th scope="col">enabled</th>
              <th scope="col">type</th>
              <th scope="col">aliases</th>
              <th scope="col">source_external_id</th>
              <th scope="col">city</th>
              <th scope="col">neighborhood</th>
              <th scope="col">timezone</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="cockpit-empty">
                  No theaters in registry.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.key}
                  className={row.isDisabled ? 'cockpit-row--disabled' : undefined}
                >
                  <td>{row.name}</td>
                  <td>
                    <code>{row.id}</code>
                  </td>
                  <td>
                    <code>{row.source}</code>
                  </td>
                  <td>
                    {row.enabledLabel}
                    {row.isDisabled ? (
                      <span className="cockpit-disabled-tag"> · Disabled</span>
                    ) : null}
                  </td>
                  <td>
                    <code>{row.type}</code>
                  </td>
                  <td>{row.aliasesDisplay}</td>
                  <td>
                    <code>{row.sourceExternalId}</code>
                  </td>
                  <td>{row.city}</td>
                  <td>{row.neighborhood}</td>
                  <td>
                    <code>{row.timezone}</code>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
