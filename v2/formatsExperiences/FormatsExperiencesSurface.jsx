/**
 * Formats & Experiences landing — replaces CollectionSurface scaffold for collectionId formats.
 */

import { useId, useMemo, useState } from 'react';
import {
  IconCaption,
  IconChevron,
  IconHeadphones,
  IconMusic,
  IconSliders,
} from '../icons.jsx';
import BackButton from './BackButton.jsx';
import { useInitialHeadingFocus } from './DetailParts.jsx';
import { FormatTile } from './FormatTile.jsx';
import { composeFormatsExperiencesLanding } from './composeFormatsExperiencesPresentation.js';

const EXPERIENCE_ICONS = {
  caption: IconCaption,
  headphones: IconHeadphones,
  music: IconMusic,
};

/**
 * @param {{
 *   homeData?: object | null,
 *   onBack: () => void,
 *   onOpenFormatDetail?: (payload: { formatId: string }) => void,
 *   onOpenExperienceDetail?: (payload: { experienceId: string }) => void,
 * }} props
 */
export default function FormatsExperiencesSurface({
  homeData = null,
  onBack,
  onOpenFormatDetail,
  onOpenExperienceDetail,
}) {
  const headingRef = useInitialHeadingFocus();
  const filtersTitleId = useId();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState({
    availableOnly: false,
    kinds: /** @type {Array<'format' | 'experience'>} */ ([]),
    ids: /** @type {string[]} */ ([]),
  });
  const [appliedFilters, setAppliedFilters] = useState(draftFilters);

  const presentation = useMemo(
    () =>
      composeFormatsExperiencesLanding(homeData, { filters: appliedFilters }),
    [homeData, appliedFilters],
  );

  const activeFilterCount =
    (appliedFilters.availableOnly ? 1 : 0) +
    (appliedFilters.kinds.length > 0 ? 1 : 0) +
    (appliedFilters.ids.length > 0 ? 1 : 0);

  const openFilters = () => {
    setDraftFilters(appliedFilters);
    setFiltersOpen(true);
  };

  const applyFilters = () => {
    setAppliedFilters(draftFilters);
    setFiltersOpen(false);
  };

  const resetFilters = () => {
    const empty = { availableOnly: false, kinds: [], ids: [] };
    setDraftFilters(empty);
    setAppliedFilters(empty);
    setFiltersOpen(false);
  };

  const toggleKind = (kind) => {
    setDraftFilters((prev) => {
      const has = prev.kinds.includes(kind);
      return {
        ...prev,
        kinds: has ? prev.kinds.filter((k) => k !== kind) : [...prev.kinds, kind],
      };
    });
  };

  const toggleId = (id) => {
    setDraftFilters((prev) => {
      const has = prev.ids.includes(id);
      return {
        ...prev,
        ids: has ? prev.ids.filter((x) => x !== id) : [...prev.ids, id],
      };
    });
  };

  return (
    <div
      className="v2-fe-page"
      data-fe-source="formats-experiences"
      data-fe-section-root="landing"
    >
      <BackButton onClick={onBack} />

      <header className="v2-fe-page-header" data-fe-section="header">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="v2-fe-page-title"
        >
          {presentation.copy.title}
        </h1>
        <p className="v2-fe-page-tagline">{presentation.copy.tagline}</p>
      </header>

      <div className="v2-fe-page-controls" data-fe-section="controls">
        <p className="v2-fe-page-count">{presentation.countLabel}</p>
        <button
          type="button"
          className="v2-fe-filters-btn"
          onClick={openFilters}
          aria-expanded={filtersOpen}
          aria-controls={filtersOpen ? filtersTitleId : undefined}
        >
          <IconSliders width={14} height={14} aria-hidden="true" />
          {presentation.copy.filtersLabel}
          {activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}
        </button>
      </div>

      {presentation.formats.length > 0 ? (
        <section className="v2-fe-landing-section" data-fe-section="formats">
          <h2 className="v2-section-caps">{presentation.copy.formatsHeading}</h2>
          <ul className="v2-fe-format-list" role="list">
            {presentation.formats.map((format) => (
              <li key={format.id}>
                <button
                  type="button"
                  className="v2-fe-format-card"
                  onClick={() => onOpenFormatDetail?.({ formatId: format.id })}
                >
                  <FormatTile
                    tone={format.tileTone}
                    label={format.tileLabel}
                    size="md"
                  />
                  <span className="v2-fe-format-card-copy">
                    <span className="v2-fe-format-card-name">{format.name}</span>
                    <span className="v2-fe-format-card-desc">
                      {format.shortDescription}
                    </span>
                    <span className="v2-fe-format-card-avail">
                      {format.availabilityLabel}
                    </span>
                  </span>
                  <span className="v2-fe-format-card-chevron" aria-hidden="true">
                    <IconChevron width={18} height={18} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {presentation.experiences.length > 0 ? (
        <section className="v2-fe-landing-section" data-fe-section="experiences">
          <h2 className="v2-section-caps">
            {presentation.copy.experiencesHeading}
          </h2>
          <ul className="v2-fe-experience-grid" role="list">
            {presentation.experiences.map((experience) => {
              const IconCmp = EXPERIENCE_ICONS[experience.icon] ?? IconCaption;
              return (
                <li key={experience.id}>
                  <button
                    type="button"
                    className="v2-fe-experience-card"
                    onClick={() =>
                      onOpenExperienceDetail?.({
                        experienceId: experience.id,
                      })
                    }
                  >
                    <span className="v2-fe-experience-card-icon">
                      <IconCmp width={28} height={28} aria-hidden="true" />
                    </span>
                    <span className="v2-fe-experience-card-name">
                      {experience.name}
                    </span>
                    <span className="v2-fe-experience-card-desc">
                      {experience.cardSummary ?? experience.shortDescription}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {presentation.formats.length === 0 &&
      presentation.experiences.length === 0 ? (
        <p className="v2-fe-empty" role="status">
          No formats or experiences match these filters.
        </p>
      ) : null}

      {filtersOpen ? (
        <div
          className="v2-fe-filter-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby={filtersTitleId}
        >
          <div className="v2-fe-filter-sheet-panel">
            <div className="v2-fe-filter-sheet-head">
              <h2 id={filtersTitleId}>Filters</h2>
              <button
                type="button"
                className="v2-fe-filter-sheet-close"
                onClick={() => setFiltersOpen(false)}
              >
                Close
              </button>
            </div>

            <label className="v2-fe-filter-check">
              <input
                type="checkbox"
                checked={draftFilters.availableOnly}
                onChange={(e) =>
                  setDraftFilters((prev) => ({
                    ...prev,
                    availableOnly: e.target.checked,
                  }))
                }
              />
              Currently available in Seattle
            </label>

            <fieldset className="v2-fe-filter-fieldset">
              <legend>Show</legend>
              <label className="v2-fe-filter-check">
                <input
                  type="checkbox"
                  checked={draftFilters.kinds.includes('format')}
                  onChange={() => toggleKind('format')}
                />
                Formats
              </label>
              <label className="v2-fe-filter-check">
                <input
                  type="checkbox"
                  checked={draftFilters.kinds.includes('experience')}
                  onChange={() => toggleKind('experience')}
                />
                Experiences
              </label>
            </fieldset>

            <fieldset className="v2-fe-filter-fieldset">
              <legend>Formats</legend>
              {presentation.filterOptions.formats.map((opt) => (
                <label key={opt.id} className="v2-fe-filter-check">
                  <input
                    type="checkbox"
                    checked={draftFilters.ids.includes(opt.id)}
                    onChange={() => toggleId(opt.id)}
                  />
                  {opt.label}
                </label>
              ))}
            </fieldset>

            <fieldset className="v2-fe-filter-fieldset">
              <legend>Experiences</legend>
              {presentation.filterOptions.experiences.map((opt) => (
                <label key={opt.id} className="v2-fe-filter-check">
                  <input
                    type="checkbox"
                    checked={draftFilters.ids.includes(opt.id)}
                    onChange={() => toggleId(opt.id)}
                  />
                  {opt.label}
                </label>
              ))}
            </fieldset>

            <div className="v2-fe-filter-sheet-actions">
              <button type="button" onClick={resetFilters}>
                Reset
              </button>
              <button
                type="button"
                className="v2-fe-filter-sheet-apply"
                onClick={applyFilters}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
