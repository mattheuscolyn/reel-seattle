import { resolvePlannerFilmToken } from '../utils/plannerFilms.js';

export default function FilmSingleSelect({
  id,
  label,
  films,
  value,
  onChange,
  disabledKeys = [],
  placeholder = 'Any film',
}) {
  const catalog = films ?? [];
  const disabled = new Set(disabledKeys);

  return (
    <div className="filter-group">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="filter-select"
      >
        <option value="">{placeholder}</option>
        {catalog.map((film) => (
          <option key={film.key} value={film.key} disabled={disabled.has(film.key)}>
            {film.title}
            {disabled.has(film.key) ? ' (unavailable)' : ''}
          </option>
        ))}
        {value && !catalog.some((film) => film.key === value) ? (
          <option value={value}>
            {resolvePlannerFilmToken(value, catalog)?.title ?? value}
          </option>
        ) : null}
      </select>
    </div>
  );
}
