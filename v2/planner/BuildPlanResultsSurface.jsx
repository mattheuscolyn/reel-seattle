/**
 * Build a Plan Results — live itineraries + adjustment overlays.
 *
 * Mockup QC: `?planResultsMockup=1&interaction=none|time|film|break`
 * Live default from HomeData + Build form. Fixture never enters production.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  calendarExportStatusMessage,
  exportPlanToCalendar,
} from '../calendar/exportFromOpportunity.js';
import { acceptResultsPlan } from './acceptPlanFromResults.js';
import {
  IconBookmark,
  IconChevron,
  IconClock,
  IconCup,
  IconHourglass,
  IconPopcorn,
  IconSpark,
  IconTicket,
} from '../icons.jsx';
import {
  createBuildPlanResultsUiStateFromPresentation,
  isPlanResultsMockupMode,
  resolveBuildPlanResultsPagePresentation,
} from './resolveBuildPlanResultsPresentation.js';
import {
  getBuildPlanResultsInteraction,
  getBuildPlanResultsOrderedPlans,
  PLAN_RESULTS_INTERACTION_QUERY,
} from '../fixtures/buildPlanResultsMockupFixture.js';
import { createBuildPlanFormState } from '../fixtures/buildPlanMockupFixture.js';
import { createLiveBuildPlanFormState } from './createLiveBuildPlanFormState.js';
import {
  formatBreakMinutes,
  parseBreakLabelToMinutes,
} from './planBreakRange.js';
import AdjustTimeWindowOverlay from './AdjustTimeWindowOverlay.jsx';
import AdjustFilmInPlansOverlay from './AdjustFilmInPlansOverlay.jsx';
import AdjustBreakLengthOverlay from './AdjustBreakLengthOverlay.jsx';
import {
  isFilmSeen,
  markFilmSeen,
  markFilmUnseen,
} from '../stores/seenFilmsStore.js';
import {
  getScheduleSettings,
  subscribeScheduleSettings,
} from '../stores/scheduleSettingsStore.js';
import {
  isFilmNotInterested,
  markFilmNotInterested,
  clearFilmNotInterested,
} from '../stores/notInterestedFilmsStore.js';
import { setBuildPlanFormSession } from './buildPlanFormSession.js';
import { filmIdentitiesEqual } from '../identity/filmIdentity.js';
import { filmRefFromHomeFilm } from '../save/filmRefFromFilm.js';

function getBrowserStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function selectedFilmsForCalendarExport(plan, selectedFilmIds) {
  if (!plan || !Array.isArray(plan.items)) return [];
  const selected = new Set(selectedFilmIds ?? []);
  /** @type {object[]} */
  const films = [];
  for (const item of plan.items) {
    if (!item || item.type === 'break') continue;
    if (selected.size > 0 && !selected.has(item.id)) continue;
    if (
      item.date &&
      (item.time || item.startTime) &&
      (item.runtime != null || item.runtimeMin != null) &&
      (item.filmKey || item.theaterId || item.theater_id)
    ) {
      films.push({
        title: item.title,
        date: item.date,
        time: item.time ?? item.startTime,
        runtime: item.runtime ?? item.runtimeMin,
        theater: item.theater ?? item.theaterName,
        theater_id: item.theaterId ?? item.theater_id,
        filmKey: item.filmKey,
        format: item.formatBadge ?? item.format,
        ticket_url: item.ticketUrl ?? item.ticket_url,
        source: item.source,
        source_showtime_id: item.sourceShowtimeId ?? item.source_showtime_id,
        publicShowtimeId: item.publicShowtimeId,
        addressLabel: item.addressLabel ?? null,
      });
    }
  }
  return films;
}

function filmRefFromResultsFilm(film) {
  return (
    filmRefFromHomeFilm(film) ?? {
      filmId: film.filmId ?? null,
      showtimeFilmKey: film.filmKey ?? film.id ?? null,
      title: film.title ?? null,
      posterUrl: film.imageUrl ?? null,
    }
  );
}

function normalizeBreakLabel(label) {
  if (typeof label !== 'string') return 'Break';
  const trimmed = label.trim();
  if (/break$/i.test(trimmed)) return trimmed;
  if (/^Break\s+/i.test(trimmed)) {
    return `${trimmed.replace(/^Break\s+/i, '')} break`;
  }
  return `${trimmed} break`;
}

