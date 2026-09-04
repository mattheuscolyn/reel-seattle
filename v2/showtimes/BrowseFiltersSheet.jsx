/**
 * Browse All Showtimes — filter bottom sheet (draft / apply).
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { IconCheck, IconChevron, IconClose } from '../icons.jsx';
import { evaluateBrowseFilters } from './browseFilterEngine.js';
import {
  cloneBrowseSheetDraft,
  mergeBrowseSheetDraft,
  normalizeBrowseFilters,
  resetBrowseSheetDraft,
} from './browseFilterState.js';
import {
  browseMinutesToTimeInput,
  browseTimeInputToMinutes,
  formatBrowseCustomTimeSummary,
} from './browseFilterSheetUtils.js';
import {
  ensureSelectedBrowseFormatOptions,
  listBrowseFormatFilterOptions,
  listBrowseTheaterFilterOptions,
} from './showtimesBrowseModel.js';

const THEATER_PREVIEW_COUNT = 7;

export const BROWSE_TIME_PRESET_CHIPS = Object.freeze([
  Object.freeze({ id: 'any', label: 'Any' }),
  Object.freeze({ id: 'morning', label: 'Morning' }),
  Object.freeze({ id: 'afternoon', label: 'Afternoon' }),
  Object.freeze({ id: 'evening', label: 'Evening' }),
  Object.freeze({ id: 'late', label: 'Late' }),
]);

export const BROWSE_SAVED_SEGMENTS = Object.freeze([
  Object.freeze({ id: 'any', label: 'Any' }),
  Object.freeze({ id: 'saved', label: 'Saved' }),
  Object.freeze({ id: 'not_saved', label: 'Not saved' }),
]);

export const BROWSE_SEEN_SEGMENTS = Object.freeze([
  Object.freeze({ id: 'any', label: 'Any' }),
  Object.freeze({ id: 'not_seen', label: 'Not seen' }),
  Object.freeze({ id: 'seen', label: 'Seen' }),
]);

export const BROWSE_NOT_INTERESTED_SEGMENTS = Object.freeze([
  Object.freeze({ id: 'hide', label: 'Hide' }),
  Object.freeze({ id: 'any', label: 'Any' }),
  Object.freeze({ id: 'only', label: 'Only' }),
]);

export {
  browseMinutesToTimeInput,
  browseTimeInputToMinutes,
  formatBrowseCustomTimeSummary,
} from './browseFilterSheetUtils.js';

/**
 * @param {object} props
 */
