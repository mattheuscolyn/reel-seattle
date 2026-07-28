/**
 * Stage 1 Build a Plan — fixture-backed replica of Build a Plan Page.png.
 *
 * Local-only form state. No planner persistence, itinerary generation,
 * travel, calendar, or production showtime queries.
 * CTA navigates to Stage 1 Build a Plan Results (fixture itineraries).
 */

import { useId, useState } from 'react';
import {
  IconAccessibility,
  IconBan,
  IconBriefcase,
  IconBuilding,
  IconCalendar,
  IconCalendarPlus,
  IconChevron,
  IconClock,
  IconClose,
  IconFilm,
  IconGlobe,
  IconLayers,
  IconMoon,
  IconParty,
  IconPin,
  IconPopcorn,
  IconSpark,
  IconSun,
  IconTicket,
  IconWalk,
  IconWallet,
  IconPlus,
} from '../icons.jsx';
import {
  applyBuildPlanPreset,
  buildPlanSummaryLines,
  createBuildPlanFormState,
  resolveBuildPlanPresentation,
} from '../fixtures/buildPlanMockupFixture.js';

const PRESET_ICONS = {
  briefcase: IconBriefcase,
  popcorn: IconPopcorn,
  ticket: IconTicket,
  clock: IconClock,
  spark: IconSpark,
};

const THEATER_ICONS = {
  globe: IconGlobe,
  ticket: IconTicket,
  building: IconBuilding,
  pin: IconPin,
};

const FINE_ICONS = {
  calendarPlus: IconCalendarPlus,
  clock: IconClock,
  walk: IconWalk,
  film: IconFilm,
  wallet: IconWallet,
  accessibility: IconAccessibility,
};

const TOGGLE_ICONS = {
  party: IconParty,
  layers: IconLayers,
  ban: IconBan,
};

function PlanToggle({ id, label, support, checked, onChange, icon: Icon }) {
  return (
    <label className="v2-bp-toggle" htmlFor={id}>
      <span className="v2-bp-toggle-icon" aria-hidden="true">
        <Icon width={16} height={16} />
      </span>
      <span className="v2-bp-toggle-copy">
        <span className="v2-bp-toggle-label">{label}</span>
        <span className="v2-bp-toggle-support">{support}</span>
      </span>
      <span className="v2-bp-switch">
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          aria-checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="v2-bp-switch-track" aria-hidden="true" />
      </span>
    </label>
  );
}

function FilmChipCard({ film, onRemove, dense = false }) {
  return (
    <div className={`v2-bp-film-card${dense ? ' v2-bp-film-card-dense' : ''}`}>
      <img className="v2-bp-film-thumb" src={film.imageUrl} alt="" />
      <span className="v2-bp-film-copy">
        <span className="v2-bp-film-title">{film.title}</span>
        <span className="v2-bp-film-detail">
          {film.theaterLabel ?? film.detailLabel}
        </span>
      </span>
      <button
        type="button"
        className="v2-bp-film-remove"
        aria-label={`Remove ${film.title}`}
        onClick={() => onRemove(film.id)}
      >
        <IconClose />
      </button>
    </div>
  );
}

function AddFilmCard({ label, onClick }) {
  return (
    <button type="button" className="v2-bp-film-add" onClick={onClick}>
      <span aria-hidden="true">
        <IconPlus width={18} height={18} />
      </span>
      <span>{label}</span>
    </button>
  );
}

/**
 * @param {{
 *   onBack: () => void,
 *   backLabel?: string,
 *   onStubAction?: (actionId: string, label: string) => void,
 *   onRequestResults?: () => void,
 * }} props
 */
