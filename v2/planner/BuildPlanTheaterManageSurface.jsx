/**
 * Build a Plan theater-management surface.
 * Allows users to select specific theaters for their plan.
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  IconBuilding,
  IconClose,
  IconSearch,
  IconCheck,
} from '../icons.jsx';
import {
  getBuildPlanFormSession,
  setBuildPlanFormSession,
  subscribeBuildPlanFormSession,
} from './buildPlanFormSession.js';

/**
 * Load theater data from public/data/theaters.json
 */
async function loadTheaters() {
  try {
    const response = await fetch('/data/theaters.json');
    if (!response.ok) return [];
    const data = await response.json();
    return data.theaters || [];
  } catch {
    return [];
  }
}

function TheaterRow({ theater, selected, onToggle }) {
  const displayName = theater.neighborhood
    ? `${theater.name} · ${theater.neighborhood}`
    : theater.name;

  return (
    <label className="v2-bp-manage-row v2-bp-theater-row">
      <input
        type="checkbox"
        checked={selected}
        onChange={(e) => onToggle(theater.id, e.target.checked)}
        className="v2-visually-hidden"
      />
      <span className="v2-bp-theater-checkbox">
        {selected ? <IconCheck width={16} height={16} /> : null}
      </span>
      <span className="v2-bp-theater-icon" aria-hidden="true">
        <IconBuilding width={18} height={18} />
      </span>
      <span className="v2-bp-manage-row-copy">
        <span className="v2-bp-manage-row-title">{theater.name}</span>
        {theater.neighborhood ? (
          <span className="v2-bp-manage-row-meta">{theater.neighborhood}</span>
        ) : null}
      </span>
    </label>
  );
}

/**
 * @param {{
 *   onDone: () => void,
 *   onBack: () => void,
 * }} props
 */
export default function BuildPlanTheaterManageSurface({
  onDone,
  onBack,
}) {
  const searchId = useId();
  const statusId = useId();
  const [query, setQuery] = useState('');
  const [theaters, setTheaters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formTick, setFormTick] = useState(0);

  useEffect(() => {
    loadTheaters().then((data) => {
      setTheaters(data.filter((t) => t.enabled !== false));
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    return subscribeBuildPlanFormSession(() => {
      setFormTick((n) => n + 1);
    });
  }, []);

  const form = getBuildPlanFormSession();
  const selectedTheaterIds = form?.selectedTheaters ?? [];

  const filteredTheaters = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return theaters;
    return theaters.filter((theater) => {
      const nameMatch = theater.name.toLowerCase().includes(q);
      const neighborhoodMatch = theater.neighborhood?.toLowerCase().includes(q);
      return nameMatch || neighborhoodMatch;
    });
  }, [theaters, query]);

  const handleToggle = (theaterId, checked) => {
    const current = form?.selectedTheaters ?? [];
    const next = checked
      ? [...current, theaterId]
      : current.filter((id) => id !== theaterId);
    
    setBuildPlanFormSession({
      ...form,
      selectedTheaters: next,
    });
  };

  const handleSelectAll = () => {
    const allIds = filteredTheaters.map((t) => t.id);
    setBuildPlanFormSession({
      ...form,
      selectedTheaters: allIds,
    });
  };

  const handleClearAll = () => {
    setBuildPlanFormSession({
      ...form,
      selectedTheaters: [],
    });
  };

  const selectedCount = selectedTheaterIds.length;

  return (
    <article className="v2-bp-manage" aria-labelledby="v2-bp-manage-title">
      <header className="v2-bp-manage-header">
        <button
          type="button"
          className="v2-bp-manage-close"
          onClick={onBack}
          aria-label="Close"
        >
          <IconClose width={20} height={20} />
        </button>
        <h1 id="v2-bp-manage-title" className="v2-bp-manage-title">
          Select Theaters
        </h1>
      </header>

      <div className="v2-bp-manage-search">
        <label htmlFor={searchId} className="v2-bp-search-icon">
          <IconSearch width={16} height={16} />
        </label>
        <input
          id={searchId}
          type="search"
          className="v2-bp-search-input"
          placeholder="Search theaters..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="v2-bp-manage-actions">
        <button
          type="button"
          className="v2-bp-manage-action-btn"
          onClick={handleSelectAll}
          disabled={loading || filteredTheaters.length === 0}
        >
          Select all
        </button>
        <button
          type="button"
          className="v2-bp-manage-action-btn"
          onClick={handleClearAll}
          disabled={selectedCount === 0}
        >
          Clear all
        </button>
        <span className="v2-bp-manage-count">
          {selectedCount} selected
        </span>
      </div>

      <div className="v2-bp-manage-body">
        {loading ? (
          <p className="v2-bp-manage-empty">Loading theaters...</p>
        ) : filteredTheaters.length === 0 ? (
          <p className="v2-bp-manage-empty">No theaters found</p>
        ) : (
          <div className="v2-bp-manage-list">
            {filteredTheaters.map((theater) => (
              <TheaterRow
                key={theater.id}
                theater={theater}
                selected={selectedTheaterIds.includes(theater.id)}
                onToggle={handleToggle}
              />
            ))}
          </div>
        )}
      </div>

      <footer className="v2-bp-manage-footer">
        <button
          type="button"
          className="v2-bp-manage-done"
          onClick={onDone}
        >
          Done
        </button>
      </footer>

      <p
        id={statusId}
        className="v2-visually-hidden"
        role="status"
        aria-live="polite"
      >
        {selectedCount} {selectedCount === 1 ? 'theater' : 'theaters'} selected
      </p>
    </article>
  );
}
