export default function PlannerFilmValidation({ items, heading = 'Film filter check' }) {
  if (!items?.length) return null;

  return (
    <div className="planner-film-validation" role="status" aria-live="polite">
      <p className="planner-film-validation-heading">{heading}</p>
      <ul className="planner-film-validation-list">
        {items.map((item) => (
          <li
            key={item.token}
            className={`planner-film-validation-item planner-film-validation-item--${item.status}`}
          >
            <span className="planner-film-validation-icon" aria-hidden="true">
              {item.status === 'matched' ? '✓' : '✗'}
            </span>
            <span className="planner-film-validation-text">
              <strong>{item.label}</strong>
              {item.status === 'matched' ? (
                <>
                  {' '}
                  — playing at {item.theaterCount} theater{item.theaterCount === 1 ? '' : 's'}
                </>
              ) : item.suggestion ? (
                <> — no match. Did you mean {item.suggestion.title}?</>
              ) : (
                <> — no match on this date</>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
