/**
 * Stage 1 Build a Plan Results — fixture-backed replica of
 * Build a Plan Results Page.png.
 *
 * Local sort/selection + film-click preference sheet only.
 * No generation, ranking engine, persistence, travel, or calendar.
 */

import { useCallback, useId, useRef, useState } from 'react';
import {
  IconCalendar,
  IconChevron,
  IconClock,
  IconClose,
  IconHourglass,
  IconMoon,
  IconRefresh,
  IconShare,
  IconSliders,
  IconSpark,
  IconStar,
  IconStarFill,
  IconSun,
  IconTicket,
  IconWalk,
} from '../icons.jsx';
import {
  createBuildPlanResultsUiState,
  getBuildPlanResultsOrderedPlans,
  resolveBuildPlanResultsPresentation,
} from '../fixtures/buildPlanResultsMockupFixture.js';
import PlanFilmInteractionSheet from './PlanFilmInteractionSheet.jsx';

const SORT_ICONS = {
  spark: IconSpark,
  clock: IconClock,
  hourglass: IconHourglass,
  sun: IconSun,
  calendar: IconCalendar,
};

const ADJUST_ICONS = {
  sun: IconSun,
  moon: IconMoon,
  walk: IconWalk,
  ticket: IconTicket,
  calendar: IconCalendar,
  sliders: IconSliders,
};

function PlanBreakRow({ label }) {
  return (
    <div className="v2-bpr-break" role="group" aria-label={label}>
      <span className="v2-bpr-break-pill">{label}</span>
    </div>
  );
}

function PlanFilmRow({
  film,
  selected,
  preference,
  sheetOpen,
  filmButtonRef,
  onToggleSelected,
  onOpenFilmSheet,
}) {
  return (
    <div
      className={`v2-bpr-film${selected ? ' is-selected' : ' is-deselected'}${
        sheetOpen ? ' is-sheet-target' : ''
      }${preference === 'notInterested' ? ' is-not-interested' : ''}`}
      data-film-id={film.id}
      data-film-preference={preference}
    >
      <span className="v2-bpr-film-time">{film.startTime}</span>
      <span className="v2-bpr-film-dot" aria-hidden="true" />
      <button
        ref={filmButtonRef}
        type="button"
        className="v2-bpr-film-main"
        aria-label={`${film.title} at ${film.theater}, ${film.startTime}. Adjust this movie in your plan.`}
        aria-haspopup="dialog"
        aria-expanded={sheetOpen}
        onClick={() => onOpenFilmSheet(film)}
      >
        <img className="v2-bpr-film-poster" src={film.imageUrl} alt="" />
        <span className="v2-bpr-film-copy">
          <span className="v2-bpr-film-title-row">
            <span className="v2-bpr-film-title">{film.title}</span>
            {film.formatBadge ? (
              <span className="v2-bpr-badge">{film.formatBadge}</span>
            ) : null}
          </span>
          <span className="v2-bpr-film-theater">{film.theater}</span>
          <span className="v2-bpr-film-runtime">{film.runtimeLabel}</span>
        </span>
      </button>
      <button
        type="button"
        className="v2-bpr-film-select"
        aria-pressed={selected}
        aria-label={
          selected
            ? `Deselect ${film.title} from plan`
            : `Select ${film.title} in plan`
        }
        onClick={() => onToggleSelected(film.id)}
      >
        <span aria-hidden="true">{selected ? '✓' : ''}</span>
      </button>
    </div>
  );
}

