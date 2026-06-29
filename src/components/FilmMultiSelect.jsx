import { useEffect, useMemo, useRef, useState } from 'react';
import PosterImage from './PosterImage.jsx';
import {
  filterPlannerFilmsBySearch,
  resolvePlannerFilmToken,
} from '../utils/plannerFilms.js';
import { parseFilmListInput } from '../utils/plannerDisplay.js';

function filmLabel(film, token, catalog) {
  return resolvePlannerFilmToken(token, catalog)?.title ?? film?.title ?? token;
}

export default function FilmMultiSelect({
  id,
  label,
  films,
  selected,
  setSelected,
  hint,
  allowManual = true,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [manualDraft, setManualDraft] = useState('');
  const ref = useRef();

  const catalog = useMemo(() => films ?? [], [films]);
  const selectedTokens = Array.isArray(selected) ? selected : [];

  useEffect(() => {
    function handleClick(event) {
      if (ref.current && !ref.current.contains(event.target)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const filteredFilms = useMemo(
    () => filterPlannerFilmsBySearch(catalog, search),
    [catalog, search],
  );

  const toggleFilm = (key) => {
    if (selectedTokens.includes(key)) {
      setSelected(selectedTokens.filter((token) => token !== key));
      return;
    }
    setSelected([...selectedTokens, key]);
  };

  const removeToken = (token) => {
    setSelected(selectedTokens.filter((value) => value !== token));
  };

  const applyManualEntry = () => {
    const additions = parseFilmListInput(manualDraft);
    if (additions.length === 0) return;
    const merged = [...selectedTokens];
    for (const token of additions) {
      if (!merged.includes(token)) merged.push(token);
    }
    setSelected(merged);
    setManualDraft('');
  };

  const labelText =
    selectedTokens.length === 0 ? label : `${label} (${selectedTokens.length})`;

  return (
    <div className={`film-multiselect${open ? ' is-open' : ''}`} ref={ref}>
      <button
        id={id}
        className={`dropdown-btn film-multiselect-trigger${open ? ' open' : ''}`}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {labelText}
      </button>

      {selectedTokens.length > 0 ? (
        <div className="film-chip-list" aria-label={`${label} selected`}>
          {selectedTokens.map((token) => (
            <span className="film-chip" key={token}>
              <span className="film-chip-label">{filmLabel(null, token, catalog)}</span>
              <button
                type="button"
                className="film-chip-remove"
                onClick={() => removeToken(token)}
                aria-label={`Remove ${filmLabel(null, token, catalog)}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {open ? (
        <div className="dropdown-menu film-multiselect-menu" role="listbox">
          <div className="film-multiselect-search-wrap">
            <input
              type="search"
              className="film-multiselect-search"
              placeholder="Search films…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label={`Search ${label}`}
            />
          </div>
          {filteredFilms.length === 0 ? (
            <p className="film-multiselect-empty">No films match your search.</p>
          ) : (
            filteredFilms.map((film) => (
              <label className="dropdown-option film-multiselect-option" key={film.key}>
                <input
                  type="checkbox"
                  className="dropdown-checkbox"
                  checked={selectedTokens.includes(film.key)}
                  onChange={() => toggleFilm(film.key)}
                />
                <PosterImage
                  src={film.poster}
                  alt=""
                  className="film-multiselect-poster"
                  aria-hidden="true"
                />
                <span className="film-multiselect-option-text">
                  <span className="film-multiselect-option-title">{film.title}</span>
                  <span className="film-multiselect-option-meta">
                    {film.theaterCount} theater{film.theaterCount === 1 ? '' : 's'}
                  </span>
                </span>
              </label>
            ))
          )}
        </div>
      ) : null}

      {hint ? <p className="planner-field-hint">{hint}</p> : null}

      {allowManual ? (
        <details
          className="film-manual-entry"
          open={manualOpen}
          onToggle={(event) => setManualOpen(event.currentTarget.open)}
        >
          <summary className="film-manual-entry-toggle">Enter title manually</summary>
          <div className="film-manual-entry-body">
            <input
              type="text"
              className="filter-input"
              placeholder="Exact title or comma-separated titles"
              value={manualDraft}
              onChange={(event) => setManualDraft(event.target.value)}
              onBlur={applyManualEntry}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  applyManualEntry();
                }
              }}
            />
            <p className="planner-field-hint">
              Manual titles must match showtime listings exactly.
            </p>
          </div>
        </details>
      ) : null}
    </div>
  );
}
