import { useEffect, useMemo, useState } from 'react';
import { resolveFilmDetailPresentation } from '../fixtures/resolveFilmDetailPresentation.js';
import { toFilmDetailView } from '../filmDetail/toFilmDetailView.js';
import {
  IconBookmark,
  IconCalendar,
  IconCalendarPlus,
  IconChevron,
  IconEye,
  IconEyeOff,
  IconInfo,
  IconPerson,
  IconPin,
  IconShare,
  IconSpark,
  IconStar,
} from '../icons.jsx';
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

function FactIcon({ name }) {
  if (name === 'pin') return <IconPin />;
  if (name === 'person') return <IconPerson />;
  return <IconStar />;
}

/**
 * Film Detail — production uses real HomeData via composeFilmDetailPresentation.
 * Mockup / visual fixtures activate only through explicit QC flags.
 */
export default function FilmDetailSurface({
  homeData = null,
  enrichmentIndex = null,
  filmKey = null,
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
  onStartPlanner,
  onOpenOpportunity,
  onOpenShowtimes,
}) {
  const [settingsTick, setSettingsTick] = useState(0);
  useEffect(
    () => subscribeScheduleSettings(() => setSettingsTick((n) => n + 1)),
    [],
  );
  void settingsTick;
  const timeFormatId = getScheduleSettings(getBrowserStorage()).timeFormatId;

  const resolved = useMemo(
    () =>
      resolveFilmDetailPresentation({
        homeData,
        filmKey,
        opportunityKey,
        enrichmentIndex,
        timeFormatId,
      }),
    [homeData, enrichmentIndex, filmKey, opportunityKey, timeFormatId],
  );
  const view = useMemo(() => toFilmDetailView(resolved), [resolved]);

  const [synopsisExpanded, setSynopsisExpanded] = useState(false);
  const [plannerOpen, setPlannerOpen] = useState(false);

  if (!view.resolved) {
    return (
      <section
        className="v2-fd v2-fd-empty"
        aria-labelledby="v2-fd-title"
        data-fd-mode={view.mode}
        data-fd-source={view.source}
        data-fd-resolved="false"
      >
        <h1 id="v2-fd-title">Film not found</h1>
        <p className="v2-fd-muted" role="status">
          This film is unavailable in the current showtimes window, or the link
          is stale. Reel Seattle does not fall back to sample fixture films.
        </p>
      </section>
    );
  }

  const { hero, whySeeIt, synopsis, bestWay, today } = view;
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
              ? 'v2-fd-action v2-fd-action-save v2-fd-action-save-on'
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
          <span>{saveLabel}</span>
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
              ? 'v2-fd-action v2-fd-action-seen v2-fd-action-seen-on'
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
          <span>Seen</span>
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
              ? 'v2-fd-action v2-fd-action-hide v2-fd-action-hide-on'
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
          <span>Not interested</span>
        </button>
        {notInterestedError ? (
          <span className="v2-visually-hidden" role="status">
            Could not update Not interested. Try again.
          </span>
        ) : null}
        <button
          type="button"
          className="v2-fd-action v2-fd-action-planner"
          onClick={() => setPlannerOpen(true)}
        >
          <IconCalendarPlus />
          <span>Add to planner</span>
        </button>
      </div>

      <section className="v2-fd-section" aria-labelledby="v2-fd-why-h" data-fd-slot="why-see-it">
        <div className="v2-fd-section-head">
          <h2 id="v2-fd-why-h" className="v2-section-caps">
            Why see it now
          </h2>
          {whySeeIt.totalCount > 0 ? (
            <span className="v2-fd-link">See all ({whySeeIt.totalCount})</span>
          ) : null}
        </div>
        {whySeeIt.empty ? (
          <p className="v2-fd-muted" role="status">
            No schedule-backed reasons are available for this title right now.
          </p>
        ) : (
          <ul className="v2-fd-signals v2-fd-signals-grid" role="list">
            {whySeeIt.signals.map((signal) => (
              <li
                key={signal.id}
                className={`v2-fd-signal v2-fd-signal-${signal.tone}`}
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

      <section className="v2-fd-section" aria-labelledby="v2-fd-best-h">
        <div className="v2-fd-section-head">
          <h2 id="v2-fd-best-h" className="v2-section-caps">
            Best way to see it
          </h2>
        </div>
        {view.bestWayEmpty || !bestWay ? (
          <p className="v2-fd-muted" role="status">
            No upcoming opportunity is available for this film in the current
            window.
          </p>
        ) : (
          <button
            type="button"
            className="v2-fd-best"
            aria-label={`Best opportunity: ${bestWay.formatLabel} at ${bestWay.theaterName}, ${bestWay.whenLabel}`}
            onClick={() =>
              onOpenOpportunity?.({
                filmKey: bestWay.filmKey ?? view.filmKey,
                opportunityKey: bestWay.opportunityKey ?? null,
              })
            }
          >
            <span className="v2-fd-best-top">
              <span className="v2-fd-best-format">
                <span className="v2-fd-best-kicker">Best opportunity</span>
                <span className="v2-fd-best-format-value">
                  {bestWay.formatLabel}
                </span>
              </span>
              <span className="v2-fd-best-copy">
                <span className="v2-fd-best-theater">{bestWay.theaterName}</span>
                <span className="v2-fd-best-pres">
                  {bestWay.presentationLabel}
                </span>
                <span className="v2-fd-best-when">{bestWay.whenLabel}</span>
              </span>
              <IconChevron />
            </span>
            {bestWay.facts?.length ? (
              <span className="v2-fd-best-facts" aria-label="Supporting details">
                {bestWay.facts.map((f) => (
                  <span key={f.id} className="v2-fd-best-fact">
                    <FactIcon name={f.icon} />
                    <span>{f.label}</span>
                  </span>
                ))}
              </span>
            ) : null}
          </button>
        )}
      </section>

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
            onClick={() =>
              onOpenShowtimes?.({
                filmKey: view.filmKey,
                opportunityKey: bestWay?.opportunityKey ?? null,
              })
            }
          >
            See all showtimes
          </button>
        </div>
        {today.empty ? (
          <p className="v2-fd-muted" role="status">
            No showtimes for today in the current window.
          </p>
        ) : (
          <ul className="v2-fd-today-list" role="list">
            {today.rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className={`v2-fd-today-row v2-fd-today-accent-${row.accent}`}
                  aria-label={`${row.theaterName}, today’s showtimes`}
                  onClick={() =>
                    onOpenShowtimes?.({
                      filmKey: view.filmKey,
                      theaterId: row.theaterId,
                      opportunityKey:
                        row.times.find((t) => t.emphasized)?.opportunityKey ??
                        row.times[0]?.opportunityKey ??
                        null,
                    })
                  }
                >
                  <span
                    className={`v2-fd-today-mark v2-fd-today-mark-${row.venueMark}`}
                    aria-hidden="true"
                  >
                    {row.venueMark}
                  </span>
                  <span className="v2-fd-today-main">
                    <span className="v2-fd-today-theater">{row.theaterName}</span>
                    {row.chips.length > 0 ? (
                      <span className="v2-fd-today-chips">
                        {row.chips.map((chip) => (
                          <span key={chip.label} className="v2-fd-today-chip">
                            {chip.icon === 'lock' ? <IconLock /> : null}
                            {chip.label}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </span>
                  <span className="v2-fd-today-times">
                    {row.times.map((time) => (
                      <span
                        key={`${time.opportunityKey ?? ''}:${time.timeDisplay}`}
                        className="v2-fd-today-time"
                        data-ticket-url={time.ticketUrl ? '1' : '0'}
                      >
                        {time.timeDisplay}
                      </span>
                    ))}
                  </span>
                  <IconChevron />
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="v2-fd-tz">
          <IconInfo /> {today.timezoneNote}
        </p>
      </section>

      {plannerOpen ? (
        <div className="v2-fd-sheet-backdrop" role="presentation">
          <div
            className="v2-fd-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="v2-fd-planner-title"
          >
            <h2 id="v2-fd-planner-title">Add to planner</h2>
            <p className="v2-fd-sheet-copy">
              Choose how you want to plan around{' '}
              <strong>{hero.title}</strong>.
            </p>
            <button
              type="button"
              className="v2-fd-sheet-choice"
              onClick={() => {
                setPlannerOpen(false);
                onStartPlanner?.({
                  filmKey: view.filmKey,
                  opportunityKey: bestWay?.opportunityKey ?? null,
                  mode: 'single',
                });
              }}
            >
              <span className="v2-fd-sheet-choice-title">
                Add this film to my calendar
              </span>
              <span className="v2-fd-sheet-choice-desc">
                Plan a single screening for this title.
              </span>
            </button>
            <button
              type="button"
              className="v2-fd-sheet-choice"
              onClick={() => {
                setPlannerOpen(false);
                onStartPlanner?.({
                  filmKey: view.filmKey,
                  opportunityKey: bestWay?.opportunityKey ?? null,
                  mode: 'multi',
                });
              }}
            >
              <span className="v2-fd-sheet-choice-title">Build a movie day</span>
              <span className="v2-fd-sheet-choice-desc">
                Plan multiple films together (marathon / double-feature style).
              </span>
            </button>
            <button
              type="button"
              className="v2-section-action"
              onClick={() => setPlannerOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
