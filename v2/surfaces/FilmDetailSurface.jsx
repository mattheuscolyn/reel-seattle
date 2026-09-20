import { useEffect, useMemo, useState } from 'react';
import { resolveFilmDetailPresentation } from '../fixtures/resolveFilmDetailPresentation.js';
import { toFilmDetailView } from '../filmDetail/toFilmDetailView.js';
import { WHY_SEE_IT_PREVIEW_LIMIT } from '../filmDetail/filmDetailModel.js';
import {
  cacheTmdbMovieDetail,
  getCachedTmdbOnlyFilm,
} from '../filmDetail/tmdbOnlyFilmCache.js';
import { lookupEnrichment } from '../enrichment/enrichmentIndex.js';
import {
  asTmdbFilmId,
  fetchTmdbMovieDetail,
} from '../search/tmdbSearchClient.js';
import {
  IconBookmark,
  IconCalendar,
  IconCalendarPlus,
  IconCheck,
  IconChevron,
  IconEye,
  IconEyeOff,
  IconInfo,
  IconShare,
  IconSpark,
} from '../icons.jsx';
import {
  getScheduleSettings,
  subscribeScheduleSettings,
} from '../stores/scheduleSettingsStore.js';
import ShowtimeActionSheet from '../showtimes/ShowtimeActionSheet.jsx';
import { resolveHomeOpportunity } from '../showtimes/resolveHomeOpportunity.js';

function getBrowserStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function formatFilmTitle(title) {
  if (!title || typeof title !== 'string') return title;
  const match = title.match(/^(\d{4}:)\s+(.+)$/);
  if (!match) return title;
  return (
    <>
      {match[1]}
      <br />
      {match[2]}
    </>
  );
}

function IconTrophy(props) {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable={false}
      {...props}
    >
      <path d="M8 4h8v3a4 4 0 0 1-8 0V4z" />
      <path d="M8 5H5.5A2.5 2.5 0 0 0 8 9.5" />
      <path d="M16 5h2.5A2.5 2.5 0 0 1 16 9.5" />
      <path d="M10 13h4v2.5l-2 3-2-3V13z" />
      <path d="M8 21h8" />
    </svg>
  );
}

function IconLock(props) {
  return (
    <svg
      width={11}
      height={11}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable={false}
      {...props}
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function IconCamera(props) {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable={false}
      {...props}
    >
      <circle cx="12" cy="13" r="4" />
      <path d="M4 9h3l1.5-2.5h7L17 9h3v10H4V9z" />
    </svg>
  );
}

function IconVenue(props) {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable={false}
      {...props}
    >
      <path d="M4 20V9l5-2v13" />
      <path d="M9 20V6l6-2v16" />
      <path d="M15 20v-9l5 2v7" />
      <path d="M11 9v1M11 12v1M11 15v1" />
    </svg>
  );
}

function SignalIcon({ name }) {
  if (name === 'trophy') return <IconTrophy width={24} height={24} />;
  if (name === 'calendar') return <IconCalendar width={24} height={24} />;
  if (name === 'building') return <IconVenue width={24} height={24} />;
  if (name === 'camera') return <IconCamera width={24} height={24} />;
  return <IconSpark width={24} height={24} />;
}

/**
 * Film Detail — production uses real HomeData via composeFilmDetailPresentation.
 * Mockup / visual fixtures activate only through explicit QC flags.
 */