function PlanItineraryCard({
  plan,
  active,
  favorited,
  selectedFilmIds,
  filmPreferences,
  sheetFilmId,
  filmButtonRefs,
  viewPlanLabel,
  moreActionsLabel,
  addToScheduleLabel,
  onSelectPlan,
  onToggleFavorite,
  onToggleFilm,
  onOpenFilmSheet,
  onViewPlan,
  onMoreActions,
  onAddToSchedule,
}) {
  return (
    <article
      className={`v2-bpr-plan${active ? ' is-active' : ''}`}
      data-plan-id={plan.id}
      aria-labelledby={`v2-bpr-plan-${plan.id}-label`}
    >
      <button
        type="button"
        className="v2-bpr-plan-select"
        role="radio"
        aria-checked={active}
        aria-label={`Plan ${plan.rank}`}
        id={`v2-bpr-plan-${plan.id}-label`}
        onClick={() => onSelectPlan(plan.id)}
      >
        <span className="v2-bpr-plan-rank" aria-hidden="true">
          {plan.rank}
        </span>
      </button>

      <div className="v2-bpr-plan-body">
        <div className="v2-bpr-timeline" aria-label={`Plan ${plan.rank} films`}>
          {plan.items.map((item) =>
            item.type === 'break' ? (
              <PlanBreakRow key={item.id} label={item.label} />
            ) : (
              <PlanFilmRow
                key={item.id}
                film={item}
                selected={selectedFilmIds.includes(item.id)}
                preference={filmPreferences[item.id] ?? item.preference}
                sheetOpen={sheetFilmId === item.id}
                filmButtonRef={(node) => {
                  if (node) filmButtonRefs.current.set(item.id, node);
                  else filmButtonRefs.current.delete(item.id);
                }}
                onToggleSelected={onToggleFilm}
                onOpenFilmSheet={onOpenFilmSheet}
              />
            ),
          )}
        </div>

        <aside className="v2-bpr-plan-aside">
          <div className="v2-bpr-aside-head">
            <p className="v2-bpr-aside-count">{plan.movieCountLabel}</p>
            <button
              type="button"
              className="v2-bpr-fav"
              aria-pressed={favorited}
              aria-label={
                favorited
                  ? `Unfavorite plan ${plan.rank}`
                  : `Favorite plan ${plan.rank}`
              }
              onClick={() => onToggleFavorite(plan.id)}
            >
              {favorited ? <IconStarFill /> : <IconStar />}
            </button>
          </div>
          <ul className="v2-bpr-aside-stats">
            <li>
              <IconClock width={12} height={12} aria-hidden="true" />
              <span>{plan.totalRuntime}</span>
            </li>
            <li>
              <IconWalk width={12} height={12} aria-hidden="true" />
              <span>{plan.walkLabel}</span>
            </li>
            <li>
              <span>{plan.breaksLabel}</span>
            </li>
          </ul>
          <p className="v2-bpr-aside-finish">{plan.finishesLabel}</p>
          <button
            type="button"
            className="v2-bpr-view"
            onClick={() => onViewPlan(plan)}
          >
            <span>{viewPlanLabel}</span>
            <IconChevron aria-hidden="true" />
          </button>
          <button
            type="button"
            className="v2-bpr-more"
            onClick={() => onMoreActions(plan)}
          >
            {moreActionsLabel}
            <span aria-hidden="true">▾</span>
          </button>
          <button
            type="button"
            className="v2-bpr-schedule"
            aria-label={`${addToScheduleLabel} for plan ${plan.rank}`}
            onClick={() => onAddToSchedule(plan)}
          >
            {addToScheduleLabel}
          </button>
        </aside>
      </div>
    </article>
  );
}

/**
 * @param {{
 *   onBack: () => void,
 *   backLabel?: string,
 *   onStubAction?: (actionId: string, label: string) => void,
 * }} props
 */
