/**
 * Shorts Program Detail — Film Detail sibling with member list + schedule reuse.
 */

import { useMemo, useState } from 'react';
import {
  IconCalendarPlus,
  IconBookmark,
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
import { composeShortsProgramDetailPresentation } from '../shortsPrograms/composeShortsProgramDetailPresentation.js';

function FactIcon({ name }) {
  if (name === 'pin') return <IconPin />;
  if (name === 'person') return <IconPerson />;
  return <IconStar />;
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

/**
 * @param {object} props
 */
export default function ShortsProgramDetailSurface({
  shortsIndex = null,
  shortsProgramId = null,
  homeData = null,
  enrichmentIndex = null,
  collectionsArtifact = null,
  opportunityKey = null,
  timeFormatId = null,
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
  onOpenShowtimes = null,
  onOpenShort = null,
  onOpenCollection = null,
}) {
  const view = useMemo(
    () =>
      composeShortsProgramDetailPresentation({
        index: shortsIndex,
        shortsProgramId,
        homeData,
        enrichmentIndex,
        collectionsArtifact,
        timeFormatId,
        opportunityKey,
      }),
    [
      shortsIndex,
      shortsProgramId,
      homeData,
      enrichmentIndex,
      collectionsArtifact,
      timeFormatId,
      opportunityKey,
    ],
  );

  const [synopsisExpanded, setSynopsisExpanded] = useState(false);
  const [plannerOpen, setPlannerOpen] = useState(false);

  if (!view.resolved) {
    return (
      <section
        className="v2-fd v2-fd-empty"
        aria-labelledby="v2-spd-title"
        data-spd-resolved="false"
      >
        <h1 id="v2-spd-title">Program not found</h1>
        <p className="v2-fd-muted" role="status">
          This shorts program is unavailable in the current data window.
        </p>
      </section>
    );
  }

  const {
    hero,
    synopsis,
    members,
    collection,
    whySeeIt,
    bestWay,
    bestWayEmpty,
    today,
  } = view;
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
      className="v2-fd v2-spd"
      aria-labelledby="v2-spd-title"
      data-spd-resolved="true"
      data-spd-program-id={view.shortsProgramId}
      data-spd-film-key={view.filmKey ?? ''}
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
            aria-label={shareTitle ? `Share ${shareTitle}` : 'Share program'}
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
            <h1 id="v2-spd-title" className="v2-fd-title">
              {hero.title}
            </h1>
            {hero.metaLine ? <p className="v2-fd-meta">{hero.metaLine}</p> : null}
            {hero.genres ? <p className="v2-fd-genres">{hero.genres}</p> : null}
            {hero.badges?.length > 0 ? (
              <ul className="v2-fd-badges" role="list">
                {hero.badges.map((badge) => (
                  <li
                    key={badge.id}
                    className={
                      badge.tone === 'accent'
                        ? 'v2-fd-badge v2-spd-badge-accent'
                        : 'v2-fd-badge'
                    }
                  >
                    {badge.label}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </div>

      <div className="v2-fd-actions" role="toolbar" aria-label="Program actions">
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
            saveAvailable ? undefined : 'Save needs a valid schedule listing'
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

      {!whySeeIt.empty ? (
        <section
          className="v2-fd-section"
          aria-labelledby="v2-spd-why-h"
          data-fd-slot="why-see-it"
        >
          <div className="v2-fd-section-head">
            <h2 id="v2-spd-why-h" className="v2-section-caps">
              Why see it now
            </h2>
          </div>
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
                  <IconSpark width={24} height={24} />
                </span>
                <p className="v2-fd-signal-primary">{signal.primary}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section
        className="v2-fd-section v2-fd-section-about"
        aria-labelledby="v2-spd-about-h"
        data-fd-slot="synopsis"
      >
        <div className="v2-fd-section-head">
          <h2 id="v2-spd-about-h" className="v2-section-caps">
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
        {synopsis.needsMore ? (
          <div className="v2-fd-synopsis-foot">
            <button
              type="button"
              className="v2-fd-link v2-fd-more"
              aria-expanded={synopsisExpanded}
              onClick={() => setSynopsisExpanded((v) => !v)}
            >
              {synopsisExpanded ? 'Less' : 'More'}{' '}
              <span aria-hidden="true">{synopsisExpanded ? '▴' : '▾'}</span>
            </button>
          </div>
        ) : null}
      </section>

      <section
        className="v2-fd-section"
        aria-labelledby="v2-spd-films-h"
        data-spd-slot="films-in-program"
      >
        <div className="v2-fd-section-head">
          <h2 id="v2-spd-films-h" className="v2-section-caps">
            Films in this program
          </h2>
          <span className="v2-spd-films-count">
            {view.memberCount} short {view.memberCount === 1 ? 'film' : 'films'}
            {view.runtimeMin != null ? ` · ${view.runtimeMin} minutes total` : ''}
          </span>
        </div>
        <ul className="v2-spd-member-list" role="list">
          {members.map((member) => (
            <li key={member.shortId}>
              <button
                type="button"
                className="v2-spd-member-row"
                onClick={() =>
                  onOpenShort?.({
                    shortId: member.shortId,
                    shortsProgramId: view.shortsProgramId,
                  })
                }
              >
                <span className="v2-spd-member-thumb" aria-hidden="true">
                  {member.imageUrl ? (
                    <img src={member.imageUrl} alt="" />
                  ) : (
                    <span className="v2-spd-member-fallback">{member.title}</span>
                  )}
                </span>
                <span className="v2-spd-member-copy">
                  <span className="v2-spd-member-title">{member.title}</span>
                  {member.metaLine ? (
                    <span className="v2-spd-member-meta">{member.metaLine}</span>
                  ) : null}
                </span>
                <span className="v2-sd-program-chevron" aria-hidden="true">
                  <IconChevron />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {collection ? (
        <section
          className="v2-fd-section"
          aria-labelledby="v2-spd-part-h"
          data-spd-slot="part-of"
        >
          <div className="v2-fd-section-head">
            <h2 id="v2-spd-part-h" className="v2-section-caps">
              Part of
            </h2>
          </div>
          <button
            type="button"
            className="v2-sd-collection-card"
            aria-label={collection.title}
            onClick={() =>
              onOpenCollection?.({ collectionId: collection.collectionId })
            }
          >
            <span className="v2-sd-collection-mark" aria-hidden="true">
              {collection.imageUrl ? (
                <img src={collection.imageUrl} alt="" />
              ) : (
                <span>LS</span>
              )}
            </span>
            <span className="v2-sd-collection-copy">
              <span className="v2-sd-collection-title">{collection.title}</span>
              <span className="v2-sd-collection-meta">
                {[collection.venueLabel, collection.dateLabel]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </span>
            <span className="v2-sd-program-chevron" aria-hidden="true">
              <IconChevron />
            </span>
          </button>
        </section>
      ) : null}

      <section
        className={`v2-fd-section${today.empty ? ' v2-fd-section-last' : ''}`}
        aria-labelledby="v2-spd-best-h"
      >
        <div className="v2-fd-section-head">
          <h2 id="v2-spd-best-h" className="v2-section-caps">
            Best way to see it
          </h2>
        </div>
        {bestWayEmpty || !bestWay ? (
          <p className="v2-fd-muted" role="status">
            {view.availabilityNote ||
              'No upcoming opportunity is available for this program in the current window.'}
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
                <span className="v2-fd-best-kicker">Festival screening</span>
                <span className="v2-fd-best-format-value">
                  {bestWay.formatLabel}
                </span>
              </span>
              <span className="v2-fd-best-copy">
                <span className="v2-fd-best-theater">{bestWay.theaterName}</span>
                <span className="v2-fd-best-pres">
                  {hero.title} — Shorts Program
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

      {!today.empty ? (
        <section
          className="v2-fd-section v2-fd-section-last"
          aria-labelledby="v2-spd-today-h"
          data-spd-slot="showtimes"
        >
          <div className="v2-fd-section-head">
            <h2 id="v2-spd-today-h" className="v2-section-caps">
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
                        row.times.find((t) => t.actionable !== false)
                          ?.opportunityKey ??
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
                    ) : (
                      <span className="v2-fd-today-chips">
                        <span className="v2-fd-today-chip">Festival</span>
                        <span className="v2-fd-today-chip">Shorts Program</span>
                      </span>
                    )}
                  </span>
                  <span className="v2-fd-today-times">
                    {row.times.map((time) => (
                      <span
                        key={`${time.opportunityKey ?? ''}:${time.timeDisplay}`}
                        className={
                          time.actionable === false
                            ? 'v2-fd-today-time v2-fd-today-time-started'
                            : time.emphasized
                              ? 'v2-fd-today-time v2-fd-today-time-on'
                              : 'v2-fd-today-time'
                        }
                      >
                        <span className="v2-fd-today-time-clock">
                          {time.timeDisplay}
                        </span>
                      </span>
                    ))}
                  </span>
                  <IconChevron />
                </button>
              </li>
            ))}
          </ul>
          <p className="v2-fd-tz">
            <IconInfo /> {today.timezoneNote || 'Times shown in Pacific Time.'}
          </p>
        </section>
      ) : null}

      {plannerOpen ? (
        <div className="v2-fd-sheet-backdrop" role="presentation">
          <div
            className="v2-fd-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="v2-spd-planner-title"
          >
            <h2 id="v2-spd-planner-title">Add to planner</h2>
            <p className="v2-fd-sheet-copy">
              Choose how you want to plan around <strong>{hero.title}</strong>.
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
                Add this program to my calendar
              </span>
              <span className="v2-fd-sheet-choice-copy">
                Plan around the program’s existing screening.
              </span>
            </button>
            <button
              type="button"
              className="v2-fd-sheet-cancel"
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
