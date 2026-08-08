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
  IconStar,
  IconHeart,
  IconChevron,
} from '../icons.jsx';
import {
  getBuildPlanFormSession,
  setBuildPlanFormSession,
  subscribeBuildPlanFormSession,
} from './buildPlanFormSession.js';
import {
  getFavoriteTheaters,
  toggleFavoriteTheater,
  isTheaterFavorite,
} from '../stores/favoriteTheatersStore.js';

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

/**
 * Get theater logo component based on source
 */
function TheaterLogo({ theater }) {
  // AMC theaters
  if (theater.source === 'amc' || theater.name.toLowerCase().includes('amc')) {
    return (
      <span className="v2-theater-logo v2-theater-logo-amc">
        <span className="v2-theater-logo-text">AMC</span>
      </span>
    );
  }
  
  // SIFF theaters
  if (theater.source === 'siff' || theater.name.toLowerCase().includes('siff')) {
    return (
      <span className="v2-theater-logo v2-theater-logo-siff">
        <span className="v2-theater-logo-text">SIFF</span>
      </span>
    );
  }
  
  // Generic theater icon for others
  return (
    <span className="v2-theater-logo v2-theater-logo-generic">
      <IconBuilding width={20} height={20} />
    </span>
  );
}

function TheaterRow({ theater, selected, onToggle, isFavorite, onToggleFavorite }) {
  return (
    <label className="v2-theater-select-row">
      <input
        type="checkbox"
        checked={selected}
        onChange={(e) => onToggle(theater.id, e.target.checked)}
        className="v2-visually-hidden"
      />
      <span className={`v2-theater-checkbox${selected ? ' is-checked' : ''}`}>
        {selected ? <IconCheck width={16} height={16} /> : null}
      </span>
      <TheaterLogo theater={theater} />
      <span className="v2-theater-info">
        <span className="v2-theater-name">{theater.name}</span>
        {theater.neighborhood ? (
          <span className="v2-theater-location">{theater.neighborhood}</span>
        ) : null}
      </span>
      <button
        type="button"
        className={`v2-theater-favorite${isFavorite ? ' is-favorite' : ''}`}
        onClick={(e) => {
          e.preventDefault();
          onToggleFavorite(theater);
        }}
        aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
      >
        <IconStar width={20} height={20} />
      </button>
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
  const [favoriteTick, setFavoriteTick] = useState(0);
  const [showAllTheaters, setShowAllTheaters] = useState(false);

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

  const favoriteTheaters = useMemo(() => {
    void favoriteTick;
    const favorites = getFavoriteTheaters(window.localStorage);
    const favoriteIds = new Set(favorites.map((f) => f.theaterRef.theaterId));
    return theaters.filter((t) => favoriteIds.has(t.id));
  }, [theaters, favoriteTick]);

  const allTheaters = useMemo(() => {
    const q = query.trim().toLowerCase();
    let filtered = theaters;
    if (q) {
      filtered = theaters.filter((theater) => {
        const nameMatch = theater.name.toLowerCase().includes(q);
        const neighborhoodMatch = theater.neighborhood?.toLowerCase().includes(q);
        return nameMatch || neighborhoodMatch;
      });
    }
    // Show first 8 theaters, or all if expanded or searching
    if (q || showAllTheaters) {
      return filtered;
    }
    return filtered.slice(0, 8);
  }, [theaters, query, showAllTheaters]);

  const hasMoreTheaters = !query && !showAllTheaters && theaters.length > 8;

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

  const handleToggleFavorite = (theater) => {
    toggleFavoriteTheater(window.localStorage, theater, {
      name: theater.name,
      neighborhood: theater.neighborhood,
    });
    setFavoriteTick((n) => n + 1);
  };

  const handleSelectAll = () => {
    const allIds = allTheaters.map((t) => t.id);
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
    <article className="v2-theater-select" aria-labelledby="v2-theater-select-title">
      <header className="v2-theater-select-header">
        <button
          type="button"
          className="v2-theater-select-close"
          onClick={onBack}
          aria-label="Close"
        >
          <IconClose width={20} height={20} />
        </button>
        <div className="v2-theater-select-header-text">
          <h1 id="v2-theater-select-title" className="v2-theater-select-title">
            Select Theaters
          </h1>
          <p className="v2-theater-select-subtitle">
            Choose the theaters you want to include in your plan.
          </p>
        </div>
      </header>

      <div className="v2-theater-select-search">
        <label htmlFor={searchId} className="v2-theater-search-icon">
          <IconSearch width={16} height={16} />
        </label>
        <input
          id={searchId}
          type="search"
          className="v2-theater-search-input"
          placeholder="Search theaters..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="v2-theater-select-actions">
        <button
          type="button"
          className="v2-theater-action-btn"
          onClick={handleSelectAll}
          disabled={loading || allTheaters.length === 0}
        >
          Select all
        </button>
        <button
          type="button"
          className="v2-theater-action-btn"
          onClick={handleClearAll}
          disabled={selectedCount === 0}
        >
          Clear all
        </button>
        <span className="v2-theater-select-count">
          {selectedCount} selected
        </span>
      </div>

      <div className="v2-theater-select-body">
        {loading ? (
          <p className="v2-theater-select-loading">Loading theaters...</p>
        ) : (
          <>
            {!query && (
              <section className="v2-theater-section">
                <h2 className="v2-theater-section-title">YOUR FAVORITES</h2>
                {favoriteTheaters.length === 0 ? (
                  <div className="v2-theater-favorites-empty">
                    <IconHeart width={48} height={48} aria-hidden="true" />
                    <p className="v2-theater-empty-title">
                      You haven't selected any favorites yet
                    </p>
                    <p className="v2-theater-empty-subtitle">
                      Favorite theaters on any theater page to see them here for quick access.
                    </p>
                  </div>
                ) : (
                  <div className="v2-theater-list">
                    {favoriteTheaters.map((theater) => (
                      <TheaterRow
                        key={theater.id}
                        theater={theater}
                        selected={selectedTheaterIds.includes(theater.id)}
                        onToggle={handleToggle}
                        isFavorite={true}
                        onToggleFavorite={handleToggleFavorite}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

            <section className="v2-theater-section">
              <h2 className="v2-theater-section-title">ALL THEATERS</h2>
              {allTheaters.length === 0 ? (
                <p className="v2-theater-select-empty">No theaters found</p>
              ) : (
                <>
                  <div className="v2-theater-list">
                    {allTheaters.map((theater) => {
                      const isFavorite = isTheaterFavorite(window.localStorage, theater);
                      return (
                        <TheaterRow
                          key={theater.id}
                          theater={theater}
                          selected={selectedTheaterIds.includes(theater.id)}
                          onToggle={handleToggle}
                          isFavorite={isFavorite}
                          onToggleFavorite={handleToggleFavorite}
                        />
                      );
                    })}
                  </div>
                  {hasMoreTheaters && (
                    <button
                      type="button"
                      className="v2-theater-show-more"
                      onClick={() => setShowAllTheaters(true)}
                    >
                      <span>Show more theaters</span>
                      <IconChevron width={16} height={16} aria-hidden="true" />
                    </button>
                  )}
                </>
              )}
            </section>
          </>
        )}
      </div>

      <footer className="v2-theater-select-footer">
        <button
          type="button"
          className="v2-theater-btn-cancel"
          onClick={onBack}
        >
          Cancel
        </button>
        <button
          type="button"
          className="v2-theater-btn-done"
          onClick={onDone}
        >
          Done
          {selectedCount > 0 && (
            <span className="v2-theater-done-count">{selectedCount} selected</span>
          )}
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
