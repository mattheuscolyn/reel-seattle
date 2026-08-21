/**
 * Locked showtimes performance picker — canonical Add a showtime mockup.
 * Film rows with nested theater groups and compact time chips.
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  IconCalendar,
  IconChevron,
  IconClock,
  IconLock,
  IconPin,
  IconSearch,
  IconSliders,
} from '../icons.jsx';
import {
  getBuildPlanFormSession,
  setBuildPlanFormSession,
  subscribeBuildPlanFormSession,
} from './buildPlanFormSession.js';
import {
  addLockedShowtimeToForm,
  compactChipFormatLabel,
  formatLockedShowtimeDetail,
  formatShowtimeChipLabel,
  groupPerformancesByFilm,
  listPlannerEligiblePerformances,
  removeLockedShowtimeFromForm,
} from './buildPlanPerformanceCatalog.js';
import { resolveBuildPlanHardConstraints } from './buildPlanHardConstraints.js';

/**
 * @param {object | null} form
 * @param {object | null | undefined} homeData
 */
function constraintChips(form, homeData) {
  if (!form) return [];
  const hard = resolveBuildPlanHardConstraints(form, homeData);
  const dateLabel =
    form.dateShort ||
    form.dateDisplay ||
    hard.dateIso ||
    'Date';
  let theaterLabel = 'Any theater';
  const pref = String(form.theaterPrefId ?? 'any');
  if (pref === 'amc') theaterLabel = 'Prefer AMC';
  else if (pref === 'indie' || pref === 'independent') theaterLabel = 'Prefer indie';
  else if (pref === 'custom') {
    const selected = Array.isArray(form.selectedTheaters)
      ? form.selectedTheaters.filter(Boolean)
      : [];
    if (selected.length === 1) {
      const theaters = Array.isArray(homeData?.theaters) ? homeData.theaters : [];
      const hit = theaters.find((t) => t.id === selected[0]);
      theaterLabel = hit?.name
        ? String(hit.name)
            .replace(/^AMC\s+/i, 'AMC ')
            .replace(/\s+Mall\s+/i, ' ')
            .slice(0, 18)
        : '1 theater';
    } else {
      theaterLabel =
        selected.length === 0
          ? 'Custom'
          : `${selected.length} theaters`;
    }
  } else if (pref !== 'any') {
    const theaters = Array.isArray(homeData?.theaters) ? homeData.theaters : [];
    const hit = theaters.find((t) => t.id === pref);
    theaterLabel = hit?.name
      ? String(hit.name).replace(/^AMC\s+/i, 'AMC ').slice(0, 22)
      : pref;
  }
  const start = form.startAfter || '';
  const finish = form.finishBefore || '';
  const timeLabel =
    !start && !finish
      ? 'Any time'
      : start === '10:00 AM' && finish === '11:00 PM'
        ? 'Any time'
        : start === '11:00 AM' && (finish === '11:00 PM' || !finish)
          ? 'Any time'
          : `${start}–${finish}`.replace(/^\–|–$/g, '') || 'Time window';

  return [
    { id: 'date', label: dateLabel, Icon: IconCalendar },
    { id: 'theater', label: theaterLabel, Icon: IconPin },
    { id: 'time', label: timeLabel, Icon: IconClock },
    { id: 'filters', label: 'Filters', Icon: IconSliders },
  ];
}

function ShowtimeChip({ perf, includeFormat, onLock }) {
  return (
    <button
      type="button"
      className="v2-bp-showtime-chip"
      aria-pressed="false"
      aria-label={`Lock ${perf.title} at ${perf.clockLabel}${
        perf.theaterName ? ` at ${perf.theaterName}` : ''
      }`}
      data-performance-key={perf.performanceKey}
      onClick={() => onLock(perf)}
    >
      {formatShowtimeChipLabel(perf, { includeFormat })}
    </button>
  );
}

/**
 * @param {{
 *   onDone: () => void,
 *   onBack: () => void,
 *   homeData?: object | null,
 *   enrichmentIndex?: object | null,
 * }} props
 */
