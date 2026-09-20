/**
 * Recommended Experience destination — matching showtimes for a format/venue.
 */

import { useEffect, useMemo, useState } from 'react';
import { composeRecommendedExperienceDestination } from '../recommendedExperience/composeRecommendedExperienceDestination.js';
import ShowtimeActionSheet from '../showtimes/ShowtimeActionSheet.jsx';
import { resolveHomeOpportunity } from '../showtimes/resolveHomeOpportunity.js';
import {
  getScheduleSettings,
  subscribeScheduleSettings,
} from '../stores/scheduleSettingsStore.js';

function getBrowserStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/**
 * @param {{
 *   homeData?: object | null,
 *   enrichmentIndex?: object | null,
 *   filmKey?: string | null,
 *   experienceType?: 'format' | 'venue' | null,
 *   experienceId?: string | null,
 *   departureTiming?: object | null,
 *   onAcceptedPlansChange?: (() => void) | null,
 *   onViewPlanner?: (() => void) | null,
 * }} props
 */
export default function RecommendedExperienceSurface({
  homeData = null,
  enrichmentIndex = null,
  filmKey = null,
  experienceType = null,
  experienceId = null,
  departureTiming = null,
  onAcceptedPlansChange = null,
  onViewPlanner = null,
}) {
  const [settingsTick, setSettingsTick] = useState(0);
  useEffect(
    () => subscribeScheduleSettings(() => setSettingsTick((n) => n + 1)),
    [],
  );
  void settingsTick;
  const timeFormatId = getScheduleSettings(getBrowserStorage()).timeFormatId;

  /** @type {[null | { filmKey: string, opportunity: object, row: object }, Function]} */
  const [actionSheet, setActionSheet] = useState(null);

  const presentation = useMemo(
    () =>
      composeRecommendedExperienceDestination({
        homeData,
        enrichmentIndex,
        filmKey,
        experienceType,
        experienceId,
        timeFormatId,
        departureTiming,
      }),
    [
      homeData,
      enrichmentIndex,
      filmKey,
      experienceType,
      experienceId,
      timeFormatId,
      departureTiming,
    ],
  );

  if (!presentation.ok) {
    return (
      <section
        className="v2-re"
        aria-labelledby="v2-re-title"
        data-re-ok="false"
      >
        <h1 id="v2-re-title" className="v2-re-title">
          Recommended Experience
        </h1>
        <p className="v2-fd-muted" role="status">
          No matching showtimes are available for this recommendation right now.
        </p>
      </section>
    );
  }

  const { film, experience, signals, groups } = presentation;

  const openShowtimeActions = (theater, time, localDate) => {
    const opportunity = resolveHomeOpportunity(homeData, time.opportunityKey);
    if (!opportunity) return;
    setActionSheet({
      filmKey: film.filmKey,
      opportunity,
      row: {
        opportunityKey: time.opportunityKey,
        filmKey: film.filmKey,
        filmTitle: film.title,
        localDate,
        localTime: time.localTime,
        timeDisplay: time.timeDisplay,
        theaterName: theater.theaterName,
        formatLabels: time.formatLabel ? [time.formatLabel] : [],
        ticketUrl: time.ticketUrl,
      },
    });
  };

  return (
    <section
      className="v2-re"
      aria-labelledby="v2-re-title"
      data-re-ok="true"
      data-re-type={experience.type}
      data-re-id={experience.id}
    >
      <header className="v2-re-film">
        {film.posterUrl ? (
          <img className="v2-re-poster" src={film.posterUrl} alt="" />
        ) : (
          <span className="v2-re-poster v2-re-poster-fallback" aria-hidden="true" />
        )}
        <div className="v2-re-film-copy">
          <p className="v2-re-kicker">Recommended Experience</p>
          <h1 id="v2-re-title" className="v2-re-title">
            {film.title}
          </h1>
        </div>
      </header>

      <div className="v2-re-card" data-experience-type={experience.type}>
        <p className="v2-re-label">{experience.label}</p>
        {experience.reason ? (
          <p className="v2-re-reason">{experience.reason}</p>
        ) : null}
        {signals.length > 0 ? (
          <ul className="v2-re-signals" aria-label="Availability signals">
            {signals.map((signal) => (
              <li
                key={signal.id}
                className={`v2-re-signal v2-re-signal-${signal.kind}`}
                data-signal-kind={signal.kind}
              >
                {signal.label}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <section
        className="v2-re-showtimes"
        aria-labelledby="v2-re-showtimes-h"
      >
        <h2 id="v2-re-showtimes-h" className="v2-section-caps">
          Matching showtimes
        </h2>
        {groups.length === 0 ? (
          <p className="v2-fd-muted" role="status">
            No upcoming showtimes match this experience.
          </p>
        ) : (
          groups.map((day) => (
            <div key={day.localDate} className="v2-re-day">
              <h3 className="v2-re-day-label">{day.dateLabel}</h3>
              <ul className="v2-re-theater-list" role="list">
                {day.theaters.map((theater) => (
                  <li key={`${day.localDate}:${theater.theaterId}`}>
                    <div
                      className={`v2-re-theater-row v2-fd-today-accent-${theater.accent}`}
                    >
                      <div className="v2-re-theater-head">
                        <span
                          className={`v2-fd-today-mark v2-fd-today-mark-${theater.venueMark}`}
                          aria-hidden="true"
                        >
                          {theater.venueMark}
                        </span>
                        <span className="v2-re-theater-name">
                          {theater.theaterName}
                        </span>
                      </div>
                      <div
                        className="v2-fd-today-times"
                        role="group"
                        aria-label={`${theater.theaterName} times`}
                      >
                        {theater.times.map((time) => (
                          <button
                            key={time.opportunityKey}
                            type="button"
                            className="v2-fd-today-time"
                            data-opportunity-key={time.opportunityKey}
                            aria-label={`Select ${time.timeDisplay} at ${theater.theaterName}`}
                            onClick={() =>
                              openShowtimeActions(
                                theater,
                                time,
                                day.localDate,
                              )
                            }
                          >
                            <span className="v2-fd-today-time-clock">
                              {time.timeDisplay}
                            </span>
                            {time.formatLabel ? (
                              <span className="v2-fd-today-time-detail">
                                {time.formatLabel}
                              </span>
                            ) : null}
                          </button>
                        ))}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      <ShowtimeActionSheet
        open={Boolean(actionSheet)}
        onClose={() => setActionSheet(null)}
        opportunity={actionSheet?.opportunity ?? null}
        filmKey={actionSheet?.filmKey ?? null}
        row={actionSheet?.row ?? null}
        homeData={homeData}
        enrichmentIndex={enrichmentIndex}
        onPlansChanged={onAcceptedPlansChange}
        onViewPlanner={onViewPlanner}
      />
    </section>
  );
}