export default function BuildPlanSurface({
  onBack,
  backLabel = 'Planner',
  onStubAction,
  onRequestResults,
}) {
  const presentation = resolveBuildPlanPresentation();
  const statusId = useId();
  const [form, setForm] = useState(() => createBuildPlanFormState());
  const [statusMessage, setStatusMessage] = useState(null);

  const announce = (actionId, label, message) => {
    const text =
      message ?? `${label} isn’t available in this Stage 1 Build a Plan shell yet.`;
    setStatusMessage(text);
    onStubAction?.(actionId, label);
  };

  const clearAll = () => {
    setForm(createBuildPlanFormState());
    setStatusMessage('Selections cleared to Stage 1 defaults.');
  };

  const selectPreset = (presetId) => {
    setForm((current) => {
      if (current.selectedPresetId === presetId) {
        return { ...current, selectedPresetId: null };
      }
      return applyBuildPlanPreset(presetId, current);
    });
  };

  const removeFilm = (bucket, id) => {
    setForm((current) => ({
      ...current,
      [bucket]: current[bucket].filter((f) => f.id !== id),
    }));
  };

  const resetFineTuning = () => {
    const d = createBuildPlanFormState();
    setForm((current) => ({
      ...current,
      planSize: d.planSize,
      maxGap: d.maxGap,
      walking: d.walking,
      premiumFormats: d.premiumFormats,
      budget: d.budget,
      accessibility: d.accessibility,
      includeSpecialEvents: d.includeSpecialEvents,
      allowRepeats: d.allowRepeats,
      excludeSoldOut: d.excludeSoldOut,
    }));
  };

  const handleCta = () => {
    onRequestResults?.();
    onStubAction?.('build-results', presentation.ctaLabel);
  };

  const summary = buildPlanSummaryLines(form);
  const {
    pageTitle,
    pageTagline,
    presetsLabel,
    customDividerLabel,
    clearAllLabel,
    ctaLabel,
    presets,
    when,
    what,
    where,
    fineTuning,
    summary: summaryCopy,
  } = presentation;

  const fineValues = {
    planSize: form.planSize,
    maxGap: form.maxGap,
    walking: form.walking,
    premiumFormats: form.premiumFormats,
    budget: form.budget,
    accessibility: form.accessibility,
  };

  return (
    <article
      className="v2-bp"
      aria-labelledby="v2-bp-title"
      data-build-plan-source={presentation.source}
    >
      <button
        type="button"
        className="v2-bp-back"
        aria-label={`Back to ${backLabel}`}
        onClick={onBack}
      >
        <span aria-hidden="true">←</span> {backLabel}
      </button>

      <header className="v2-bp-header" data-build-plan-section="header">
        <h1 id="v2-bp-title" className="v2-bp-title">
          {pageTitle}
        </h1>
        <p className="v2-bp-tagline">{pageTagline}</p>
      </header>

      <section
        className="v2-bp-presets"
        data-build-plan-section="presets"
        aria-labelledby="v2-bp-presets-h"
      >
        <h2 id="v2-bp-presets-h" className="v2-bp-eyebrow">
          {presetsLabel}
        </h2>
        <div
          className="v2-bp-preset-row"
          role="radiogroup"
          aria-label={presetsLabel}
        >
          {presets.map((preset) => {
            const Icon = PRESET_ICONS[preset.icon] ?? IconSpark;
            const selected = form.selectedPresetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`v2-bp-preset v2-bp-preset-${preset.accent}${
                  selected ? ' is-selected' : ''
                }`}
                onClick={() => selectPreset(preset.id)}
              >
                <span
                  className="v2-bp-preset-icon"
                  aria-hidden="true"
                >
                  <Icon />
                </span>
                <span className="v2-bp-preset-title">{preset.title}</span>
                <span className="v2-bp-preset-line">{preset.line1}</span>
                <span className="v2-bp-preset-line">{preset.line2}</span>
              </button>
            );
          })}
        </div>
      </section>

      <div
        className="v2-bp-divider"
        data-build-plan-section="customDivider"
      >
        <span className="v2-bp-divider-line" aria-hidden="true" />
        <span className="v2-bp-divider-label">{customDividerLabel}</span>
        <span className="v2-bp-divider-line" aria-hidden="true" />
        <button
          type="button"
          className="v2-bp-clear"
          aria-label={clearAllLabel}
          onClick={clearAll}
        >
          {clearAllLabel}
        </button>
      </div>

      <div className="v2-bp-custom" data-build-plan-section="custom">
        <section
          className="v2-bp-block"
          data-build-plan-section="when"
          aria-labelledby="v2-bp-when-h"
        >
          <div className="v2-bp-block-head">
            <h2 id="v2-bp-when-h" className="v2-bp-block-title">
              <span className="v2-bp-step" aria-hidden="true">
                {when.step}
              </span>
              <span>
                {when.title}{' '}
                <span className="v2-bp-block-support">{when.support}</span>
              </span>
            </h2>
            <label className="v2-bp-flex-toggle" htmlFor="v2-bp-flexible">
              <span>{when.flexibleLabel}</span>
              <span className="v2-bp-switch">
                <input
                  id="v2-bp-flexible"
                  type="checkbox"
                  role="switch"
                  checked={form.flexible}
                  aria-checked={form.flexible}
                  onChange={(e) =>
                    setForm((c) => ({ ...c, flexible: e.target.checked }))
                  }
                />
                <span className="v2-bp-switch-track" aria-hidden="true" />
              </span>
            </label>
          </div>

          <div className="v2-bp-when-card">
            <button
              type="button"
              className="v2-bp-date-row"
              aria-label={`${when.dateLabelPrefix} ${form.dateDisplay}`}
              onClick={() => announce('date-picker', 'Date picker')}
            >
              <span aria-hidden="true">
                <IconCalendar width={16} height={16} />
              </span>
              <span className="v2-bp-date-prefix">{when.dateLabelPrefix}</span>
              <span className="v2-bp-date-value">{form.dateDisplay}</span>
              <span aria-hidden="true">
                <IconChevron />
              </span>
            </button>
            <div className="v2-bp-time-row">
              <label className="v2-bp-time-field">
                <span className="v2-bp-time-label">
                  <IconSun width={14} height={14} aria-hidden="true" />
                  {when.startAfterLabel}
                </span>
                <select
                  className="v2-bp-select"
                  value={form.startAfter}
                  aria-label={when.startAfterLabel}
                  onChange={(e) =>
                    setForm((c) => ({ ...c, startAfter: e.target.value }))
                  }
                >
                  {['12:00 PM', '2:00 PM', '5:00 PM', '7:00 PM'].map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="v2-bp-time-field">
                <span className="v2-bp-time-label">
                  <IconMoon width={14} height={14} aria-hidden="true" />
                  {when.finishBeforeLabel}
                </span>
                <select
                  className="v2-bp-select"
                  value={form.finishBefore}
                  aria-label={when.finishBeforeLabel}
                  onChange={(e) =>
                    setForm((c) => ({ ...c, finishBefore: e.target.value }))
                  }
                >
                  {['9:00 PM', '10:00 PM', '11:00 PM', '12:00 AM'].map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <button
            type="button"
            className="v2-bp-text-action"
            onClick={() => announce('add-day', when.addDayLabel)}
          >
            {when.addDayLabel}
          </button>
        </section>

        <section
          className="v2-bp-block"
          data-build-plan-section="what"
          aria-labelledby="v2-bp-what-h"
        >
          <div className="v2-bp-block-head">
            <h2 id="v2-bp-what-h" className="v2-bp-block-title">
              <span className="v2-bp-step" aria-hidden="true">
                {what.step}
              </span>
              <span>
                {what.title}{' '}
                <span className="v2-bp-block-support">{what.support}</span>
              </span>
            </h2>
            <button
              type="button"
              className="v2-bp-outline-btn"
              onClick={() => announce('add-from-list', what.addFromListLabel)}
            >
              {what.addFromListLabel}
            </button>
          </div>

          <div className="v2-bp-what-group">
            <p className="v2-bp-must-label">{what.mustIncludeLabel}</p>
            <div className="v2-bp-film-row">
              {form.mustInclude.map((film) => (
                <FilmChipCard
                  key={film.id}
                  film={film}
                  onRemove={(id) => removeFilm('mustInclude', id)}
                />
              ))}
              <AddFilmCard
                label={what.addFilmLabel}
                onClick={() => announce('add-must', what.addFilmLabel)}
              />
            </div>
          </div>

          <div className="v2-bp-what-group">
            <p className="v2-bp-opt-label">
              <span>{what.wouldLoveLabel}</span>
              <span className="v2-bp-optional">{what.optionalLabel}</span>
            </p>
            <div className="v2-bp-film-grid">
              {form.wouldLove.map((film) => (
                <FilmChipCard
                  key={film.id}
                  film={film}
                  dense
                  onRemove={(id) => removeFilm('wouldLove', id)}
                />
              ))}
              <AddFilmCard
                label={what.addFilmLabel}
                onClick={() => announce('add-love', what.addFilmLabel)}
              />
            </div>
          </div>

          <div className="v2-bp-what-group">
            <p className="v2-bp-opt-label">
              <span>{what.notInterestedLabel}</span>
              <span className="v2-bp-optional">{what.optionalLabel}</span>
            </p>
            <div className="v2-bp-film-grid">
              {form.notInterested.map((film) => (
                <FilmChipCard
                  key={film.id}
                  film={film}
                  dense
                  onRemove={(id) => removeFilm('notInterested', id)}
                />
              ))}
              <AddFilmCard
                label={what.addFilmLabel}
                onClick={() => announce('add-ni', what.addFilmLabel)}
              />
            </div>
          </div>

          <button
            type="button"
            className="v2-bp-more-options"
            onClick={() => announce('more-options', what.moreOptionsLabel)}
          >
            {what.moreOptionsLabel}
            <span aria-hidden="true">
              <IconChevron />
            </span>
          </button>
        </section>

        <section
          className="v2-bp-block"
          data-build-plan-section="where"
          aria-labelledby="v2-bp-where-h"
        >
          <h2 id="v2-bp-where-h" className="v2-bp-block-title">
            <span className="v2-bp-step" aria-hidden="true">
              {where.step}
            </span>
            <span>
              {where.title}{' '}
              <span className="v2-bp-block-support">{where.support}</span>
            </span>
          </h2>
          <div
            className="v2-bp-where-row"
            role="radiogroup"
            aria-label={where.title}
          >
            {where.theaterPrefs.map((pref) => {
              const Icon = THEATER_ICONS[pref.icon] ?? IconGlobe;
              const selected = form.theaterPrefId === pref.id;
              return (
                <button
                  key={pref.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`v2-bp-where-card${selected ? ' is-selected' : ''}`}
                  onClick={() =>
                    setForm((c) => ({ ...c, theaterPrefId: pref.id }))
                  }
                >
                  {selected ? (
                    <span className="v2-bp-where-check" aria-hidden="true">
                      ✓
                    </span>
                  ) : null}
                  <span className="v2-bp-where-icon" aria-hidden="true">
                    <Icon />
                  </span>
                  <span className="v2-bp-where-title">{pref.title}</span>
                  <span className="v2-bp-where-detail">{pref.detail}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="v2-bp-location"
            aria-label={`${where.locationLabel}: ${form.locationDisplay}`}
            onClick={() => announce('edit-location', where.editLabel)}
          >
            <span aria-hidden="true">
              <IconPin width={16} height={16} />
            </span>
            <span className="v2-bp-location-label">{where.locationLabel}</span>
            <span className="v2-bp-location-value">{form.locationDisplay}</span>
            <span className="v2-bp-location-edit">
              {where.editLabel}
              <IconChevron />
            </span>
          </button>
        </section>

        <section
          className="v2-bp-block"
          data-build-plan-section="fineTuning"
          aria-labelledby="v2-bp-fine-h"
        >
          <div className="v2-bp-block-head">
            <h2 id="v2-bp-fine-h" className="v2-bp-block-title">
              <span className="v2-bp-step" aria-hidden="true">
                {fineTuning.step}
              </span>
              <span>
                {fineTuning.title}{' '}
                <span className="v2-bp-block-support">{fineTuning.support}</span>
              </span>
            </h2>
            <button
              type="button"
              className="v2-bp-text-action"
              onClick={resetFineTuning}
            >
              {fineTuning.resetLabel}
            </button>
          </div>
          <div className="v2-bp-fine-grid">
            {fineTuning.fields.map((field) => {
              const Icon = FINE_ICONS[field.icon] ?? IconFilm;
              return (
                <button
                  key={field.id}
                  type="button"
                  className="v2-bp-fine-card"
                  onClick={() => announce(`fine-${field.id}`, field.label)}
                >
                  <span className="v2-bp-fine-icon" aria-hidden="true">
                    <Icon width={16} height={16} />
                  </span>
                  <span className="v2-bp-fine-copy">
                    <span className="v2-bp-fine-label">{field.label}</span>
                    <span className="v2-bp-fine-value">
                      {fineValues[field.id]}
                    </span>
                  </span>
                  <span aria-hidden="true">
                    <IconChevron />
                  </span>
                </button>
              );
            })}
          </div>
          <div className="v2-bp-fine-toggles">
            {fineTuning.toggles.map((toggle) => {
              const Icon = TOGGLE_ICONS[toggle.icon] ?? IconParty;
              return (
                <PlanToggle
                  key={toggle.id}
                  id={`v2-bp-${toggle.id}`}
                  label={toggle.label}
                  support={toggle.support}
                  icon={Icon}
                  checked={Boolean(form[toggle.id])}
                  onChange={(checked) =>
                    setForm((c) => ({ ...c, [toggle.id]: checked }))
                  }
                />
              );
            })}
          </div>
        </section>
      </div>

      <footer
        className="v2-bp-summary"
        data-build-plan-section="summaryCta"
        aria-label={summaryCopy.title}
      >
        <div className="v2-bp-summary-card">
          <h2 className="v2-bp-summary-title">{summaryCopy.title}</h2>
          <ul className="v2-bp-summary-meta">
            <li>
              <IconCalendar width={14} height={14} aria-hidden="true" />
              <span>{summary.dateShort}</span>
            </li>
            <li>
              <IconClock width={14} height={14} aria-hidden="true" />
              <span>{summary.timeWindow}</span>
            </li>
            <li>
              <IconFilm width={14} height={14} aria-hidden="true" />
              <span>{summary.planSize}</span>
            </li>
            <li>
              <IconPin width={14} height={14} aria-hidden="true" />
              <span>{summary.locationShort}</span>
            </li>
          </ul>
          <p className="v2-bp-summary-detail">{summary.detailLine}</p>
          <button
            type="button"
            className="v2-bp-cta"
            aria-label={ctaLabel}
            onClick={handleCta}
          >
            <IconSpark aria-hidden="true" />
            <span>{ctaLabel}</span>
          </button>
        </div>
      </footer>

      <p
        id={statusId}
        className="v2-visually-hidden"
        role="status"
        aria-live="polite"
      >
        {statusMessage ?? ''}
      </p>
    </article>
  );
}