export default function BuildPlanResultsSurface({
  onBack,
  backLabel = 'Build a Plan',
  onStubAction,
}) {
  const presentation = resolveBuildPlanResultsPresentation();
  const statusId = useId();
  const [ui, setUi] = useState(() => createBuildPlanResultsUiState());
  const [statusMessage, setStatusMessage] = useState(null);
  const [sheetFilmId, setSheetFilmId] = useState(null);
  const filmButtonRefs = useRef(new Map());
  const sheetTriggerIdRef = useRef(null);

  const announce = (actionId, label, message) => {
    const text =
      message ??
      `${label} isn’t available in this Stage 1 Results shell yet.`;
    setStatusMessage(text);
    onStubAction?.(actionId, label);
  };

  const orderedPlans = getBuildPlanResultsOrderedPlans(ui.sortId);
  const visibleChips = presentation.preferenceChips.filter(
    (chip) => !ui.dismissedChipIds.includes(chip.id),
  );

  const sheetFilm =
    sheetFilmId == null
      ? null
      : orderedPlans
          .flatMap((plan) => plan.items)
          .find((item) => item.type !== 'break' && item.id === sheetFilmId) ??
        null;

  const closeSheet = useCallback(() => {
    const triggerId = sheetTriggerIdRef.current;
    setSheetFilmId(null);
    sheetTriggerIdRef.current = null;
    window.setTimeout(() => {
      if (triggerId) filmButtonRefs.current.get(triggerId)?.focus();
    }, 0);
  }, []);

  const openFilmSheet = useCallback((film) => {
    sheetTriggerIdRef.current = film.id;
    setSheetFilmId(film.id);
  }, []);

  const setFilmPreference = useCallback((filmId, preference) => {
    setUi((current) => {
      const nextSelected = [...current.selectedFilmIds];
      const idx = nextSelected.indexOf(filmId);
      if (preference === 'notInterested') {
        if (idx >= 0) nextSelected.splice(idx, 1);
      } else if (idx < 0) {
        nextSelected.push(filmId);
      }
      return {
        ...current,
        filmPreferences: {
          ...current.filmPreferences,
          [filmId]: preference,
        },
        selectedFilmIds: nextSelected,
      };
    });
  }, []);

  const toggleFilm = (filmId) => {
    setUi((current) => {
      const has = current.selectedFilmIds.includes(filmId);
      return {
        ...current,
        selectedFilmIds: has
          ? current.selectedFilmIds.filter((id) => id !== filmId)
          : [...current.selectedFilmIds, filmId],
      };
    });
  };

  const resetRefine = () => {
    setUi((current) => ({
      ...current,
      amcAListOnly: false,
      includeSpecialEvents: true,
      excludeSoldOut: false,
    }));
    setStatusMessage('Refine controls reset to Stage 1 defaults.');
  };

  return (
    <>
    <article
      className={`v2-bpr${sheetFilm ? ' is-sheet-open' : ''}`}
      aria-labelledby="v2-bpr-title"
      data-build-plan-results-source={presentation.source}
      {...(sheetFilm ? { inert: '' } : {})}
    >
      <header className="v2-bpr-top" data-bpr-section="header">
        <button
          type="button"
          className="v2-bpr-back"
          aria-label={`Back to ${backLabel}`}
          onClick={onBack}
        >
          <span aria-hidden="true">←</span>
        </button>
        <button
          type="button"
          className="v2-bpr-share"
          aria-label={presentation.shareLabel}
          onClick={() =>
            announce('share', presentation.shareLabel, 'Share / export isn’t available in this Stage 1 Results shell yet.')
          }
        >
          <span>{presentation.shareLabel}</span>
          <IconShare width={14} height={14} aria-hidden="true" />
        </button>
      </header>

      <div className="v2-bpr-intro" data-bpr-section="summary">
        <h1 id="v2-bpr-title" className="v2-bpr-title">
          {presentation.pageTitle}{' '}
          <span className="v2-bpr-spark" aria-hidden="true">
            <IconSpark />
          </span>
        </h1>
        <p className="v2-bpr-summary">{presentation.summaryLine}</p>
      </div>

      <div
        className="v2-bpr-chips"
        data-bpr-section="preferenceChips"
        aria-label="Plan preferences"
      >
        {visibleChips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            className={`v2-bpr-chip v2-bpr-chip-${chip.kind}`}
            onClick={() => {
              if (chip.removable) {
                setUi((c) => ({
                  ...c,
                  dismissedChipIds: [...c.dismissedChipIds, chip.id],
                }));
                return;
              }
              announce(`chip-${chip.id}`, chip.value || chip.label);
            }}
          >
            {chip.label ? (
              <span className="v2-bpr-chip-label">{chip.label}</span>
            ) : null}
            <span className="v2-bpr-chip-value">{chip.value}</span>
            {chip.removable ? (
              <span aria-hidden="true">
                <IconClose width={10} height={10} />
              </span>
            ) : (
              <span aria-hidden="true">▾</span>
            )}
          </button>
        ))}
      </div>

      <div
        className="v2-bpr-quick"
        data-bpr-section="quickAdjust"
        aria-label="Quick adjustments"
      >
        {presentation.quickAdjust.map((item) => {
          const Icon = ADJUST_ICONS[item.icon] ?? IconSliders;
          return (
            <button
              key={item.id}
              type="button"
              className="v2-bpr-quick-card"
              onClick={() => announce(`quick-${item.id}`, item.label)}
            >
              <span className="v2-bpr-quick-icon" aria-hidden="true">
                <Icon width={14} height={14} />
              </span>
              <span className="v2-bpr-quick-copy">
                <span className="v2-bpr-quick-label">{item.label}</span>
                {item.value ? (
                  <span className="v2-bpr-quick-value">{item.value}</span>
                ) : null}
              </span>
              {item.id !== 'adjust' ? (
                <span aria-hidden="true">▾</span>
              ) : null}
            </button>
          );
        })}
      </div>

      <section
        className="v2-bpr-sort"
        data-bpr-section="sort"
        aria-labelledby="v2-bpr-sort-h"
      >
        <h2 id="v2-bpr-sort-h" className="v2-bpr-sort-label">
          {presentation.sortLabel}
        </h2>
        <div
          className="v2-bpr-sort-row"
          role="radiogroup"
          aria-label={presentation.sortLabel}
        >
          {presentation.sortOptions.map((opt) => {
            const Icon = SORT_ICONS[opt.icon] ?? IconSpark;
            const selected = ui.sortId === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`v2-bpr-sort-chip${selected ? ' is-selected' : ''}`}
                onClick={() => setUi((c) => ({ ...c, sortId: opt.id }))}
              >
                <Icon width={12} height={12} aria-hidden="true" />
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
        <p className="v2-bpr-count">{presentation.plansFoundLabel}</p>
      </section>

      <div
        className="v2-bpr-plans"
        data-bpr-section="plans"
        role="radiogroup"
        aria-label="Candidate plans"
      >
        {orderedPlans.map((plan) => (
          <PlanItineraryCard
            key={plan.id}
            plan={plan}
            active={ui.activePlanId === plan.id}
            favorited={ui.favoritedPlanIds.includes(plan.id)}
            selectedFilmIds={ui.selectedFilmIds}
            filmPreferences={ui.filmPreferences}
            sheetFilmId={sheetFilmId}
            filmButtonRefs={filmButtonRefs}
            viewPlanLabel={presentation.viewPlanLabel}
            moreActionsLabel={presentation.moreActionsLabel}
            addToScheduleLabel={presentation.addToScheduleLabel}
            onSelectPlan={(id) => setUi((c) => ({ ...c, activePlanId: id }))}
            onToggleFavorite={(id) =>
              setUi((c) => ({
                ...c,
                favoritedPlanIds: c.favoritedPlanIds.includes(id)
                  ? c.favoritedPlanIds.filter((x) => x !== id)
                  : [...c.favoritedPlanIds, id],
              }))
            }
            onToggleFilm={toggleFilm}
            onOpenFilmSheet={openFilmSheet}
            onViewPlan={(p) => announce(`view-${p.id}`, presentation.viewPlanLabel)}
            onMoreActions={(p) =>
              announce(`more-${p.id}`, presentation.moreActionsLabel)
            }
            onAddToSchedule={(p) =>
              announce(
                `schedule-${p.id}`,
                presentation.addToScheduleLabel,
                'Add to My Schedule isn’t available in this Stage 1 Results shell yet.',
              )
            }
          />
        ))}
        <button
          type="button"
          className="v2-bpr-load-more"
          onClick={() => announce('load-more', presentation.loadMoreLabel)}
        >
          {presentation.loadMoreLabel}
          <span aria-hidden="true">▾</span>
        </button>
      </div>

      <section
        className="v2-bpr-refine"
        data-bpr-section="refine"
        aria-labelledby="v2-bpr-refine-h"
      >
        <div className="v2-bpr-refine-head">
          <div>
            <h2 id="v2-bpr-refine-h" className="v2-bpr-refine-title">
              {presentation.refine.title}
            </h2>
            <p className="v2-bpr-refine-support">{presentation.refine.support}</p>
          </div>
          <button
            type="button"
            className="v2-bpr-reset"
            onClick={resetRefine}
          >
            <IconRefresh aria-hidden="true" />
            {presentation.refine.resetLabel}
          </button>
        </div>
        <div className="v2-bpr-refine-grid">
          {presentation.refine.fields.map((field) => {
            const Icon = ADJUST_ICONS[field.icon] ?? IconClock;
            return (
              <button
                key={field.id}
                type="button"
                className="v2-bpr-refine-field"
                onClick={() => announce(`refine-${field.id}`, field.label)}
              >
                <span aria-hidden="true">
                  <Icon width={14} height={14} />
                </span>
                <span className="v2-bpr-refine-field-copy">
                  <span>{field.label}</span>
                  <span className="v2-bpr-refine-field-value">{field.value}</span>
                </span>
                <span aria-hidden="true">▾</span>
              </button>
            );
          })}
        </div>
        <div className="v2-bpr-refine-extra">
          <button
            type="button"
            className="v2-bpr-refine-link"
            onClick={() =>
              announce('premium-formats', presentation.refine.premiumFormatsLabel)
            }
          >
            <span>
              <span className="v2-bpr-refine-link-label">
                {presentation.refine.premiumFormatsLabel}
              </span>
              <span className="v2-bpr-refine-link-value">
                {presentation.refine.premiumFormatsValue}
              </span>
            </span>
            <IconChevron aria-hidden="true" />
          </button>
          {presentation.refine.toggles.map((toggle) => (
            <label
              key={toggle.id}
              className="v2-bpr-refine-toggle"
              htmlFor={`v2-bpr-${toggle.id}`}
            >
              <span>
                <span className="v2-bpr-refine-link-label">{toggle.label}</span>
                <span className="v2-bpr-refine-link-value">
                  {ui[toggle.id] ? 'On' : 'Off'}
                </span>
              </span>
              <span className="v2-bp-switch">
                <input
                  id={`v2-bpr-${toggle.id}`}
                  type="checkbox"
                  role="switch"
                  checked={Boolean(ui[toggle.id])}
                  aria-checked={Boolean(ui[toggle.id])}
                  onChange={(e) =>
                    setUi((c) => ({ ...c, [toggle.id]: e.target.checked }))
                  }
                />
                <span className="v2-bp-switch-track" aria-hidden="true" />
              </span>
            </label>
          ))}
        </div>
      </section>
    </article>

    <p
      id={statusId}
      className="v2-visually-hidden"
      role="status"
      aria-live="polite"
    >
      {statusMessage ?? ''}
    </p>

    {sheetFilm ? (
      <PlanFilmInteractionSheet
        film={sheetFilm}
        preference={ui.filmPreferences[sheetFilm.id] ?? sheetFilm.preference}
        sheetCopy={presentation.filmSheet}
        onPreferenceChange={(prefId) =>
          setFilmPreference(sheetFilm.id, prefId)
        }
        onClose={closeSheet}
        onStubAction={(actionId, label, message) =>
          announce(actionId, label, message)
        }
      />
    ) : null}
    </>
  );
}
