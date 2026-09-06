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
import {
  PLAN_SIZE_COUNT_OPTIONS,
  planSizeFromUiMode,
  planSizeUiMode,
} from './planSizeUi.js';
import {
  formatLockedShowtimeDetail,
  isLockedShowtimeEligibleUnderForm,
  removeLockedShowtimeFromForm,
} from './buildPlanPerformanceCatalog.js';
import {
  filmCardHasEligibleShowtimes,
} from './buildPlanFilmCatalog.js';
import { resolveBuildPlanHardConstraints } from './buildPlanHardConstraints.js';
import { validateBuildPlanDraftForGenerate } from './buildPlanDraftValidation.js';
import {
  conflictsForFilmCard,
  conflictsForPerformance,
  formatPlannerConflictMessages,
} from './buildPlanConflictCopy.js';
import {
  buildPlanClockToHtmlTime,
  formatBuildPlanTimeWindowSummary,
  htmlTimeToBuildPlanFinish,
  htmlTimeToBuildPlanStart,
  resolveFinishBeforeNextDayFlag,
} from './buildPlanTimeWindow.js';

const PLAN_SIZE_MODE_OPTIONS = Object.freeze([
  { id: 'exact', label: 'Exactly' },
  { id: 'range', label: 'Range' },
  { id: 'max', label: 'As many as possible' },
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

function MustFilmRow({ film, onOpen, warning = null }) {
  return (
    <button
      type="button"
      className={`v2-bp-must-row${warning ? ' is-ineligible' : ''}`}
      onClick={onOpen}
      aria-label={film.title}
    >
      <img className="v2-bp-must-thumb" src={film.imageUrl} alt="" />
      <span className="v2-bp-film-copy">
        <span className="v2-bp-film-title">{film.title}</span>
        <span className="v2-bp-film-detail">
          {warning ?? film.detailLabel ?? film.theaterLabel}
        </span>
      </span>
      <span className="v2-bp-row-chevron" aria-hidden="true">
        <IconChevron width={14} height={14} />
      </span>
    </button>
  );
}

function LockedShowtimeRow({ lock, warning = null, onRemove }) {
  return (
    <div
      className={`v2-bp-locked-row${warning ? ' is-incompatible' : ''}`}
      data-performance-key={lock.performanceKey}
    >
      {lock.posterUrl ? (
        <img className="v2-bp-must-thumb" src={lock.posterUrl} alt="" />
      ) : (
        <span className="v2-bp-must-thumb v2-bp-must-thumb-fallback" />
      )}
      <span className="v2-bp-film-copy">
        <span className="v2-bp-film-title">
          <span className="v2-bp-lock-mark" aria-hidden="true">
            Locked
          </span>{' '}
          {lock.title}
        </span>
        <span className="v2-bp-film-detail">
          {warning ?? formatLockedShowtimeDetail(lock)}
        </span>
      </span>
      <button
        type="button"
        className="v2-bp-locked-remove"
        aria-label={`Remove locked showtime ${lock.title}`}
        onClick={onRemove}
      >
        Remove
      </button>
    </div>
  );
}

function TimeBoundControl({
  startAfter,
  finishBefore,
  finishBeforeNextDay,
  startLabel,
  finishLabel,
  onChange,
}) {
  const startCustom = startAfter != null;
  const finishCustom = finishBefore != null;
  const startHtml = buildPlanClockToHtmlTime(startAfter) || '12:00';
  const finishHtml = buildPlanClockToHtmlTime(finishBefore) || '23:00';

  return (
    <div className="v2-bp-time-window" role="group" aria-label="Time window">
      <div className="v2-bp-time-bound">
        <span className="v2-bp-time-bound-label">{startLabel}</span>
        <div
          className="v2-bp-time-bound-modes"
          role="radiogroup"
          aria-label={startLabel}
        >
          <button
            type="button"
            role="radio"
            aria-checked={!startCustom}
            className={`v2-bp-time-bound-mode${!startCustom ? ' is-selected' : ''}`}
            onClick={() => onChange({ startAfter: null })}
          >
            No limit
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={startCustom}
            className={`v2-bp-time-bound-mode${startCustom ? ' is-selected' : ''}`}
            onClick={() => {
              if (!startCustom) {
                onChange({ startAfter: htmlTimeToBuildPlanStart('12:00') });
              }
            }}
          >
            Custom
          </button>
        </div>
        {startCustom ? (
          <label className="v2-bp-time-input-row">
            <span className="v2-visually-hidden">{startLabel} time</span>
            <input
              type="time"
              className="v2-bp-time-input"
              value={startHtml}
              aria-label={`${startLabel} time`}
              onChange={(e) => {
                const clock = htmlTimeToBuildPlanStart(e.target.value);
                if (clock) onChange({ startAfter: clock });
              }}
            />
            <span className="v2-bp-time-input-value" aria-hidden="true">
              {startAfter}
            </span>
          </label>
        ) : null}
      </div>

      <div className="v2-bp-time-bound">
        <span className="v2-bp-time-bound-label">{finishLabel}</span>
        <div
          className="v2-bp-time-bound-modes"
          role="radiogroup"
          aria-label={finishLabel}
        >
          <button
            type="button"
            role="radio"
            aria-checked={!finishCustom}
            className={`v2-bp-time-bound-mode${!finishCustom ? ' is-selected' : ''}`}
            onClick={() =>
              onChange({ finishBefore: null, finishBeforeNextDay: false })
            }
          >
            No limit
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={finishCustom}
            className={`v2-bp-time-bound-mode${finishCustom ? ' is-selected' : ''}`}
            onClick={() => {
              if (!finishCustom) {
                const next = htmlTimeToBuildPlanFinish('23:00');
                onChange({
                  finishBefore: next.clock,
                  finishBeforeNextDay: next.finishBeforeNextDay,
                });
              }
            }}
          >
            Custom
          </button>
        </div>
        {finishCustom ? (
          <div className="v2-bp-time-finish-row">
            <label className="v2-bp-time-input-row">
              <span className="v2-visually-hidden">{finishLabel} time</span>
              <input
                type="time"
                className="v2-bp-time-input"
                value={finishHtml}
                aria-label={`${finishLabel} time`}
                onChange={(e) => {
                  const next = htmlTimeToBuildPlanFinish(e.target.value);
                  if (next.clock) {
                    onChange({
                      finishBefore: next.clock,
                      finishBeforeNextDay: next.finishBeforeNextDay,
                    });
                  }
                }}
              />
              <span className="v2-bp-time-input-value" aria-hidden="true">
                {finishBefore}
              </span>
            </label>
            {finishBeforeNextDay ? (
              <span className="v2-bp-time-nextday" title="Next calendar day">
                +1 day
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PlanSizeControl({ planSize, onChange }) {
  const size = normalizePlanSize(planSize);
  const mode = planSizeUiMode(size);
  return (
    <div
      className={`v2-bp-plan-size v2-bp-plan-size--${mode}`}
      role="group"
      aria-label="Plan size"
      data-plan-size-mode={mode}
    >
      <span className="v2-bp-fine-label">Plan size</span>
      <div
        className="v2-bp-plan-size-modes"
        role="radiogroup"
        aria-label="Plan size mode"
      >
        {PLAN_SIZE_MODE_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={mode === opt.id}
            className={`v2-bp-plan-size-mode${mode === opt.id ? ' is-selected' : ''}`}
            onClick={() => {
              if (opt.id === 'exact') {
                onChange(planSizeFromUiMode('exact', { exact: size.min }));
              } else if (opt.id === 'range') {
                const min = size.min;
                const max =
                  size.max === size.min
                    ? Math.min(6, size.min + 2)
                    : size.max;
                onChange(planSizeFromUiMode('range', { min, max }));
              } else {
                onChange(planSizeFromUiMode('max'));
              }
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {mode === 'exact' ? (
        <label className="v2-bp-plan-size-field v2-bp-plan-size-field-exact">
          <span className="v2-bp-plan-size-sublabel">Films</span>
          <select
            className="v2-bp-select"
            value={size.min}
            aria-label="Exact film count"
            onChange={(e) =>
              onChange(
                planSizeFromUiMode('exact', { exact: Number(e.target.value) }),
              )
            }
          >
            {PLAN_SIZE_COUNT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n === 1 ? '1 film' : `${n} films`}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {mode === 'range' ? (
        <div className="v2-bp-plan-size-range">
          <label className="v2-bp-plan-size-field">
            <span className="v2-bp-plan-size-sublabel">Min</span>
            <select
              className="v2-bp-select"
              value={size.min}
              aria-label="Minimum films"
              onChange={(e) => {
                const min = Number(e.target.value);
                onChange(
                  planSizeFromUiMode('range', {
                    min,
                    max: Math.max(min, size.max),
                  }),
                );
              }}
            >
              {PLAN_SIZE_COUNT_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <span className="v2-bp-plan-size-sep" aria-hidden="true">
            –
          </span>
          <label className="v2-bp-plan-size-field">
            <span className="v2-bp-plan-size-sublabel">Max</span>
            <select
              className="v2-bp-select"
              value={size.max}
              aria-label="Maximum films"
              onChange={(e) => {
                const max = Number(e.target.value);
                onChange(
                  planSizeFromUiMode('range', {
                    min: Math.min(size.min, max),
                    max,
                  }),
                );
              }}
            >
              {PLAN_SIZE_COUNT_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
      {mode === 'max' ? (
        <p className="v2-bp-plan-size-hint">
          Pack as many compatible films as fit your day.
        </p>
      ) : null}
    </div>
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
 *   onOpenShowtimeManage?: () => void,
 *   onOpenTheaterManage?: () => void,
 *   resumeOpenSection?: null | 'when' | 'what' | 'where' | 'fineTuning',
 *   homeData?: object | null,
 *   enrichmentIndex?: object | null,
 * }} props
 */
export default function BuildPlanSurface({
  onBack,
  backLabel = 'Planner',
  onStubAction,
  onRequestResults,
  onOpenFilmManage,
  onOpenShowtimeManage,
  onOpenTheaterManage,
  resumeOpenSection = null,
  homeData = null,
  enrichmentIndex = null,
}) {
  const presentation = resolveBuildPlanPresentation();
  const mockupMode = isBuildPlanMockupMode();
  const statusId = useId();
  const [form, setFormLocal] = useState(() =>
    ensureBuildPlanFormSession(
      () =>
        mockupMode ? createBuildPlanFormState() : createLiveBuildPlanFormState(),
      { persist: !mockupMode },
    ),
  );
  const [openSection, setOpenSection] = useState(() => {
    if (resumeOpenSection) return resumeOpenSection;
    return mockupMode ? getBuildPlanMockupOpenSection() : null;
  });
  const [statusMessage, setStatusMessage] = useState(null);
  const [ctaBusy, setCtaBusy] = useState(false);
  const [draftConflicts, setDraftConflicts] = useState([]);
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
    setDraftConflicts([]);
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

  const openShowtimeManage = () => {
    if (typeof onOpenShowtimeManage === 'function') {
      onOpenShowtimeManage();
      return;
    }
    announce('manage-locked-showtimes', 'Add a showtime');
  };

  const hardConstraints = resolveBuildPlanHardConstraints(form, homeData);
  const filmEligibilityOptions = {
    dateIso: hardConstraints.dateIso,
    theaterIds: hardConstraints.theaterIds,
    startAfterMin: hardConstraints.startAfterMin,
    finishByMin: hardConstraints.finishByMin,
    enrichmentIndex,
  };

  const liveValidation = mockupMode
    ? { ok: true, conflicts: [] }
    : validateBuildPlanDraftForGenerate(form, homeData, {
        enrichmentIndex,
      });
  const activeConflicts =
    draftConflicts.length > 0 ? draftConflicts : liveValidation.conflicts ?? [];
  const conflictMessages = formatPlannerConflictMessages(activeConflicts);

  const selectPreset = (presetId) => {
    setDraftConflicts([]);
    setForm((current) => {
      if (current.selectedPresetId === presetId) {
        return { ...current, selectedPresetId: null };
      }
      return applyBuildPlanPreset(presetId, current);
    });
  };

  const handleCta = () => {
    if (ctaBusy) return;
    if (!mockupMode) {
      const validation = validateBuildPlanDraftForGenerate(form, homeData, {
        enrichmentIndex,
      });
      if (!validation.ok) {
        setDraftConflicts(validation.conflicts);
        setStatusMessage(
          formatPlannerConflictMessages(validation.conflicts)[0] ??
            'Fix plan conflicts before generating.',
        );
        setOpenSection('what');
        return;
      }
    }
    setDraftConflicts([]);
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
              <TimeBoundControl
                startAfter={form.startAfter}
                finishBefore={form.finishBefore}
                finishBeforeNextDay={resolveFinishBeforeNextDayFlag(
                  form.finishBefore,
                  form.finishBeforeNextDay,
                )}
                startLabel={when.startAfterLabel}
                finishLabel={when.finishBeforeLabel}
                onChange={(patch) =>
                  setForm((c) => ({
                    ...c,
                    ...patch,
                  }))
                }
              />
              <p className="v2-bp-time-summary" aria-live="polite">
                {formatBuildPlanTimeWindowSummary(form)}
              </p>
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
                <p className="v2-bp-must-label">
                  {what.lockedShowtimesLabel ?? 'Locked showtimes'}
                </p>
                <button
                  type="button"
                  className="v2-bp-manage"
                  onClick={openShowtimeManage}
                >
                  {what.manageLabel}
                </button>
              </div>
              <div className="v2-bp-film-stack">
                {(form.lockedShowtimes ?? []).length === 0 ? (
                  <p className="v2-bp-empty-hint">No showtimes locked yet</p>
                ) : (
                  (form.lockedShowtimes ?? []).map((lock) => {
                    const related = conflictsForPerformance(
                      activeConflicts,
                      lock.performanceKey,
                    );
                    const eligible = mockupMode
                      ? true
                      : isLockedShowtimeEligibleUnderForm(
                          lock,
                          form,
                          homeData,
                        );
                    const warning =
                      related[0]?.message ??
                      (!eligible
                        ? what.incompatibleLockHint ??
                          'Doesn’t match your current constraints'
                        : null);
                    return (
                      <LockedShowtimeRow
                        key={lock.performanceKey}
                        lock={lock}
                        warning={warning}
                        onRemove={() => {
                          setDraftConflicts([]);
                          setForm((c) =>
                            removeLockedShowtimeFromForm(
                              c,
                              lock.performanceKey,
                            ),
                          );
                        }}
                      />
                    );
                  })
                )}
                <button
                  type="button"
                  className="v2-bp-film-add"
                  onClick={openShowtimeManage}
                >
                  <span aria-hidden="true">
                    <IconPlus width={14} height={14} />
                  </span>
                  <span>
                    {(form.lockedShowtimes ?? []).length > 0
                      ? 'Add another showtime'
                      : what.addShowtimeLabel ?? 'Add a showtime'}
                  </span>
                </button>
              </div>
            </div>

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
                {form.mustInclude.length === 0 ? (
                  <p className="v2-bp-empty-hint">No films added yet</p>
                ) : null}
                {form.mustInclude.map((film) => {
                  const related = conflictsForFilmCard(activeConflicts, film);
                  const eligible = mockupMode
                    ? true
                    : filmCardHasEligibleShowtimes(
                        film,
                        homeData,
                        filmEligibilityOptions,
                      );
                  const warning =
                    related[0]?.message ??
                    (!eligible
                      ? what.ineligibleFilmHint ??
                        'No showtimes match your current constraints'
                      : null);
                  return (
                    <MustFilmRow
                      key={film.id}
                      film={film}
                      warning={warning}
                      onOpen={() => openManage('mustInclude')}
                    />
                  );
                })}
                {form.mustInclude.length < MUST_INCLUDE_MAX ? (
                  <button
                    type="button"
                    className="v2-bp-film-add"
                    onClick={() => openManage('mustInclude')}
                  >
                    <span aria-hidden="true">
                      <IconPlus width={14} height={14} />
                    </span>
                    <span>
                      {form.mustInclude.length > 0
                        ? 'Add another film'
                        : what.addAnotherLabel ?? 'Add film'}
                    </span>
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
              <div className="v2-bp-film-stack">
                {form.wouldLove.length === 0 ? (
                  <p className="v2-bp-empty-hint">No films added yet</p>
                ) : (
                  form.wouldLove.slice(0, 4).map((film) => {
                    const eligible = mockupMode
                      ? true
                      : filmCardHasEligibleShowtimes(
                          film,
                          homeData,
                          filmEligibilityOptions,
                        );
                    return (
                      <MustFilmRow
                        key={film.id}
                        film={film}
                        warning={
                          eligible
                            ? null
                            : what.ineligibleFilmHint ??
                              'No showtimes match your current constraints'
                        }
                        onOpen={() => openManage('wouldLove')}
                      />
                    );
                  })
                )}
                {form.wouldLove.length > 4 ? (
                  <button
                    type="button"
                    className="v2-bp-film-add"
                    onClick={() => openManage('wouldLove')}
                  >
                    + {form.wouldLove.length - 4} more
                  </button>
                ) : null}
                <button
                  type="button"
                  className="v2-bp-film-add"
                  onClick={() => openManage('wouldLove')}
                >
                  <span aria-hidden="true">
                    <IconPlus width={14} height={14} />
                  </span>
                  <span>
                    {form.wouldLove.length > 0
                      ? 'Add another film'
                      : what.addAnotherLabel ?? 'Add film'}
                  </span>
                </button>
              </div>
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
              <div className="v2-bp-film-stack">
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
                <button
                  type="button"
                  className="v2-bp-film-add"
                  onClick={() => openManage('notInterested')}
                >
                  <span aria-hidden="true">
                    <IconPlus width={14} height={14} />
                  </span>
                  <span>
                    {form.notInterested.length > 0
                      ? 'Add another film'
                      : what.addAnotherLabel ?? 'Add film'}
                  </span>
                </button>
              </div>
            </div>
          </div>,
        )}

        {renderAccordion(
          'fineTuning',
          fineTuning.title,
          collapsed.fineTuning,
          <div className="v2-bp-acc-body">
            <div className="v2-bp-fine-grid v2-bp-fine-grid-live">
              <div className="v2-bp-fine-field v2-bp-fine-field-plan-size">
                <PlanSizeControl
                  planSize={form.planSize}
                  onChange={(nextSize) => {
                    setDraftConflicts([]);
                    setForm((c) => ({ ...c, planSize: nextSize }));
                  }}
                />
              </div>
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
          {conflictMessages.length > 0 ? (
            <div
              className="v2-bp-conflicts"
              role="alert"
              aria-label="Plan conflicts"
            >
              <p className="v2-bp-conflicts-title">Fix these before generating</p>
              <ul className="v2-bp-conflicts-list">
                {conflictMessages.slice(0, 4).map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <ul className="v2-bp-summary-meta">
            <li>
              <IconCalendar width={14} height={14} aria-hidden="true" />
              <span>{summary.line1}</span>
            </li>
            <li>
              <IconPeople width={14} height={14} aria-hidden="true" />
              <span>{summary.line2}</span>
            </li>
            <li>
              <IconTicket width={14} height={14} aria-hidden="true" />
              <span>{formatPlanSizeLabel(form.planSize)}</span>
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
