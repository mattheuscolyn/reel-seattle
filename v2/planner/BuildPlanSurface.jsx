/**
 * Build a Plan — config form for same-theater live Results (T-PENG-01).
 *
 * Single-open accordion (When / What / Where / Fine tuning).
 * Mockup QC: `?buildPlanMockup=1` (+ optional `section=`).
 * Production form: live Pacific defaults + empty film buckets.
 */

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  IconBriefcase,
  IconBuilding,
  IconCalendar,
  IconChevron,
  IconClock,
  IconGlobe,
  IconPeople,
  IconPin,
  IconPopcorn,
  IconSliders,
  IconSpark,
  IconTarget,
  IconTicket,
  IconPlus,
} from '../icons.jsx';
import {
  applyBuildPlanPreset,
  buildPlanSummaryLines,
  createBuildPlanFormState,
  getBuildPlanMockupOpenSection,
  isBuildPlanMockupMode,
  resolveBuildPlanPresentation,
} from '../fixtures/buildPlanMockupFixture.js';
import { createLiveBuildPlanFormState, formatBuildPlanDateDisplay } from './createLiveBuildPlanFormState.js';
import {
  adjustBuildPlanAccordionScroll,
  nextOpenSection,
} from './buildPlanAccordion.js';
import {
  ensureBuildPlanFormSession,
  setBuildPlanFormSession,
  subscribeBuildPlanFormSession,
} from './buildPlanFormSession.js';
import { MUST_INCLUDE_MAX } from './buildPlanFilmManageConfig.js';
import {
  addIsoDays,
  formatCompactDateLabel,
  pacificDateString,
} from '../explore/exploreCatalog.js';
import {
  MAX_BREAK_PRESETS,
  MIN_BREAK_PRESETS,
  formatBreakMinutes,
} from './planBreakRange.js';
import { formatPlanSizeLabel, normalizePlanSize } from './planSize.js';

const PLAN_SIZE_OPTIONS = Object.freeze([
  '1 movie',
  '1–3 movies',
  '2 movies',
  '2–4 movies',
  '3 movies',
  'As many as possible',
]);

const START_AFTER_OPTIONS = Object.freeze([
  '10:00 AM',
  '11:00 AM',
  '12:00 PM',
  '2:00 PM',
  '5:00 PM',
  '7:00 PM',
]);

const FINISH_BEFORE_OPTIONS = Object.freeze([
  '9:00 PM',
  '10:00 PM',
  '11:00 PM',
  '12:00 AM',
]);

const LAUNCH_THEATER_PREF_IDS = Object.freeze(['any', 'amc', 'indie', 'custom']);

const PRESET_ICONS = {
  briefcase: IconBriefcase,
  popcorn: IconPopcorn,
  ticket: IconTicket,
  clock: IconClock,
  spark: IconSpark,
};

const SECTION_ICONS = {
  when: IconCalendar,
  what: IconTarget,
  where: IconPin,
  fineTuning: IconSliders,
};

const THEATER_ICONS = {
  globe: IconGlobe,
  ticket: IconTicket,
  building: IconBuilding,
  pin: IconPin,
};