export default function BrowseFiltersSheet({
  open,
  appliedFilters,
  homeData = null,
  enrichmentIndex = null,
  storage = null,
  now = null,
  onClose,
  onApply,
}) {
  const titleId = useId();
  const subtitleId = useId();
  const closeRef = useRef(/** @type {HTMLButtonElement | null} */ (null));
  const [draft, setDraft] = useState(() =>
    cloneBrowseSheetDraft(normalizeBrowseFilters(appliedFilters, now ?? undefined)),
  );
  const [customOpen, setCustomOpen] = useState(false);
  const [showAllTheaters, setShowAllTheaters] = useState(false);

  useEffect(() => {
    if (!open) return;
    const next = cloneBrowseSheetDraft(
      normalizeBrowseFilters(appliedFilters, now ?? undefined),
    );
    setDraft(next);
    setCustomOpen(next.time.preset === 'custom');
    setShowAllTheaters(false);
    const frame = requestAnimationFrame(() => {
      closeRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open, appliedFilters, now]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const previewFilters = useMemo(
    () => mergeBrowseSheetDraft(appliedFilters, draft),
    [appliedFilters, draft],
  );

  const preview = useMemo(
    () =>
      evaluateBrowseFilters(homeData, previewFilters, {
        now: now ?? undefined,
        storage,
        enrichmentIndex,
      }),
    [homeData, previewFilters, now, storage, enrichmentIndex],
  );

  const theaterOptions = useMemo(
    () => listBrowseTheaterFilterOptions(preview.eligibleOpportunities),
    [preview.eligibleOpportunities],
  );

  const formatOptions = useMemo(
    () =>
      ensureSelectedBrowseFormatOptions(
        listBrowseFormatFilterOptions(preview.eligibleOpportunities),
        draft.formatKeys,
      ),
    [preview.eligibleOpportunities, draft.formatKeys],
  );

  if (!open) return null;

  const visibleTheaters = showAllTheaters
    ? theaterOptions
    : theaterOptions.slice(0, THEATER_PREVIEW_COUNT);
  const hiddenTheaterCount = Math.max(
    0,
    theaterOptions.length - THEATER_PREVIEW_COUNT,
  );
  const resultCount = preview.resultCount;
  const invalidCustomTime = Boolean(preview.invalidCustomTimeRange);

  const setTimePreset = (presetId) => {
    setDraft((current) => ({
      ...current,
      time: {
        preset: presetId,
        customStartMin: null,
        customEndMin: null,
      },
    }));
    if (presetId !== 'custom') setCustomOpen(false);
  };

  const openCustomTime = () => {
    setDraft((current) => ({
      ...current,
      time: {
        preset: 'custom',
        customStartMin: current.time.customStartMin,
        customEndMin: current.time.customEndMin,
      },
    }));
    setCustomOpen(true);
  };

  const setCustomBound = (bound, value) => {
    const minutes = browseTimeInputToMinutes(value);
    setDraft((current) => ({
      ...current,
      time: {
        preset: 'custom',
        customStartMin:
          bound === 'start' ? minutes : current.time.customStartMin,
        customEndMin: bound === 'end' ? minutes : current.time.customEndMin,
      },
    }));
  };

  const toggleTheater = (id) => {
    setDraft((current) => {
      const selected = current.theaterIds.includes(id)
        ? current.theaterIds.filter((x) => x !== id)
        : [...current.theaterIds, id];
      return { ...current, theaterIds: selected };
    });
  };

  const toggleFormat = (key) => {
    setDraft((current) => {
      const selected = current.formatKeys.includes(key)
        ? current.formatKeys.filter((x) => x !== key)
        : [...current.formatKeys, key];
      return { ...current, formatKeys: selected };
    });
  };

  const handleReset = () => {
    const reset = resetBrowseSheetDraft(appliedFilters);
    setDraft(cloneBrowseSheetDraft(reset));
    setCustomOpen(false);
  };

  const handleApply = () => {
    onApply?.(mergeBrowseSheetDraft(appliedFilters, draft));
  };

  return (
    <div
      className="v2-bfs-backdrop"
      role="presentation"
      data-browse-filters-sheet="open"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        className="v2-bfs-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitleId}
      >
        <div className="v2-ss-handle" aria-hidden="true" />

        <header className="v2-bfs-header">
          <div className="v2-bfs-header-copy">
            <h2 id={titleId} className="v2-bfs-title">
              Filters
            </h2>
            <p id={subtitleId} className="v2-bfs-subtitle">
              Refine your showtimes
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="v2-ss-close v2-bfs-close"
            aria-label="Close filters"
            onClick={() => onClose?.()}
          >
            <IconClose />
          </button>
        </header>

        <div className="v2-bfs-body">
          <section className="v2-bfs-section" aria-labelledby="v2-bfs-time-label">
            <h3 id="v2-bfs-time-label" className="v2-bfs-section-title">
              Time
            </h3>
            <div className="v2-bfs-chip-row" role="group" aria-label="Time of day">
              {BROWSE_TIME_PRESET_CHIPS.map((chip) => {
                const selected =
                  draft.time.preset === chip.id ||
                  (chip.id === 'any' && draft.time.preset === 'any');
                return (
                  <button
                    key={chip.id}
                    type="button"
                    className={
                      selected ? 'v2-bfs-chip is-selected' : 'v2-bfs-chip'
                    }
                    aria-pressed={selected}
                    onClick={() => setTimePreset(chip.id)}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              className="v2-bfs-custom-toggle"
              aria-expanded={customOpen || draft.time.preset === 'custom'}
              onClick={openCustomTime}
            >
              <span className="v2-bfs-custom-label">Custom time range</span>
              <span className="v2-bfs-custom-value">
                {formatBrowseCustomTimeSummary(draft.time)}
                <IconChevron width={14} height={14} aria-hidden="true" />
              </span>
            </button>

            {customOpen || draft.time.preset === 'custom' ? (
              <div className="v2-bfs-custom-fields">
                <label className="v2-bfs-time-field">
                  <span>Start</span>
                  <input
                    type="time"
                    value={browseMinutesToTimeInput(draft.time.customStartMin)}
                    onChange={(event) =>
                      setCustomBound('start', event.target.value)
                    }
                  />
                </label>
                <label className="v2-bfs-time-field">
                  <span>End</span>
                  <input
                    type="time"
                    value={browseMinutesToTimeInput(draft.time.customEndMin)}
                    onChange={(event) => setCustomBound('end', event.target.value)}
                  />
                </label>
              </div>
            ) : null}
            {invalidCustomTime ? (
              <p className="v2-bfs-error" role="alert">
                End time must be after start time.
              </p>
            ) : null}
          </section>

          <section
            className="v2-bfs-section"
            aria-labelledby="v2-bfs-theaters-label"
          >
            <div className="v2-bfs-section-head">
              <h3 id="v2-bfs-theaters-label" className="v2-bfs-section-title">
                Theaters
              </h3>
              <button
                type="button"
                className={
                  draft.favoritesOnly
                    ? 'v2-bfs-fav-toggle is-selected'
                    : 'v2-bfs-fav-toggle'
                }
                aria-pressed={draft.favoritesOnly}
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    favoritesOnly: !current.favoritesOnly,
                  }))
                }
              >
                Favorites only
              </button>
            </div>

            <ul className="v2-bfs-theater-list" role="list">
              {visibleTheaters.map((theater) => {
                const checked = draft.theaterIds.includes(theater.id);
                return (
                  <li key={theater.id}>
                    <button
                      type="button"
                      className={
                        checked
                          ? 'v2-bfs-theater-row is-selected'
                          : 'v2-bfs-theater-row'
                      }
                      aria-pressed={checked}
                      onClick={() => toggleTheater(theater.id)}
                    >
                      <span
                        className={
                          checked
                            ? 'v2-bfs-check is-checked'
                            : 'v2-bfs-check'
                        }
                        aria-hidden="true"
                      >
                        {checked ? <IconCheck width={12} height={12} /> : null}
                      </span>
                      <span className="v2-bfs-theater-name">{theater.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {!showAllTheaters && hiddenTheaterCount > 0 ? (
              <button
                type="button"
                className="v2-bfs-show-all"
                onClick={() => setShowAllTheaters(true)}
              >
                Show all theaters
              </button>
            ) : null}
          </section>

          <section
            className="v2-bfs-section"
            aria-labelledby="v2-bfs-films-label"
          >
            <h3 id="v2-bfs-films-label" className="v2-bfs-section-title">
              Your films
            </h3>

            <div className="v2-bfs-segment-block">
              <p className="v2-bfs-segment-label" id="v2-bfs-saved-label">
                Saved
              </p>
              <div
                className="v2-bfs-segments"
                role="group"
                aria-labelledby="v2-bfs-saved-label"
              >
                {BROWSE_SAVED_SEGMENTS.map((seg) => (
                  <button
                    key={seg.id}
                    type="button"
                    className={
                      draft.savedMode === seg.id
                        ? 'v2-bfs-segment is-selected'
                        : 'v2-bfs-segment'
                    }
                    aria-pressed={draft.savedMode === seg.id}
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        savedMode: seg.id,
                      }))
                    }
                  >
                    {seg.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="v2-bfs-segment-block">
              <p className="v2-bfs-segment-label" id="v2-bfs-seen-label">
                Seen
              </p>
              <div
                className="v2-bfs-segments"
                role="group"
                aria-labelledby="v2-bfs-seen-label"
              >
                {BROWSE_SEEN_SEGMENTS.map((seg) => (
                  <button
                    key={seg.id}
                    type="button"
                    className={
                      draft.seenMode === seg.id
                        ? 'v2-bfs-segment is-selected'
                        : 'v2-bfs-segment'
                    }
                    aria-pressed={draft.seenMode === seg.id}
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        seenMode: seg.id,
                      }))
                    }
                  >
                    {seg.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="v2-bfs-segment-block">
              <p className="v2-bfs-segment-label" id="v2-bfs-ni-label">
                Not Interested
              </p>
              <div
                className="v2-bfs-segments"
                role="group"
                aria-labelledby="v2-bfs-ni-label"
              >
                {BROWSE_NOT_INTERESTED_SEGMENTS.map((seg) => (
                  <button
                    key={seg.id}
                    type="button"
                    className={
                      draft.notInterestedMode === seg.id
                        ? 'v2-bfs-segment is-selected'
                        : 'v2-bfs-segment'
                    }
                    aria-pressed={draft.notInterestedMode === seg.id}
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        notInterestedMode: seg.id,
                      }))
                    }
                  >
                    {seg.label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section
            className="v2-bfs-section"
            aria-labelledby="v2-bfs-formats-label"
          >
            <h3 id="v2-bfs-formats-label" className="v2-bfs-section-title">
              Formats &amp; experiences
            </h3>
            <div
              className="v2-bfs-chip-wrap"
              role="group"
              aria-label="Formats and experiences"
            >
              {formatOptions.map((format) => {
                const selected = draft.formatKeys.includes(format.key);
                return (
                  <button
                    key={format.key}
                    type="button"
                    className={
                      selected ? 'v2-bfs-chip is-selected' : 'v2-bfs-chip'
                    }
                    aria-pressed={selected}
                    onClick={() => toggleFormat(format.key)}
                  >
                    {format.label}
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        <footer className="v2-bfs-footer">
          <button
            type="button"
            className="v2-bfs-reset"
            onClick={handleReset}
          >
            Reset
          </button>
          <button
            type="button"
            className="v2-bfs-apply"
            disabled={invalidCustomTime}
            onClick={handleApply}
            aria-label={`Show ${resultCount} result${resultCount === 1 ? '' : 's'}`}
          >
            Show {resultCount} result{resultCount === 1 ? '' : 's'}
          </button>
        </footer>
      </div>
    </div>
  );
}