export default function FilmDetailSurface({
  homeData = null,
  enrichmentIndex = null,
  filmKey = null,
  filmId = null,
  opportunityKey = null,
  saveAvailable = false,
  isSaved = false,
  saveLabel = 'Save',
  saveError = null,
  onToggleSave = null,
  seenAvailable = false,
  isSeen = false,
  seenError = null,
  onToggleSeen = null,
  notInterestedAvailable = false,
  isNotInterested = false,
  notInterestedError = null,
  onToggleNotInterested = null,
  onShare = null,
  shareTitle = null,
  shareStatus = null,
  onStartPlanner = null,
  onOpenOpportunity = null,
  onOpenShowtimes,
  onOpenRecommendedExperience = null,
  onAcceptedPlansChange = null,
  onViewPlanner = null,
  onHydrateFilmIds,
}) {
  void onStartPlanner;
  void onOpenOpportunity;
  const [settingsTick, setSettingsTick] = useState(0);
  const [tmdbRevision, setTmdbRevision] = useState(0);
  const [tmdbFetchState, setTmdbFetchState] = useState('idle');
  useEffect(
    () => subscribeScheduleSettings(() => setSettingsTick((n) => n + 1)),
    [],
  );
  void settingsTick;
  const timeFormatId = getScheduleSettings(getBrowserStorage()).timeFormatId;

  const tmdbFilmId = asTmdbFilmId(filmId) || asTmdbFilmId(filmKey);

  useEffect(() => {
    if (!tmdbFilmId) {
      setTmdbFetchState('idle');
      return undefined;
    }
    if (lookupEnrichment(enrichmentIndex, tmdbFilmId)) {
      setTmdbFetchState('idle');
      return undefined;
    }

    const controller = new AbortController();
    const cached = getCachedTmdbOnlyFilm(tmdbFilmId);
    setTmdbFetchState(cached ? 'refreshing' : 'loading');
    void (async () => {
      if (typeof onHydrateFilmIds === 'function') {
        await onHydrateFilmIds([tmdbFilmId]);
        if (controller.signal.aborted) return;
        setTmdbRevision((n) => n + 1);
        setTmdbFetchState('ready');
        return;
      }
      if (cached?.fetchedAt) {
        setTmdbFetchState('ready');
        return;
      }
      const result = await fetchTmdbMovieDetail(tmdbFilmId, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (result.ok && result.movie) {
        cacheTmdbMovieDetail(result.movie);
        setTmdbRevision((n) => n + 1);
        setTmdbFetchState('ready');
        return;
      }
      if (result.error === 'aborted') return;
      setTmdbFetchState(cached ? 'ready' : 'error');
    })();

    return () => controller.abort();
  }, [tmdbFilmId, enrichmentIndex, onHydrateFilmIds]);

  const resolved = useMemo(
    () =>
      resolveFilmDetailPresentation({
        homeData,
        filmKey,
        filmId: tmdbFilmId,
        opportunityKey,
        enrichmentIndex,
        timeFormatId,
      }),
    [
      homeData,
      enrichmentIndex,
      filmKey,
      tmdbFilmId,
      opportunityKey,
      timeFormatId,
      tmdbRevision,
    ],
  );
  const view = useMemo(() => toFilmDetailView(resolved), [resolved]);

  const [synopsisExpanded, setSynopsisExpanded] = useState(false);
  const [whySeeItExpanded, setWhySeeItExpanded] = useState(false);
  /** @type {[null | { filmKey: string, opportunity: object, row: object }, Function]} */
  const [actionSheet, setActionSheet] = useState(null);

  if (!view.resolved) {
    const waitingOnTmdb =
      Boolean(tmdbFilmId) &&
      (tmdbFetchState === 'loading' || tmdbFetchState === 'refreshing');
    return (
      <section
        className="v2-fd v2-fd-empty"
        aria-labelledby="v2-fd-title"
        data-fd-mode={view.mode}
        data-fd-source={view.source}
        data-fd-resolved="false"
      >
        <h1 id="v2-fd-title">
          {waitingOnTmdb ? 'Loading film…' : 'Film not found'}
        </h1>
        <p className="v2-fd-muted" role="status">
          {waitingOnTmdb
            ? 'Fetching film details.'
            : 'This film is unavailable in the current showtimes window, or the link is stale. Reel Seattle does not fall back to sample fixture films.'}
        </p>
      </section>
    );
  }

  const { hero, whySeeIt, synopsis, recommendedExperience, today } = view;
  const recommendedSignals = view.recommendedExperienceSignals ?? [];
  const bestWay = view.bestWay;
  const hasBackdrop = Boolean(hero.backdropUrl);
  const hasPoster = Boolean(hero.posterUrl);
  const backdropStyle = hasBackdrop
    ? {
        backgroundImage: `url("${hero.backdropUrl}")`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: 'cover',
        backgroundPosition: '72% 28%',
      }
    : hasPoster
      ? {
          backgroundImage: `linear-gradient(180deg, rgba(7,8,13,0.35) 0%, rgba(7,8,13,0.72) 55%, var(--v2-bg) 100%), url("${hero.posterUrl}")`,
          backgroundRepeat: 'no-repeat',
          backgroundSize: 'cover',
          backgroundPosition: 'center 20%',
        }
      : undefined;

  const synopsisText = synopsisExpanded ? synopsis.full : synopsis.preview;

  const openFilmShowtimeActions = (row, time) => {
    if (!time?.opportunityKey || time.actionable === false) return;
    const opportunity = resolveHomeOpportunity(homeData, time.opportunityKey);
    if (!opportunity) return;
    setActionSheet({
      filmKey: view.filmKey,
      opportunity,
      row: {
        opportunityKey: time.opportunityKey,
        filmKey: view.filmKey,
        filmTitle: hero.title,
        localDate: today.localDate ?? null,
        localTime: time.localTime,
        timeDisplay: time.timeDisplay,
        theaterName: row.theaterName,
        formatLabels: time.formatLabel ? [time.formatLabel] : [],
        ticketUrl: time.ticketUrl,
      },
    });
  };

  const openTheaterShowtimes = (row) => {
    onOpenShowtimes?.({
      filmKey: view.filmKey,
      theaterId: row.theaterId,
      opportunityKey:
        row.times.find((t) => t.emphasized)?.opportunityKey ??
        row.times.find((t) => t.actionable !== false)?.opportunityKey ??
        row.times[0]?.opportunityKey ??
        null,
    });
  };

  const openAllShowtimes = () => {
    onOpenShowtimes?.({
      filmKey: view.filmKey,
      opportunityKey: bestWay?.opportunityKey ?? null,
    });
  };

  return (
    <section
      className={
        view.mode === 'mockup-fixture' ? 'v2-fd v2-fd-mockup' : 'v2-fd'
      }
      aria-labelledby="v2-fd-title"
      data-fd-mode={view.mode}
      data-fd-source={view.source}
      data-fd-resolved="true"
      data-fd-film-key={view.filmKey ?? ''}
    >
      <div
        className={
          hasBackdrop || hasPoster
            ? 'v2-fd-hero v2-fd-hero-has-media'
            : 'v2-fd-hero'
        }
        style={backdropStyle}
      >
        {typeof onShare === 'function' ? (
          <button
            type="button"
            className="v2-fd-share"
            aria-label={shareTitle ? `Share ${shareTitle}` : 'Share film'}
            onClick={onShare}
          >
            <IconShare width={22} height={22} aria-hidden="true" />
          </button>
        ) : null}
        {shareStatus ? (
          <span className="v2-visually-hidden" role="status">
            {shareStatus}
          </span>
        ) : null}
        <div className="v2-fd-hero-inner">
          <div className="v2-fd-poster">
            {hasPoster ? (
              <img src={hero.posterUrl} alt="" />
            ) : (
              <div className="v2-fd-poster-fallback" aria-hidden="true">
                <span>{hero.title}</span>
              </div>
            )}
          </div>
          <div className="v2-fd-hero-copy">
            <h1 id="v2-fd-title" className="v2-fd-title">
              {formatFilmTitle(hero.title)}
            </h1>
            {hero.metaLine ? <p className="v2-fd-meta">{hero.metaLine}</p> : null}
            {hero.genres ? <p className="v2-fd-genres">{hero.genres}</p> : null}
            {hero.director ? (
              <p className="v2-fd-director">{hero.director}</p>
            ) : null}
            {hero.badges.length > 0 ? (
              <ul className="v2-fd-badges" role="list">
                {hero.badges.map((badge) => (
                  <li
                    key={badge.id}
                    className={
                      badge.tone === 'gold'
                        ? 'v2-fd-badge v2-fd-badge-gold'
                        : 'v2-fd-badge'
                    }
                  >
                    {badge.icon === 'trophy' ? (
                      <IconTrophy width={11} height={11} />
                    ) : null}
                    {badge.label}
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="v2-fd-badges" role="list" hidden aria-hidden="true" />
            )}
          </div>
        </div>
      </div>

      <div className="v2-fd-actions" role="toolbar" aria-label="Film actions">
        <button
          type="button"
          className={
            isSaved
              ? 'v2-fd-action v2-fd-action-save v2-fd-action-save-on is-selected'
              : 'v2-fd-action v2-fd-action-save'
          }
          aria-pressed={isSaved}
          aria-disabled={!saveAvailable}
          disabled={!saveAvailable}
          title={
            saveAvailable
              ? undefined
              : 'Save needs a valid film identity'
          }
          onClick={() => {
            if (!saveAvailable) return;
            onToggleSave?.();
          }}
        >
          <IconBookmark />
          <span className="v2-fd-action-copy">
            <span className="v2-fd-action-text">{saveLabel}</span>
            {isSaved ? (
              <IconCheck
                className="v2-fd-action-check"
                width={11}
                height={11}
                aria-hidden="true"
              />
            ) : null}
          </span>
        </button>
        {saveError ? (
          <span className="v2-visually-hidden" role="status">
            Could not update Saved. Try again.
          </span>
        ) : null}
        <button
          type="button"
          className={
            isSeen
              ? 'v2-fd-action v2-fd-action-seen v2-fd-action-seen-on is-selected'
              : 'v2-fd-action v2-fd-action-seen'
          }
          aria-pressed={isSeen}
          aria-disabled={!seenAvailable}
          disabled={!seenAvailable}
          title={
            seenAvailable
              ? undefined
              : 'Seen needs a valid film identity'
          }
          onClick={() => {
            if (!seenAvailable) return;
            onToggleSeen?.();
          }}
        >
          <IconEye />
          <span className="v2-fd-action-copy">
            <span className="v2-fd-action-text">Seen</span>
            {isSeen ? (
              <IconCheck
                className="v2-fd-action-check"
                width={11}
                height={11}
                aria-hidden="true"
              />
            ) : null}
          </span>
        </button>
        {seenError ? (
          <span className="v2-visually-hidden" role="status">
            Could not update Seen. Try again.
          </span>
        ) : null}
        <button
          type="button"
          className={
            isNotInterested
              ? 'v2-fd-action v2-fd-action-hide v2-fd-action-hide-on is-selected'
              : 'v2-fd-action v2-fd-action-hide'
          }
          aria-pressed={isNotInterested}
          aria-disabled={!notInterestedAvailable}
          disabled={!notInterestedAvailable}
          title={
            notInterestedAvailable
              ? undefined
              : 'Not interested needs a valid film identity'
          }
          onClick={() => {
            if (!notInterestedAvailable) return;
            onToggleNotInterested?.();
          }}
        >
          <IconEyeOff />
          <span className="v2-fd-action-copy">
            <span className="v2-fd-action-text">Not interested</span>
            {isNotInterested ? (
              <IconCheck
                className="v2-fd-action-check"
                width={11}
                height={11}
                aria-hidden="true"
              />
            ) : null}
          </span>
        </button>
        {notInterestedError ? (
          <span className="v2-visually-hidden" role="status">
            Could not update Not interested. Try again.
          </span>
        ) : null}
        <button
          type="button"
          className="v2-fd-action v2-fd-action-planner"
          onClick={openAllShowtimes}
        >
          <IconCalendarPlus />
          <span>Find a time</span>
        </button>
      </div>

      <section className="v2-fd-section" aria-labelledby="v2-fd-why-h" data-fd-slot="why-see-it">
        <div className="v2-fd-section-head">
          <h2 id="v2-fd-why-h" className="v2-section-caps">
            Why see it now
          </h2>
          {whySeeIt.signals.length > WHY_SEE_IT_PREVIEW_LIMIT ? (
            <button
              type="button"
              className="v2-fd-link"
              aria-expanded={whySeeItExpanded}
              onClick={() => setWhySeeItExpanded((open) => !open)}
            >
              {whySeeItExpanded
                ? 'Show less'
                : `See all (${whySeeIt.signals.length})`}
            </button>
          ) : null}
        </div>
        {whySeeIt.empty ? (
          <p className="v2-fd-muted" role="status">
            No schedule-backed reasons are available for this title right now.
          </p>
        ) : (
          <ul
            className={
              whySeeItExpanded
                ? 'v2-fd-signals v2-fd-signals-grid v2-fd-signals-expanded'
                : 'v2-fd-signals v2-fd-signals-grid'
            }
            role="list"
          >
            {(whySeeItExpanded
              ? whySeeIt.signals
              : whySeeIt.signals.slice(0, WHY_SEE_IT_PREVIEW_LIMIT)
            ).map((signal) => (
              <li
                key={signal.id}
                className={`v2-fd-signal v2-fd-signal-${signal.tone} v2-fd-signal-${signal.type}`}
                data-signal-type={signal.type}
              >
                <span
                  className={`v2-fd-signal-graphic v2-fd-signal-graphic-${signal.tone}`}
                  aria-hidden="true"
                >
                  <SignalIcon name={signal.icon} />
                </span>
                <p className="v2-fd-signal-primary">{signal.primary}</p>
                {signal.secondary ? (
                  <p className="v2-fd-signal-secondary">{signal.secondary}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        className="v2-fd-section v2-fd-section-about"
        aria-labelledby="v2-fd-about-h"
        data-fd-slot="synopsis"
      >
        <div className="v2-fd-section-head">
          <h2 id="v2-fd-about-h" className="v2-section-caps">
            What it’s about
          </h2>
        </div>
        {synopsis.available && synopsisText ? (
          <p className="v2-fd-synopsis">{synopsisText}</p>
        ) : (
          <p className="v2-fd-muted" role="status">
            Synopsis is not available in current public data.
          </p>
        )}
        <div className="v2-fd-synopsis-foot">
          {synopsis.tags.length > 0 ? (
            <ul className="v2-fd-tags" role="list">
              {synopsis.tags.map((tag) => (
                <li key={tag} className="v2-fd-tag">
                  {tag}
                </li>
              ))}
            </ul>
          ) : (
            <ul className="v2-fd-tags" role="list" hidden aria-hidden="true" />
          )}
          {synopsis.needsMore ? (
            <button
              type="button"
              className="v2-fd-link v2-fd-more"
              aria-expanded={synopsisExpanded}
              onClick={() => setSynopsisExpanded((v) => !v)}
            >
              {synopsisExpanded ? 'Less' : 'More'}{' '}
              <span aria-hidden="true">{synopsisExpanded ? '▴' : '▾'}</span>
            </button>
          ) : null}
        </div>
      </section>

      {!view.recommendedExperienceEmpty && recommendedExperience ? (
        <section className="v2-fd-section" aria-labelledby="v2-fd-re-h">
          <div className="v2-fd-section-head">
            <h2 id="v2-fd-re-h" className="v2-section-caps">
              Recommended Experience
            </h2>
          </div>
          <button
            type="button"
            className="v2-fd-best v2-fd-re-card"
            data-experience-type={recommendedExperience.type}
            data-experience-id={recommendedExperience.id}
            aria-label={`Recommended Experience: ${recommendedExperience.label}`}
            onClick={() =>
              onOpenRecommendedExperience?.({
                filmKey: view.filmKey,
                experienceType: recommendedExperience.type,
                experienceId: recommendedExperience.id,
              })
            }
          >
            <span className="v2-fd-best-top v2-fd-re-top">
              <span className="v2-fd-best-format v2-fd-re-format">
                <span className="v2-fd-best-kicker">Recommended</span>
                <span className="v2-fd-best-format-value">
                  {recommendedExperience.label}
                </span>
              </span>
              <span className="v2-fd-best-copy v2-fd-re-copy">
                {recommendedExperience.reason ? (
                  <span className="v2-fd-re-reason">
                    {recommendedExperience.reason}
                  </span>
                ) : null}
              </span>
              <IconChevron />
            </span>
            {recommendedSignals.length > 0 ? (
              <span
                className="v2-fd-best-facts v2-fd-re-signals"
                aria-label="Availability signals"
              >
                {recommendedSignals.map((signal) => (
                  <span
                    key={signal.id}
                    className={`v2-fd-best-fact v2-fd-re-signal v2-fd-re-signal-${signal.kind}`}
                    data-signal-kind={signal.kind}
                  >
                    <span>{signal.label}</span>
                  </span>
                ))}
              </span>
            ) : null}
          </button>
        </section>
      ) : null}

      <section
        className="v2-fd-section v2-fd-section-last"
        aria-labelledby="v2-fd-today-h"
      >
        <div className="v2-fd-section-head">
          <h2 id="v2-fd-today-h" className="v2-section-caps">
            Today’s showtimes
          </h2>
          <button
            type="button"
            className="v2-fd-link"
            onClick={openAllShowtimes}
          >
            See all showtimes
          </button>
        </div>
        {today.empty ? (
          <div role="status">
            <p className="v2-fd-muted">
              {view.availabilityNote ??
                'No showtimes for today in the current window.'}
            </p>
            {view.availabilityHint ? (
              <p className="v2-fd-muted">{view.availabilityHint}</p>
            ) : null}
          </div>
        ) : (
          <ul className="v2-fd-today-list" role="list">
            {today.rows.map((row) => (
              <li key={row.id}>
                <div
                  className={`v2-fd-today-row v2-fd-today-accent-${row.accent}`}
                >
                  <button
                    type="button"
                    className="v2-fd-today-theater-btn"
                    aria-label={`${row.theaterName}, see all showtimes`}
                    onClick={() => openTheaterShowtimes(row)}
                  >
                    <span
                      className={`v2-fd-today-mark v2-fd-today-mark-${row.venueMark}`}
                      aria-hidden="true"
                    >
                      {row.venueMark}
                    </span>
                    <span className="v2-fd-today-main">
                      <span className="v2-fd-today-theater">
                        {row.theaterName}
                      </span>
                      {row.chips.length > 0 ? (
                        <span className="v2-fd-today-chips">
                          {row.chips.map((chip) => (
                            <span
                              key={chip.label}
                              className="v2-fd-today-chip"
                            >
                              {chip.icon === 'lock' ? <IconLock /> : null}
                              {chip.label}
                            </span>
                          ))}
                        </span>
                      ) : null}
                    </span>
                    <IconChevron />
                  </button>
                  <div className="v2-fd-today-times" role="group" aria-label={`${row.theaterName} times`}>
                    {row.times.map((time) => {
                      const timeKey = `${time.opportunityKey ?? ''}:${time.timeDisplay}`;
                      if (time.actionable === false) {
                        return (
                          <span
                            key={timeKey}
                            className="v2-fd-today-time v2-fd-today-time-started"
                            data-ticket-url="0"
                            aria-label={`${time.timeDisplay}, ${time.stateLabel ?? 'Started'}`}
                          >
                            <span className="v2-fd-today-time-clock">
                              {time.timeDisplay}
                            </span>
                            <span className="v2-visually-hidden">
                              {time.stateLabel ?? 'Started'}
                            </span>
                            {time.detailLabel ? (
                              <span className="v2-fd-today-time-detail">
                                {time.detailLabel}
                              </span>
                            ) : null}
                          </span>
                        );
                      }
                      return (
                        <button
                          key={timeKey}
                          type="button"
                          className={
                            time.emphasized
                              ? 'v2-fd-today-time v2-fd-today-time-on'
                              : 'v2-fd-today-time'
                          }
                          data-opportunity-key={time.opportunityKey ?? undefined}
                          data-ticket-url={time.ticketUrl ? '1' : '0'}
                          aria-label={`Select ${time.timeDisplay} at ${row.theaterName}`}
                          onClick={() => openFilmShowtimeActions(row, time)}
                        >
                          <span className="v2-fd-today-time-clock">
                            {time.timeDisplay}
                          </span>
                          {time.detailLabel ? (
                            <span className="v2-fd-today-time-detail">
                              {time.detailLabel}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="v2-fd-tz">
          <IconInfo /> {today.timezoneNote}
        </p>
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