function PlanToggle({ id, label, checked, onChange }) {
  return (
    <label className="v2-bp-toggle" htmlFor={id}>
      <span className="v2-bp-toggle-label">{label}</span>
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

function MustFilmRow({ film, onOpen }) {
  return (
    <button
      type="button"
      className="v2-bp-must-row"
      onClick={onOpen}
      aria-label={film.title}
    >
      <img className="v2-bp-must-thumb" src={film.imageUrl} alt="" />
      <span className="v2-bp-film-copy">
        <span className="v2-bp-film-title">{film.title}</span>
        <span className="v2-bp-film-detail">
          {film.detailLabel ?? film.theaterLabel}
        </span>
      </span>
      <span className="v2-bp-row-chevron" aria-hidden="true">
        <IconChevron width={14} height={14} />
      </span>
    </button>
  );
}

function FilmChipRow({ films, moreLabel, onMore }) {
  const visible = films.slice(0, 2);
  const rest = Math.max(0, films.length - visible.length);
  return (
    <div className="v2-bp-chip-row">
      {visible.map((film) => (
        <span key={film.id} className="v2-bp-chip">
          <img className="v2-bp-chip-thumb" src={film.imageUrl} alt="" />
          <span className="v2-bp-chip-title">{film.title}</span>
        </span>
      ))}
      {rest > 0 ? (
        <button type="button" className="v2-bp-chip v2-bp-chip-more" onClick={onMore}>
          {moreLabel ?? `+ ${rest} more`}
        </button>
      ) : null}
    </div>
  );
}

/**
 * @param {{
 *   onBack: () => void,
 *   backLabel?: string,
 *   onStubAction?: (actionId: string, label: string) => void,
 *   onRequestResults?: (form: object) => void,
 *   onOpenFilmManage?: (mode: 'mustInclude' | 'wouldLove' | 'notInterested') => void,
 *   onOpenTheaterManage?: () => void,
 *   resumeOpenSection?: null | 'when' | 'what' | 'where' | 'fineTuning',
 * }} props
 */
export default function BuildPlanSurface({
  onBack,
  backLabel = 'Planner',
  onStubAction,
  onRequestResults,
  onOpenFilmManage,
  onOpenTheaterManage,
  resumeOpenSection = null,
}) {
  const presentation = resolveBuildPlanPresentation();
  const mockupMode = isBuildPlanMockupMode();
  const statusId = useId();
  const [form, setFormLocal] = useState(() =>
    ensureBuildPlanFormSession(() =>
      mockupMode ? createBuildPlanFormState() : createLiveBuildPlanFormState(),
    ),
  );
  const [openSection, setOpenSection] = useState(() => {
    if (resumeOpenSection) return resumeOpenSection;
    return mockupMode ? getBuildPlanMockupOpenSection() : null;
  });
  const [statusMessage, setStatusMessage] = useState(null);
  const [ctaBusy, setCtaBusy] = useState(false);
  const scrollIntentRef = useRef(null);
  const headerRefs = useRef({});
  const resumedScrollRef = useRef(false);

  const setForm = useCallback((updater) => {
    setFormLocal((current) => {
      const next = typeof updater === 'function' ? updater(current) : updater;
      setBuildPlanFormSession(next);
      return next;
    });
  }, []);

  useEffect(() => {
    return subscribeBuildPlanFormSession((next) => {
      if (!next) return;
      setFormLocal(next);
    });
  }, []);

  useLayoutEffect(() => {
    if (resumedScrollRef.current) return;
    if (resumeOpenSection !== 'what') return;
    resumedScrollRef.current = true;
    const headerEl = headerRefs.current.what;
    if (headerEl) {
      headerEl.scrollIntoView({ block: 'start' });
      window.scrollBy(0, -72);
    }
  }, [resumeOpenSection]);

  const announce = (actionId, label, message) => {
    const text =
      message ?? `${label} isn’t available in this Build a Plan shell yet.`;
    setStatusMessage(text);
    onStubAction?.(actionId, label);
  };

  const setPlanDate = (dateIso) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return;
    setForm((c) => ({
      ...c,
      dateIso,
      dateDisplay: formatBuildPlanDateDisplay(dateIso),
      dateShort: formatCompactDateLabel(dateIso),
    }));
  };

  const todayIso = pacificDateString(new Date());
  const tomorrowIso = addIsoDays(todayIso, 1);
  const maxDateIso = addIsoDays(todayIso, 14);

  const openManage = (manageMode) => {
    if (typeof onOpenFilmManage === 'function') {
      onOpenFilmManage(manageMode);
      return;
    }
    announce(`manage-${manageMode}`, 'Manage');
  };

  const selectPreset = (presetId) => {
    setForm((current) => {
      if (current.selectedPresetId === presetId) {
        return { ...current, selectedPresetId: null };
      }
      return applyBuildPlanPreset(presetId, current);
    });
  };

  const handleCta = () => {
    if (ctaBusy) return;
    setCtaBusy(true);
    onRequestResults?.(form);
    onStubAction?.('build-results', presentation.ctaLabel);
    window.setTimeout(() => setCtaBusy(false), 600);
  };

  const toggleSection = useCallback(
    (targetId) => {
      const next = nextOpenSection(openSection, targetId);
      const focusId = next ?? openSection ?? targetId;
      const headerEl = headerRefs.current[focusId] ?? null;
      const beforeTop = headerEl?.getBoundingClientRect().top ?? null;
      let mode = 'collapse';
      if (next && openSection && next !== openSection) mode = 'switch';
      else if (next) mode = 'open';
      scrollIntentRef.current = {
        sectionId: focusId,
        beforeTop,
        mode,
      };
      setOpenSection(next);
    },
    [openSection],
  );

  useLayoutEffect(() => {
    const intent = scrollIntentRef.current;
    if (!intent) return;
    scrollIntentRef.current = null;
    const headerEl = headerRefs.current[intent.sectionId] ?? null;
    adjustBuildPlanAccordionScroll({
      headerEl,
      beforeTop: intent.beforeTop,
      mode: intent.mode,
    });
    headerEl?.focus?.({ preventScroll: true });
  }, [openSection]);

  const summary = buildPlanSummaryLines(form);
  const {
    pageTitle,
    pageTagline,
    presetsLabel,
    customDividerLabel,
    ctaLabel,
    presets,
    when,
    what,
    where,
    fineTuning,
  } = presentation;

  const launchTheaterPrefs = where.theaterPrefs.filter((pref) =>
    LAUNCH_THEATER_PREF_IDS.includes(pref.id),
  );

  const collapsed = summary.collapsed;
  const source = mockupMode ? 'build-plan-mockup' : 'live-form';

  const renderAccordion = (id, title, summaryText, panel, titleNode = null) => {
    const expanded = openSection === id;
    const panelId = `v2-bp-panel-${id}`;
    const Icon = SECTION_ICONS[id] ?? IconSpark;
    const step =
      id === 'when'
        ? when.step
        : id === 'what'
          ? what.step
          : id === 'where'
            ? where.step
            : fineTuning.step;

    const summaryParts =
      typeof summaryText === 'string' && summaryText.includes('Flexible')
        ? summaryText.split(/(Flexible)/)
        : null;

    return (
      <section
        className={`v2-bp-acc${expanded ? ' is-open' : ''}`}
        data-build-plan-section={id}
        data-bp-accordion={id}
      >
        <h2 className="v2-bp-acc-heading">
          <button
            type="button"
            className="v2-bp-acc-trigger"
            id={`v2-bp-acc-${id}`}
            aria-expanded={expanded}
            aria-controls={panelId}
            ref={(el) => {
              headerRefs.current[id] = el;
            }}
            onClick={() => toggleSection(id)}
          >
            <span className="v2-bp-acc-icon" aria-hidden="true">
              <Icon width={20} height={20} />
            </span>
            <span className="v2-bp-step" aria-hidden="true">
              {step}
            </span>
            <span className="v2-bp-acc-copy">
              <span className="v2-bp-acc-title">
                {titleNode ?? title}
              </span>
              {!expanded ? (
                <span className="v2-bp-acc-summary">
                  {summaryParts
                    ? summaryParts.map((part, i) =>
                        part === 'Flexible' ? (
                          <span key={i} className="v2-bp-acc-flex-mark">
                            Flexible
                          </span>
                        ) : (
                          <span key={i}>{part}</span>
                        ),
                      )
                    : summaryText}
                </span>
              ) : null}
            </span>
            <span
              className={`v2-bp-acc-chevron${expanded ? ' is-open' : ''}`}
              aria-hidden="true"
            >
              <IconChevron />
            </span>
          </button>
        </h2>
        <div
          id={panelId}
          role="region"
          aria-labelledby={`v2-bp-acc-${id}`}
          className="v2-bp-acc-panel"
          hidden={!expanded}
        >
          {expanded ? panel : null}
        </div>
      </section>
    );
  };

  return (
    <article
      className="v2-bp"
      aria-labelledby="v2-bp-title"
      data-build-plan-source={source}
      data-bp-open-section={openSection ?? 'none'}
    >
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
                {selected ? (
                  <span className="v2-bp-preset-check" aria-hidden="true">
                    ✓
                  </span>
                ) : null}
                <span className="v2-bp-preset-icon" aria-hidden="true">
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

      <div className="v2-bp-divider" data-build-plan-section="customDivider">
        <span className="v2-bp-divider-line" aria-hidden="true" />
        <span className="v2-bp-divider-label">{customDividerLabel}</span>
        <span className="v2-bp-divider-line" aria-hidden="true" />
      </div>

      <div className="v2-bp-custom" data-build-plan-section="custom">
        {renderAccordion(
          'when',
          when.title,
          collapsed.when,
          <div className="v2-bp-acc-body">
            <div className="v2-bp-when-fields">
              <p className="v2-bp-field-label">{when.dateLabelPrefix}</p>
              <div className="v2-bp-date-controls">
                <label className="v2-bp-date-row v2-bp-date-input-row">
                  <span aria-hidden="true">
                    <IconCalendar width={16} height={16} />
                  </span>
                  <input
                    type="date"
                    className="v2-bp-date-input"
                    aria-label={`${when.dateLabelPrefix} ${form.dateDisplay}`}
                    value={form.dateIso ?? todayIso}
                    min={todayIso}
                    max={maxDateIso}
                    onChange={(e) => setPlanDate(e.target.value)}
                  />
                  <span className="v2-bp-date-value">{form.dateDisplay}</span>
                </label>
                <div className="v2-bp-date-quick" role="group" aria-label="Quick dates">
                  <button
                    type="button"
                    className={`v2-bp-date-chip${
                      form.dateIso === todayIso ? ' is-selected' : ''
                    }`}
                    aria-pressed={form.dateIso === todayIso}
                    onClick={() => setPlanDate(todayIso)}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    className={`v2-bp-date-chip${
                      form.dateIso === tomorrowIso ? ' is-selected' : ''
                    }`}
                    aria-pressed={form.dateIso === tomorrowIso}
                    onClick={() => setPlanDate(tomorrowIso)}
                  >
                    Tomorrow
                  </button>
                </div>
              </div>
              <p className="v2-bp-field-label">{when.timeWindowLabel}</p>
              <div className="v2-bp-time-row">
                <label className="v2-bp-time-field">
                  <span className="v2-visually-hidden">{when.startAfterLabel}</span>
                  <select
                    className="v2-bp-select"
                    value={form.startAfter}
                    aria-label={when.startAfterLabel}
                    onChange={(e) =>
                      setForm((c) => ({ ...c, startAfter: e.target.value }))
                    }
                  >
                    {(START_AFTER_OPTIONS.includes(form.startAfter)
                      ? START_AFTER_OPTIONS
                      : [form.startAfter, ...START_AFTER_OPTIONS]
                    ).map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="v2-bp-time-sep" aria-hidden="true">
                  –
                </span>
                <label className="v2-bp-time-field">
                  <span className="v2-visually-hidden">
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
                    {(FINISH_BEFORE_OPTIONS.includes(form.finishBefore)
                      ? FINISH_BEFORE_OPTIONS
                      : [form.finishBefore, ...FINISH_BEFORE_OPTIONS]
                    ).map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </div>,
        )}

        {renderAccordion(
          'where',
          where.title,
          collapsed.where,
          <div className="v2-bp-acc-body">
            <p className="v2-bp-field-label">{where.theaterPreferenceLabel}</p>
            <div
              className="v2-bp-where-row"
              role="radiogroup"
              aria-label={where.theaterPreferenceLabel}
            >
              {launchTheaterPrefs.map((pref) => {
                const Icon = THEATER_ICONS[pref.icon] ?? IconGlobe;
                const selected = form.theaterPrefId === pref.id;
                return (
                  <button
                    key={pref.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={`v2-bp-where-card${selected ? ' is-selected' : ''}`}
                    onClick={() => {
                      setForm((c) => ({ ...c, theaterPrefId: pref.id }));
                      if (pref.id === 'custom' && typeof onOpenTheaterManage === 'function') {
                        setTimeout(() => onOpenTheaterManage(), 100);
                      }
                    }}
                  >
                    {selected ? (
                      <span className="v2-bp-where-check" aria-hidden="true">
                        ✓
                      </span>
                    ) : null}
                    <span className="v2-bp-where-icon" aria-hidden="true">
                      <Icon width={18} height={18} />
                    </span>
                    <span className="v2-bp-where-title">{pref.title}</span>
                  </button>
                );
              })}
            </div>
            {form.theaterPrefId === 'custom' ? (
              <div className="v2-bp-theater-manage">
                <p className="v2-bp-theater-count">
                  {(form.selectedTheaters ?? []).length} {(form.selectedTheaters ?? []).length === 1 ? 'theater' : 'theaters'} selected
                </p>
                <button
                  type="button"
                  className="v2-bp-manage"
                  onClick={() => {
                    if (typeof onOpenTheaterManage === 'function') {
                      onOpenTheaterManage();
                    } else {
                      announce('manage-theaters', 'Manage theaters');
                    }
                  }}
                >
                  Manage
                </button>
              </div>
            ) : null}
          </div>,
        )}
        {renderAccordion(
          'what',
          what.title,
          collapsed.what,
          <div className="v2-bp-acc-body">
            <p className="v2-bp-acc-lead">{what.support}</p>

            <div className="v2-bp-what-group">
              <div className="v2-bp-what-head">
                <p className="v2-bp-must-label">{what.mustIncludeLabel}</p>
                <button
                  type="button"
                  className="v2-bp-manage"
                  onClick={() => openManage('mustInclude')}
                >
                  {what.manageLabel}
                </button>
              </div>
              <div className="v2-bp-film-stack">
                {form.mustInclude.map((film) => (
                  <MustFilmRow
                    key={film.id}
                    film={film}
                    onOpen={() => openManage('mustInclude')}
                  />
                ))}
                {form.mustInclude.length < MUST_INCLUDE_MAX ? (
                  <button
                    type="button"
                    className="v2-bp-film-add"
                    onClick={() => openManage('mustInclude')}
                  >
                    <span aria-hidden="true">
                      <IconPlus width={14} height={14} />
                    </span>
                    <span>{what.addAnotherLabel}</span>
                  </button>
                ) : null}
              </div>
            </div>

            <div className="v2-bp-what-group">
              <div className="v2-bp-what-head">
                <p className="v2-bp-opt-label">{what.wouldLoveLabel}</p>
                <button
                  type="button"
                  className="v2-bp-manage"
                  onClick={() => openManage('wouldLove')}
                >
                  {what.manageLabel}
                </button>
              </div>
              {form.wouldLove.length === 0 ? (
                <p className="v2-bp-empty-hint">No films added yet</p>
              ) : (
                <FilmChipRow
                  films={form.wouldLove}
                  onMore={() => openManage('wouldLove')}
                />
              )}
            </div>

            <div className="v2-bp-what-group">
              <div className="v2-bp-what-head">
                <p className="v2-bp-opt-label">{what.notInterestedLabel}</p>
                <button
                  type="button"
                  className="v2-bp-manage"
                  onClick={() => openManage('notInterested')}
                >
                  {what.manageLabel}
                </button>
              </div>
              {form.notInterested.length > 0 ? (
                <p className="v2-bp-excluded-count">
                  {form.notInterested.length} films excluded
                </p>
              ) : null}
              {form.notInterested.length === 0 ? (
                <p className="v2-bp-empty-hint">No exclusions yet</p>
              ) : (
                <FilmChipRow
                  films={form.notInterested}
                  onMore={() => openManage('notInterested')}
                />
              )}
            </div>
          </div>,
        )}

        {renderAccordion(
          'fineTuning',
          fineTuning.title,
          collapsed.fineTuning,
          <div className="v2-bp-acc-body">
            <div className="v2-bp-fine-grid v2-bp-fine-grid-live">
              <label className="v2-bp-fine-field">
                <span className="v2-bp-fine-label">Plan size</span>
                <select
                  className="v2-bp-select"
                  value={formatPlanSizeLabel(form.planSize)}
                  aria-label="Plan size"
                  onChange={(e) =>
                    setForm((c) => ({
                      ...c,
                      planSize: normalizePlanSize(e.target.value),
                    }))
                  }
                >
                  {(PLAN_SIZE_OPTIONS.includes(
                    formatPlanSizeLabel(form.planSize),
                  )
                    ? PLAN_SIZE_OPTIONS
                    : [
                        formatPlanSizeLabel(form.planSize),
                        ...PLAN_SIZE_OPTIONS,
                      ]
                  ).map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </label>
              <label className="v2-bp-fine-field">
                <span className="v2-bp-fine-label">Minimum break</span>
                <select
                  className="v2-bp-select"
                  value={form.minGap ?? 'Any'}
                  aria-label="Minimum break"
                  onChange={(e) =>
                    setForm((c) => ({ ...c, minGap: e.target.value }))
                  }
                >
                  <option value="Any">Any</option>
                  {MIN_BREAK_PRESETS.map((p) => (
                    <option key={p.id} value={formatBreakMinutes(p.minutes)}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="v2-bp-fine-field">
                <span className="v2-bp-fine-label">Maximum break</span>
                <select
                  className="v2-bp-select"
                  value={form.maxGap}
                  aria-label="Maximum break"
                  onChange={(e) =>
                    setForm((c) => ({ ...c, maxGap: e.target.value }))
                  }
                >
                  {MAX_BREAK_PRESETS.map((p) => {
                    const value =
                      p.minutes == null
                        ? 'Any'
                        : p.minutes === 90
                          ? '90 min'
                          : formatBreakMinutes(p.minutes);
                    return (
                      <option key={p.id} value={value}>
                        {p.label}
                      </option>
                    );
                  })}
                  {!['Any', '90 min', '60 min', '120 min', '150 min', '1h', '2h', '2h 30m'].includes(
                    form.maxGap,
                  ) && form.maxGap ? (
                    <option value={form.maxGap}>{form.maxGap}</option>
                  ) : null}
                </select>
              </label>
            </div>
            <div className="v2-bp-fine-toggles">
              <PlanToggle
                id="v2-bp-allowRepeats"
                label="Allow repeat films"
                checked={Boolean(form.allowRepeats)}
                onChange={(checked) =>
                  setForm((c) => ({ ...c, allowRepeats: checked }))
                }
              />
            </div>
            <p className="v2-bp-fine-note">
              Break length is the idle time between one film’s expected end and
              the next start (transfer time must also fit inside that window).
            </p>
          </div>,
          <>
            {fineTuning.title}{' '}
            <span className="v2-bp-acc-optional">(optional)</span>
          </>,
        )}
      </div>

      <footer
        className="v2-bp-summary"
        data-build-plan-section="summaryCta"
        aria-label="Plan summary"
      >
        <div className="v2-bp-summary-card">
          <ul className="v2-bp-summary-meta">
            <li>
              <IconCalendar width={14} height={14} aria-hidden="true" />
              <span>{summary.line1}</span>
            </li>
            <li>
              <IconPeople width={14} height={14} aria-hidden="true" />
              <span>{summary.line2}</span>
            </li>
          </ul>
          <button
            type="button"
            className="v2-bp-cta"
            aria-label={ctaLabel}
            disabled={ctaBusy}
            onClick={handleCta}
          >
            <span>{ctaLabel}</span>
            <IconSpark aria-hidden="true" />
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