function preferenceFromForm(form, film) {
  const inList = (list) =>
    (list ?? []).some((f) => filmIdentitiesEqual(f, film));
  if (inList(form?.mustInclude)) return 'require';
  if (inList(form?.notInterested)) return 'exclude';
  if (inList(form?.wouldLove)) return 'prefer';
  return 'prefer';
}

function applyFilmPreferenceToForm(form, film, preference) {
  const card = {
    id: film.filmKey ?? film.id,
    filmKey: film.filmKey ?? film.id,
    filmId: film.filmId ?? null,
    parentFilmKey: film.parentFilmKey ?? null,
    showtimeFilmKey: film.showtimeFilmKey ?? film.filmKey ?? film.id,
    title: film.title ?? '',
    detailLabel: film.theater ? `${film.theater}` : 'Any theater',
    theaterLabel: film.theater ?? 'Any theater',
    imageUrl: film.imageUrl ?? '',
  };
  const without = (list) =>
    (list ?? []).filter((f) => !filmIdentitiesEqual(f, film));
  const next = {
    ...form,
    mustInclude: without(form.mustInclude),
    wouldLove: without(form.wouldLove),
    notInterested: without(form.notInterested),
  };
  if (preference === 'require') {
    next.mustInclude = [...next.mustInclude, card];
  } else if (preference === 'prefer') {
    next.wouldLove = [...next.wouldLove, card];
  } else if (preference === 'exclude') {
    next.notInterested = [...next.notInterested, card];
  }
  return next;
}

/**
 * Deterministic mockup re-filter after adjustments (does not invent live engine).
 */
function filterMockupPlans(plans, form) {
  const must = form?.mustInclude ?? [];
  const exclude = form?.notInterested ?? [];
  const maxGap = parseBreakLabelToMinutes(form?.maxGap);
  const minGap = parseBreakLabelToMinutes(form?.minGap ?? 'Any') ?? 0;

  return plans
    .map((plan, index) => {
      const films = plan.items.filter((i) => i.type !== 'break');
      if (must.some((card) => !films.some((f) => filmIdentitiesEqual(f, card)))) {
        return null;
      }
      if (films.some((f) => exclude.some((card) => filmIdentitiesEqual(f, card)))) {
        return null;
      }
      if (maxGap != null || minGap > 0) {
        for (const item of plan.items) {
          if (item.type !== 'break') continue;
          const mins = parseBreakLabelToMinutes(item.label);
          if (mins == null) continue;
          if (mins < minGap) return null;
          if (maxGap != null && mins > maxGap) return null;
        }
      }
      return { ...plan, rank: index + 1 };
    })
    .filter(Boolean)
    .map((plan, index) => ({ ...plan, rank: index + 1 }));
}

function buildSummaryLine(form, fallback) {
  if (!form) return fallback;
  const date = form.dateShort ?? form.dateDisplay ?? '';
  const window = `${form.startAfter} – ${form.finishBefore}`;
  const size = form.planSize ?? '';
  const parts = [date, window, size].filter(Boolean);
  return parts.join(' • ') || fallback;
}

function PlanBreakRow({ item, onOpenBreak, breakButtonRef }) {
  const label = normalizeBreakLabel(item.label);
  return (
    <div className="v2-bpr-break">
      <button
        ref={breakButtonRef}
        type="button"
        className="v2-bpr-break-pill"
        aria-label={`Adjust break length (${label})`}
        aria-haspopup="dialog"
        onClick={() => onOpenBreak(item)}
      >
        <IconCup width={12} height={12} aria-hidden="true" />
        <span>{label}</span>
      </button>
    </div>
  );
}

