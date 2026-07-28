/**
 * Recent search chips — device-local only.
 */
export default function ExploreRecentSearches({
  searches,
  onRerun,
  onRemove,
  onClearAll,
}) {
  const list = Array.isArray(searches) ? searches : [];

  return (
    <section className="v2-recent" aria-labelledby="v2-recent-heading">
      <div className="v2-section-row">
        <h2 id="v2-recent-heading" className="v2-section-caps">
          Recent Searches
        </h2>
        {list.length > 0 ? (
          <button type="button" className="v2-section-action" onClick={onClearAll}>
            Clear all
          </button>
        ) : null}
      </div>

      {list.length === 0 ? (
        <p className="v2-recent-empty" role="status">
          Recent searches stay on this device and will appear here.
        </p>
      ) : (
        <ul className="v2-recent-chips" role="list">
          {list.map((term) => (
            <li key={term} className="v2-recent-chip">
              <button
                type="button"
                className="v2-recent-chip-run"
                onClick={() => onRerun?.(term)}
              >
                {term}
              </button>
              <button
                type="button"
                className="v2-recent-chip-remove"
                aria-label={`Remove recent search ${term}`}
                onClick={() => onRemove?.(term)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