export default function BuildPlanShowtimeManageSurface({
  onDone,
  onBack,
  homeData = null,
  enrichmentIndex = null,
}) {
  const searchId = useId();
  const statusId = useId();
  const doneBusyRef = useRef(false);
  const [query, setQuery] = useState('');
  const [statusMessage, setStatusMessage] = useState(null);
  const [lockedOpen, setLockedOpen] = useState(true);
  const [formTick, setFormTick] = useState(0);

  useEffect(() => {
    return subscribeBuildPlanFormSession(() => {
      setFormTick((n) => n + 1);
    });
  }, []);

  const form = getBuildPlanFormSession();
  const locked = Array.isArray(form?.lockedShowtimes) ? form.lockedShowtimes : [];
  const lockedKeys = new Set(locked.map((l) => l.performanceKey).filter(Boolean));
  const chips = constraintChips(form, homeData);

  const catalog = useMemo(() => {
    void formTick;
    if (!form) return [];
    return listPlannerEligiblePerformances(homeData, form, {
      enrichmentIndex,
    });
  }, [homeData, enrichmentIndex, form, formTick]);

  const searchable = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter((perf) => {
      const hay = [
        perf.title,
        perf.theaterName,
        perf.clockLabel,
        perf.formatSummary,
        perf.formatLabel,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [catalog, query]);

  const addMorePerformances = useMemo(
    () => searchable.filter((p) => !lockedKeys.has(p.performanceKey)),
    [searchable, lockedKeys],
  );

  const filmGroups = useMemo(
    () => groupPerformancesByFilm(addMorePerformances),
    [addMorePerformances],
  );

  const announce = (message) => setStatusMessage(message);

  const handleToggleLock = (perf) => {
    if (!form || !perf?.performanceKey) return;
    if (lockedKeys.has(perf.performanceKey)) {
      setBuildPlanFormSession(
        removeLockedShowtimeFromForm(form, perf.performanceKey),
      );
      announce(`Unlocked ${perf.title}.`);
      return;
    }
    const result = addLockedShowtimeToForm(form, perf);
    if (!result.added) {
      announce(
        result.reason === 'duplicate'
          ? 'That screening is already locked.'
          : 'Couldn’t lock that screening.',
      );
      return;
    }
    setBuildPlanFormSession(result.form);
    announce(`Locked ${perf.title}.`);
  };

  const handleRemove = (performanceKey) => {
    if (!form) return;
    setBuildPlanFormSession(removeLockedShowtimeFromForm(form, performanceKey));
  };

  const handleDone = () => {
    if (doneBusyRef.current) return;
    doneBusyRef.current = true;
    onDone?.();
  };

  return (
    <section
      className="v2-bp-manage-page v2-bp-showtime-manage"
      aria-labelledby="v2-bp-showtime-title"
      data-build-plan-manage="lockedShowtimes"
    >
      <header className="v2-bp-manage-header">
        <h1 id="v2-bp-showtime-title" className="v2-bp-manage-title">
          Add a showtime
        </h1>
        <p className="v2-bp-manage-support">
          Lock an exact screening into every plan. Film preferences stay
          separate.
        </p>
      </header>

      <div className="v2-bp-manage-search">
        <span className="v2-bp-manage-search-icon" aria-hidden="true">
          <IconSearch width={13} height={13} />
        </span>
        <label className="v2-visually-hidden" htmlFor={searchId}>
          Search showtimes
        </label>
        <input
          id={searchId}
          className="v2-bp-manage-search-input"
          type="search"
          value={query}
          placeholder="Search titles, theaters, or times"
          autoComplete="off"
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div
        className="v2-bp-manage-filters v2-bp-showtime-constraint-chips"
        role="list"
        aria-label="Current plan constraints"
      >
        {chips.map(({ id, label, Icon }) => (
          <span key={id} className="v2-bp-manage-chip is-static" role="listitem">
            <span aria-hidden="true">
              <Icon width={11} height={11} />
            </span>
            <span>{label}</span>
          </span>
        ))}
      </div>

      <p
        className="v2-visually-hidden"
        id={statusId}
        role="status"
        aria-live="polite"
      >
        {statusMessage}
      </p>

      <section
        className="v2-bp-manage-block v2-bp-showtime-locked-block"
        aria-labelledby="v2-bp-locked-h"
      >
        <button
          type="button"
          className="v2-bp-manage-section-head"
          id="v2-bp-locked-h"
          aria-expanded={lockedOpen}
          aria-controls="v2-bp-locked-list"
          onClick={() => setLockedOpen((v) => !v)}
        >
          <span className="v2-bp-manage-section-title">Locked showtimes</span>
          <span className="v2-bp-manage-section-meta">
            <span className="v2-bp-manage-count-badge" aria-hidden="true">
              {locked.length}
            </span>
            <span
              className={`v2-bp-manage-disc${lockedOpen ? ' is-open' : ''}`}
              aria-hidden="true"
            >
              <IconChevron width={12} height={12} />
            </span>
          </span>
        </button>
        <div id="v2-bp-locked-list" hidden={!lockedOpen}>
          {locked.length === 0 ? (
            <p className="v2-bp-showtime-locked-empty">No showtimes locked yet</p>
          ) : (
            <div className="v2-bp-manage-list">
              {locked.map((lock) => {
                const bits = formatLockedShowtimeDetail(lock).split(' · ');
                const timeTheater = bits.slice(0, 2).join(' · ');
                const formatLine =
                  compactChipFormatLabel(lock.formatLabel) ||
                  compactChipFormatLabel(bits.length > 2 ? bits.slice(2).join(' · ') : '');
                return (
                  <div
                    key={lock.performanceKey}
                    className="v2-bp-manage-row v2-bp-showtime-locked-row"
                    data-performance-key={lock.performanceKey}
                  >
                    {lock.posterUrl ? (
                      <img
                        className="v2-bp-showtime-poster"
                        src={lock.posterUrl}
                        alt=""
                      />
                    ) : (
                      <span className="v2-bp-showtime-poster v2-bp-manage-poster-fallback" />
                    )}
                    <span className="v2-bp-manage-row-copy">
                      <span className="v2-bp-manage-row-title">{lock.title}</span>
                      <span className="v2-bp-manage-row-meta">{timeTheater}</span>
                      {formatLine ? (
                        <span className="v2-bp-manage-row-meta v2-bp-showtime-format">
                          {formatLine}
                        </span>
                      ) : null}
                    </span>
                    <button
                      type="button"
                      className="v2-bp-showtime-locked-badge"
                      aria-label={`Unlock ${lock.title}`}
                      onClick={() => handleRemove(lock.performanceKey)}
                    >
                      <IconLock width={10} height={10} aria-hidden="true" />
                      <span>Locked</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section
        className="v2-bp-manage-block v2-bp-showtime-add-block"
        aria-labelledby="v2-bp-add-showtimes-h"
      >
        <div className="v2-bp-manage-section-head v2-bp-manage-section-head-static">
          <h2
            id="v2-bp-add-showtimes-h"
            className="v2-bp-manage-section-title"
          >
            Add more showtimes
          </h2>
          <span className="v2-bp-showtime-browse-hint">Eligible showtimes</span>
        </div>

        {filmGroups.length === 0 ? (
          <p className="v2-bp-showtime-add-empty">
            {query.trim()
              ? 'No showtimes match your search'
              : 'No showtimes match your current date, theater, and time window.'}
          </p>
        ) : (
          <div className="v2-bp-showtime-film-list">
            {filmGroups.map((group) => (
              <article
                key={group.filmKey}
                className="v2-bp-showtime-film-row"
                data-film-key={group.filmKey}
                data-multi-theater={group.multiTheater ? '1' : '0'}
              >
                {group.imageUrl ? (
                  <img
                    className="v2-bp-showtime-poster"
                    src={group.imageUrl}
                    alt=""
                  />
                ) : (
                  <span className="v2-bp-showtime-poster v2-bp-manage-poster-fallback" />
                )}
                <div className="v2-bp-showtime-film-body">
                  <p className="v2-bp-showtime-film-title">{group.title}</p>
                  {group.theaterGroups.map((tg) => {
                    const chipsVisible = tg.performances.filter(
                      (p) => !lockedKeys.has(p.performanceKey),
                    );
                    if (chipsVisible.length === 0) return null;
                    return (
                      <div
                        key={tg.theaterId}
                        className="v2-bp-showtime-theater-group"
                        data-theater-id={tg.theaterId}
                      >
                        <p className="v2-bp-showtime-theater-label">
                          {tg.theaterName}
                        </p>
                        <div
                          className="v2-bp-showtime-chip-row"
                          role="group"
                          aria-label={`${group.title} at ${tg.theaterName}`}
                        >
                          {chipsVisible.map((perf) => (
                            <ShowtimeChip
                              key={perf.performanceKey}
                              perf={perf}
                              includeFormat
                              onLock={handleToggleLock}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <footer
        className="v2-bp-manage-footer v2-bp-showtime-footer"
        aria-label="Lock summary"
      >
        <div className="v2-bp-manage-footer-copy">
          <p className="v2-bp-manage-footer-count">{locked.length} locked</p>
          <p className="v2-bp-manage-footer-support">
            Exact screening will be required
          </p>
        </div>
        <button
          type="button"
          className="v2-bp-manage-done"
          onClick={handleDone}
        >
          Done
        </button>
      </footer>
    </section>
  );
}