function PlanFilmRow({
  film,
  timeButtonRef,
  filmButtonRef,
  onOpenTime,
  onOpenFilm,
}) {
  return (
    <div className="v2-bpr-film" data-film-id={film.id}>
      <span className="v2-bpr-film-dot" aria-hidden="true" />
      <button
        ref={timeButtonRef}
        type="button"
        className="v2-bpr-film-time"
        aria-label={`Adjust time window (showtime ${film.startTime})`}
        aria-haspopup="dialog"
        onClick={() => onOpenTime(film)}
      >
        {film.startTime}
      </button>
      <button
        ref={filmButtonRef}
        type="button"
        className="v2-bpr-film-main"
        aria-label={`Adjust ${film.title} in plans`}
        aria-haspopup="dialog"
        onClick={() => onOpenFilm(film)}
      >
        {film.imageUrl ? (
          <img className="v2-bpr-film-poster" src={film.imageUrl} alt="" />
        ) : (
          <span className="v2-bpr-film-poster v2-bpr-film-poster-fallback" />
        )}
        <span className="v2-bpr-film-copy">
          <span className="v2-bpr-film-title-row">
            <span className="v2-bpr-film-title">{film.title}</span>
            {film.formatBadge ? (
              <span className="v2-bpr-badge">{film.formatBadge}</span>
            ) : null}
          </span>
          {film.theater ? (
            <span className="v2-bpr-film-theater">{film.theater}</span>
          ) : null}
        </span>
      </button>
    </div>
  );
}

function PlanItineraryCard({
  plan,
  saved,
  timeButtonRefs,
  filmButtonRefs,
  breakButtonRefs,
  viewPlanLabel,
  savePlanLabel,
  savedPlanLabel,
  onOpenTime,
  onOpenFilm,
  onOpenBreak,
  onViewPlan,
  onSavePlan,
}) {
  const movieCount =
    plan.movieCountLabel?.replace(/movies?/i, 'movies') ??
    `${plan.items.filter((i) => i.type !== 'break').length} movies`;
  const breaksOnly =
    plan.breaksLabel?.match(/(\d+)\s*breaks?/i)?.[0] ??
    `${plan.items.filter((i) => i.type === 'break').length} breaks`;

  return (
    <article
      className="v2-bpr-plan"
      data-plan-id={plan.id}
      aria-label={`Plan ${plan.rank}`}
    >
      <div className="v2-bpr-plan-grid">
        <div className="v2-bpr-plan-main">
          <span className="v2-bpr-plan-rank" aria-hidden="true">
            {plan.rank}
          </span>
          <div className="v2-bpr-timeline">
            {plan.items.map((item) =>
              item.type === 'break' ? (
                <PlanBreakRow
                  key={item.id}
                  item={item}
                  onOpenBreak={onOpenBreak}
                  breakButtonRef={(node) => {
                    if (node) breakButtonRefs.current.set(item.id, node);
                    else breakButtonRefs.current.delete(item.id);
                  }}
                />
              ) : (
                <PlanFilmRow
                  key={item.id}
                  film={item}
                  timeButtonRef={(node) => {
                    if (node) timeButtonRefs.current.set(item.id, node);
                    else timeButtonRefs.current.delete(item.id);
                  }}
                  filmButtonRef={(node) => {
                    if (node) filmButtonRefs.current.set(item.id, node);
                    else filmButtonRefs.current.delete(item.id);
                  }}
                  onOpenTime={onOpenTime}
                  onOpenFilm={onOpenFilm}
                />
              ),
            )}
          </div>
        </div>
        <aside className="v2-bpr-plan-aside" aria-label={`Plan ${plan.rank} summary`}>
          <p>
            <IconTicket width={12} height={12} aria-hidden="true" />
            <span>{movieCount}</span>
          </p>
          <p>
            <IconClock width={12} height={12} aria-hidden="true" />
            <span>{plan.finishesLabel}</span>
          </p>
          <p>
            <IconHourglass width={12} height={12} aria-hidden="true" />
            <span>{plan.totalRuntime}</span>
          </p>
          <p>
            <IconPopcorn width={12} height={12} aria-hidden="true" />
            <span>{breaksOnly}</span>
          </p>
        </aside>
      </div>
      <div className="v2-bpr-plan-actions">
        <button
          type="button"
          className="v2-bpr-view"
          onClick={() => onViewPlan(plan)}
        >
          <span>{viewPlanLabel}</span>
          <IconChevron width={12} height={12} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`v2-bpr-save${saved ? ' is-saved' : ''}`}
          aria-pressed={saved}
          aria-label={saved ? savedPlanLabel : savePlanLabel}
          onClick={() => onSavePlan(plan)}
        >
          <IconBookmark width={14} height={14} aria-hidden="true" />
          <span>{saved ? savedPlanLabel : savePlanLabel}</span>
        </button>
      </div>
    </article>
  );
}

/**
 * @param {{
 *   onBack: () => void,
 *   backLabel?: string,
 *   onStubAction?: (actionId: string, label: string) => void,
 *   onAcceptedPlanChange?: () => void,
 *   onViewPlanDetails?: (plan: object, origin: object) => void,
 *   onShareReady?: (handler: (() => void) | null) => void,
 *   storage?: Storage | null,
 *   homeData?: object | null,
 *   formConfig?: object | null,
 * }} props
 */
export default function BuildPlanResultsSurface({
  onBack,
  backLabel = 'Build a Plan',
  onStubAction,
  onAcceptedPlanChange,
  onViewPlanDetails,
  onShareReady,
  storage = null,
  homeData = null,
  enrichmentIndex = null,
  formConfig = null,
  initialSortId = null,
  restoreScrollY = null,
  restoreActivePlanId = null,
}) {
  const statusId = useId();
  const resolvedStorage = storage ?? getBrowserStorage();
  const mockup = isPlanResultsMockupMode();

  const [workingForm, setWorkingForm] = useState(() => {
    if (formConfig) return { ...formConfig };
    return mockup ? createBuildPlanFormState() : createLiveBuildPlanFormState();
  });
  const [adjustmentsApplied, setAdjustmentsApplied] = useState(false);
  const [sortId, setSortId] = useState(
    () => initialSortId || formConfig?.sortId || 'best-match',
  );
  const [sortOpen, setSortOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [savedPlanIds, setSavedPlanIds] = useState([]);
  const [storeTick, setStoreTick] = useState(0);

  const [activeAdjustment, setActiveAdjustment] = useState(() => {
    const interaction = getBuildPlanResultsInteraction();
    return interaction && interaction !== 'none' ? interaction : null;
  });
  const [adjustmentFilm, setAdjustmentFilm] = useState(() => {
    if (getBuildPlanResultsInteraction() !== 'film') return null;
    // Seed from fixture plans for deterministic QC deep-link.
    try {
      const plans = getBuildPlanResultsOrderedPlans('best-match');
      return (
        plans.flatMap((p) => p.items).find((i) => i.type !== 'break') ?? null
      );
    } catch {
      return null;
    }
  });
  const triggerRef = useRef(null);
  const timeButtonRefs = useRef(new Map());
  const filmButtonRefs = useRef(new Map());
  const breakButtonRefs = useRef(new Map());
  const backBusyRef = useRef(false);
  const applyBusyRef = useRef(false);

  // Seed deterministic overlay target for QC deep-links.
  useEffect(() => {
    const interaction = getBuildPlanResultsInteraction();
    if (!interaction || interaction === 'none') return;
    setActiveAdjustment(interaction);
  }, []);

  useEffect(() => {
    if (formConfig) {
      setWorkingForm({ ...formConfig });
    }
  }, [formConfig]);

  useEffect(() => {
    if (typeof restoreScrollY === 'number' && Number.isFinite(restoreScrollY)) {
      window.requestAnimationFrame(() => {
        window.scrollTo(0, restoreScrollY);
      });
    }
  }, [restoreScrollY]);

  useEffect(() => {
    if (!restoreActivePlanId) return;
    setUi((current) => ({
      ...current,
      activePlanId: restoreActivePlanId,
    }));
  }, [restoreActivePlanId]);

  const [settingsTick, setSettingsTick] = useState(0);
  useEffect(
    () => subscribeScheduleSettings(() => setSettingsTick((n) => n + 1)),
    [],
  );
  void settingsTick;

  const presentation = useMemo(() => {
    const storage = getBrowserStorage();
    const timeFormatId = getScheduleSettings(storage).timeFormatId;
    const base = resolveBuildPlanResultsPagePresentation({
      homeData,
      form: workingForm,
      sortId,
      storage,
      enrichmentIndex,
      timeFormatId,
    });
    if (base.source !== 'mockup-fixture') return base;
    if (!adjustmentsApplied) {
      return {
        ...base,
        summaryLine: buildSummaryLine(workingForm, base.summaryLine),
      };
    }
    const filtered = filterMockupPlans(base.plans, workingForm);
    return {
      ...base,
      summaryLine: buildSummaryLine(workingForm, base.summaryLine),
      plans: filtered,
      plansFoundLabel: `${filtered.length} plans found`,
      emptyMessage:
        filtered.length === 0
          ? 'No plans match these adjustments. Try changing time, film, or break settings.'
          : null,
    };
  }, [
    homeData,
    enrichmentIndex,
    workingForm,
    sortId,
    adjustmentsApplied,
    settingsTick,
  ]);

  const [ui, setUi] = useState(() =>
    createBuildPlanResultsUiStateFromPresentation(presentation),
  );

  const plansKey = useMemo(
    () =>
      `${presentation.source}:${presentation.plans.map((p) => p.id).join('|')}`,
    [presentation.source, presentation.plans],
  );

  useEffect(() => {
    setUi((current) => ({
      ...createBuildPlanResultsUiStateFromPresentation(presentation),
      sortId: current.sortId === sortId ? sortId : sortId,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- plansKey seeds selection
  }, [plansKey]);

  const announce = (actionId, label, message) => {
    const text =
      message ?? `${label} isn’t available in this Results shell yet.`;
    setStatusMessage(text);
    onStubAction?.(actionId, label);
  };

  const orderedPlans = presentation.plans;
  const activePlan =
    orderedPlans.find((p) => p.id === ui.activePlanId) ??
    orderedPlans[0] ??
    null;

  const handleShareExport = useCallback(() => {
    // Header Share action: Export plan to calendar (.ics) when showtimes are exportable.
    const films = selectedFilmsForCalendarExport(
      activePlan,
      ui.selectedFilmIds,
    );
    if (films.length === 0) {
      announce(
        'share',
        presentation.shareLabel,
        'Calendar export (.ics) needs real showtimes. Fixture results can’t export yet — use Add to calendar on Film Detail. Sync isn’t available.',
      );
      return;
    }
    const result = exportPlanToCalendar({
      planId: activePlan?.id ?? null,
      title: presentation.pageTitle,
      films,
    });
    setStatusMessage(calendarExportStatusMessage(result));
    onStubAction?.('share', presentation.shareLabel);
  }, [
    activePlan,
    ui.selectedFilmIds,
    presentation.shareLabel,
    presentation.pageTitle,
    onStubAction,
  ]);

  useEffect(() => {
    onShareReady?.(handleShareExport);
    return () => onShareReady?.(null);
  }, [onShareReady, handleShareExport]);

  // Open film overlay for QC interaction=film once plans exist.
  useEffect(() => {
    if (activeAdjustment !== 'film' || adjustmentFilm) return;
    const firstFilm = orderedPlans
      .flatMap((p) => p.items)
      .find((i) => i.type !== 'break');
    if (firstFilm) setAdjustmentFilm(firstFilm);
  }, [activeAdjustment, adjustmentFilm, orderedPlans]);

  const closeAdjustment = useCallback(() => {
    const kind = activeAdjustment;
    const filmId = adjustmentFilm?.id;
    setActiveAdjustment(null);
    setAdjustmentFilm(null);
    window.setTimeout(() => {
      if (kind === 'time' && filmId) {
        timeButtonRefs.current.get(filmId)?.focus();
      } else if (kind === 'film' && filmId) {
        filmButtonRefs.current.get(filmId)?.focus();
      } else if (kind === 'break' && triggerRef.current) {
        breakButtonRefs.current.get(triggerRef.current)?.focus();
      }
      triggerRef.current = null;
    }, 0);
  }, [activeAdjustment, adjustmentFilm]);

  const commitForm = useCallback(
    (nextForm) => {
      setWorkingForm(nextForm);
      setBuildPlanFormSession(nextForm);
      setAdjustmentsApplied(true);
      applyBusyRef.current = false;
      closeAdjustment();
    },
    [closeAdjustment],
  );

  const handleApplyTime = (next) => {
    if (applyBusyRef.current) return;
    applyBusyRef.current = true;
    commitForm({
      ...workingForm,
      startAfter: next.startAfter,
      finishBefore: next.endBefore,
    });
  };

  const handleApplyFilm = (next) => {
    if (applyBusyRef.current || !adjustmentFilm) return;
    applyBusyRef.current = true;
    const ref = filmRefFromResultsFilm(adjustmentFilm);
    if (next.seen) {
      markFilmSeen(resolvedStorage, ref);
      clearFilmNotInterested(resolvedStorage, ref);
    } else {
      markFilmUnseen(resolvedStorage, ref);
    }
    if (next.notInterested) {
      markFilmNotInterested(resolvedStorage, ref);
      markFilmUnseen(resolvedStorage, ref);
    } else if (!next.seen) {
      clearFilmNotInterested(resolvedStorage, ref);
    }
    const nextForm = applyFilmPreferenceToForm(
      workingForm,
      adjustmentFilm,
      next.preference,
    );
    setStoreTick((n) => n + 1);
    commitForm(nextForm);
  };

  const handleApplyBreak = (next) => {
    if (applyBusyRef.current) return;
    applyBusyRef.current = true;
    commitForm({
      ...workingForm,
      minGap: formatBreakMinutes(next.minBreakMinutes),
      maxGap:
        next.maxBreakMinutes == null
          ? 'Any'
          : formatBreakMinutes(next.maxBreakMinutes),
    });
  };

  const handleAddToSchedule = (plan) => {
    if (savedPlanIds.includes(plan.id)) {
      setStatusMessage('Already in My Schedule.');
      return;
    }
    const result = acceptResultsPlan(plan, ui.selectedFilmIds, {
      storage: resolvedStorage,
      provenance: presentation.source === 'live' ? 'live' : 'fixture',
      label: presentation.pageTitle,
    });
    setStatusMessage(result.message);
    onStubAction?.(`save-${plan.id}`, presentation.savePlanLabel);
    if (result.ok) {
      setSavedPlanIds((ids) =>
        ids.includes(plan.id) ? ids : [...ids, plan.id],
      );
      if (result.changed) onAcceptedPlanChange?.();
    }
  };

  const handleSavePlan = handleAddToSchedule;

  const handleViewPlan = (plan) => {
    if (typeof onViewPlanDetails === 'function') {
      onViewPlanDetails(plan, {
        sortId,
        form: workingForm,
        scrollY: typeof window !== 'undefined' ? window.scrollY : 0,
      });
      return;
    }
    announce(`view-${plan.id}`, presentation.viewPlanLabel);
  };

  const handleBack = () => {
    if (backBusyRef.current) return;
    backBusyRef.current = true;
    onBack();
  };

  const filmPref =
    adjustmentFilm != null
      ? preferenceFromForm(workingForm, adjustmentFilm)
      : 'prefer';
  const filmSeen =
    adjustmentFilm != null
      ? isFilmSeen(resolvedStorage, filmRefFromResultsFilm(adjustmentFilm))
      : false;
  const filmNi =
    adjustmentFilm != null
      ? isFilmNotInterested(
          resolvedStorage,
          filmRefFromResultsFilm(adjustmentFilm),
        )
      : false;
  void storeTick;

  const minBreakMinutes =
    parseBreakLabelToMinutes(workingForm.minGap ?? 'Any') ?? 0;
  const maxBreakMinutes = parseBreakLabelToMinutes(
    workingForm.maxGap ?? 'Any',
  );

  const overlayOpen = activeAdjustment != null;

  return (
    <>
      <article
        className={`v2-bpr${overlayOpen ? ' is-sheet-open' : ''}`}
        aria-labelledby="v2-bpr-title"
        data-build-plan-results-source={presentation.source}
        data-bpr-interaction={activeAdjustment ?? 'none'}
        {...(overlayOpen ? { inert: '' } : {})}
      >
        <p
          id={statusId}
          className={statusMessage ? 'v2-bpr-status' : 'v2-visually-hidden'}
          role="status"
          aria-live="polite"
        >
          {statusMessage ?? ''}
        </p>

        <div className="v2-bpr-intro" data-bpr-section="summary">
          <h1 id="v2-bpr-title" className="v2-bpr-title">
            {presentation.pageTitle}{' '}
            <span className="v2-bpr-spark" aria-hidden="true">
              <IconSpark width={14} height={14} />
              <IconSpark width={10} height={10} />
            </span>
          </h1>
          <p className="v2-bpr-summary">{presentation.summaryLine}</p>
          <p className="v2-bpr-hint">
            <IconSpark width={12} height={12} aria-hidden="true" />
            <span>Tap a time, film, or break to adjust results instantly.</span>
          </p>
        </div>

        <section className="v2-bpr-sort" data-bpr-section="sort">
          <div className="v2-bpr-sort-bar">
            <span className="v2-bpr-sort-label">{presentation.sortLabel}</span>
            <div className="v2-bpr-sort-controls">
              <button
                type="button"
                className="v2-bpr-sort-select"
                aria-haspopup="listbox"
                aria-expanded={sortOpen}
                onClick={() => setSortOpen((v) => !v)}
              >
                <IconSpark width={12} height={12} aria-hidden="true" />
                <span>
                  {presentation.sortOptions.find((o) => o.id === sortId)
                    ?.label ?? 'Best match'}
                </span>
                <IconChevron width={12} height={12} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="v2-bpr-sort-tool"
                aria-label="Sort by shortest runtime"
                onClick={() => setSortId('shortest-runtime')}
              >
                <IconHourglass width={14} height={14} />
              </button>
            </div>
          </div>
          {sortOpen ? (
            <ul
              className="v2-bpr-sort-menu"
              role="listbox"
              aria-label={presentation.sortLabel}
            >
              {presentation.sortOptions.map((opt) => (
                <li key={opt.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={sortId === opt.id}
                    className={sortId === opt.id ? 'is-selected' : undefined}
                    onClick={() => {
                      setSortId(opt.id);
                      setSortOpen(false);
                    }}
                  >
                    {opt.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="v2-bpr-count">{presentation.plansFoundLabel}</p>
        </section>

        <div
          className="v2-bpr-plans"
          data-bpr-section="plans"
          aria-label="Candidate plans"
        >
          {orderedPlans.length === 0 ? (
            <div className="v2-bpr-empty" role="status">
              <p>
                {presentation.emptyMessage ??
                  'No plans fit these filters.'}
              </p>
              <button
                type="button"
                className="v2-bpr-empty-action"
                onClick={() => setActiveAdjustment('time')}
              >
                Adjust time window
              </button>
            </div>
          ) : null}
          {orderedPlans.map((plan) => (
            <PlanItineraryCard
              key={plan.id}
              plan={plan}
              saved={savedPlanIds.includes(plan.id)}
              timeButtonRefs={timeButtonRefs}
              filmButtonRefs={filmButtonRefs}
              breakButtonRefs={breakButtonRefs}
              viewPlanLabel={presentation.viewPlanLabel}
              savePlanLabel={presentation.savePlanLabel ?? 'Add to My Schedule'}
              savedPlanLabel={
                presentation.savedPlanLabel ?? 'Added to My Schedule'
              }
              onOpenTime={(film) => {
                triggerRef.current = film.id;
                setAdjustmentFilm(film);
                setActiveAdjustment('time');
              }}
              onOpenFilm={(film) => {
                triggerRef.current = film.id;
                setAdjustmentFilm(film);
                setActiveAdjustment('film');
              }}
              onOpenBreak={(item) => {
                triggerRef.current = item.id;
                setActiveAdjustment('break');
              }}
              onViewPlan={handleViewPlan}
              onSavePlan={handleSavePlan}
            />
          ))}
        </div>

        <span className="v2-visually-hidden">Back to {backLabel}</span>
        <button
          type="button"
          className="v2-visually-hidden"
          onClick={handleBack}
        >
          Back
        </button>
      </article>

      {activeAdjustment === 'time' ? (
        <AdjustTimeWindowOverlay
          startAfter={workingForm.startAfter}
          endBefore={workingForm.finishBefore}
          onCancel={closeAdjustment}
          onApply={handleApplyTime}
        />
      ) : null}
      {activeAdjustment === 'film' && adjustmentFilm ? (
        <AdjustFilmInPlansOverlay
          film={adjustmentFilm}
          preference={filmPref}
          seen={filmSeen}
          notInterested={filmNi}
          onCancel={closeAdjustment}
          onApply={handleApplyFilm}
        />
      ) : null}
      {activeAdjustment === 'break' ? (
        <AdjustBreakLengthOverlay
          minBreakMinutes={minBreakMinutes}
          maxBreakMinutes={maxBreakMinutes}
          onCancel={closeAdjustment}
          onApply={handleApplyBreak}
        />
      ) : null}
    </>
  );
}

export { PLAN_RESULTS_INTERACTION_QUERY };
