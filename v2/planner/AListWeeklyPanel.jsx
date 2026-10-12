import { useEffect, useMemo, useState } from 'react';
import {
  A_LIST_WEEKLY_ALLOWANCE,
  buildAListWeeklyReport,
  readAListUsed,
  resolveAListCreditWeek,
  writeAListUsed,
} from './aListWeeklyReport.js';
import { subscribeFilmStoreMutations } from '../auth/filmStoreMutationBridge.js';
import './aListWeeklyPanel.css';

const PRIORITY_KEY = 'reel-seattle.v2.aListMustSee.v1';
const INITIAL_OTHER_LIMIT = 8;

function browserStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readAListPriorities(storage) {
  try {
    const value = JSON.parse(storage?.getItem(PRIORITY_KEY) ?? '[]');
    return Array.isArray(value)
      ? value.filter((id) => typeof id === 'string' && id.length < 130).slice(0, 300)
      : [];
  } catch {
    return [];
  }
}

function formatDate(date) {
  const [year, month, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function previousDate(iso) {
  const date = new Date(iso + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function FilmItem({ row, number, onOpenFilmDetail, togglePriority, weekOffset }) {
  return (
    <li className="v2-alist-film">
      {row.posterUrl ? (
        <img className="v2-alist-poster" src={row.posterUrl} alt="" loading="lazy" />
      ) : (
        <div className="v2-alist-poster v2-alist-poster-empty" aria-hidden="true" />
      )}
      <div className="v2-alist-film-body">
        <span className="v2-alist-film-topline">
          {number != null ? <span className="v2-alist-rank">{number}.</span> : null}
          <button
            type="button"
            className="v2-alist-film-title"
            onClick={() => onOpenFilmDetail?.({ filmKey: row.filmKey })}
          >
            {row.title}
          </button>
        </span>
        <p className="v2-alist-film-meta">
          {row.saved ? 'Saved · ' : ''}{row.thisWeekShowtimes} {row.thisWeekShowtimes === 1 ? 'showtime' : 'showtimes'} listed
          {row.nextConfirmed ? ' · Also listed the following week' : ''}
        </p>
        {!row.nextConfirmed ? (
          <p className="v2-alist-reason">
            {weekOffset === 1 ? 'No screenings announced beyond this week yet' : row.reason}
          </p>
        ) : null}
        <button
          type="button"
          className="v2-alist-priority"
          aria-pressed={row.mustSee}
          onClick={() => togglePriority(row.identity)}
        >
          {row.mustSee ? '★ Must-see' : '☆ Mark must-see'}
        </button>
      </div>
    </li>
  );
}

/**
 * Experimental report. Credits are manually logged per credit week, not
 * fetched from AMC. Future availability is confirmed listings only.
 */
export default function AListWeeklyPanel({ homeData, onOpenFilmDetail }) {
  const storage = browserStorage();
  const [expanded, setExpanded] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [showAllOthers, setShowAllOthers] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [revision, setRevision] = useState(0);
  const [priorityIds, setPriorityIds] = useState(() => readAListPriorities(browserStorage()));
  const [usedByWeek, setUsedByWeek] = useState({});
  const [message, setMessage] = useState('');

  const week = resolveAListCreditWeek(now, weekOffset);
  const creditsUsed = usedByWeek[week.startDate] ?? readAListUsed(storage, week.startDate);
  const currentWeek = resolveAListCreditWeek(now);
  const currentUsed = usedByWeek[currentWeek.startDate] ?? readAListUsed(storage, currentWeek.startDate);

  useEffect(() => subscribeFilmStoreMutations(() => setRevision((n) => n + 1)), []);
  useEffect(() => {
    const onFocus = () => setNow(new Date());
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const report = useMemo(() => buildAListWeeklyReport({
    homeData,
    storage,
    now,
    weekOffset,
    creditsUsed,
    priorityIds,
  }), [homeData, storage, now, weekOffset, creditsUsed, priorityIds, revision]);

  function changeUsed(next) {
    const clamped = Math.max(0, Math.min(A_LIST_WEEKLY_ALLOWANCE, next));
    if (!writeAListUsed(storage, week.startDate, clamped)) {
      setMessage('Could not save the credit count on this device.');
      return;
    }
    setUsedByWeek((current) => ({ ...current, [week.startDate]: clamped }));
    setMessage('');
  }

  function togglePriority(id) {
    const next = priorityIds.includes(id)
      ? priorityIds.filter((key) => key !== id)
      : [...priorityIds, id];
    try {
      if (!storage) throw new Error('Storage unavailable');
      storage.setItem(PRIORITY_KEY, JSON.stringify(next));
      setPriorityIds(next);
      setMessage('');
    } catch {
      setMessage('Could not save your must-see selection on this device.');
    }
  }

  function selectWeek(offset) {
    setWeekOffset(offset);
    setShowAllOthers(false);
    setMessage('');
  }

  const startLabel = formatDate(week.startDate);
  const endLabel = formatDate(previousDate(week.endDate));
  const recommendedLabel = weekOffset === 1 ? 'Plan for next week' : 'Prioritize this week';
  const otherCount = report.discover.length;
  const shownOthers = showAllOthers ? report.discover : report.discover.slice(0, INITIAL_OTHER_LIMIT);

  const renderRow = (row, number = null) => (
    <FilmItem key={row.identity} row={row} number={number}
      onOpenFilmDetail={onOpenFilmDetail} togglePriority={togglePriority}
      weekOffset={weekOffset} />
  );

  return (
    <section className="v2-alist" aria-label="Experimental A-List weekly report">
      <button
        type="button"
        className="v2-alist-toggle"
        aria-expanded={expanded}
        onClick={() => {
          setNow(new Date());
          setExpanded((current) => !current);
        }}
      >
        <span className="v2-alist-teaser">
          <span className="v2-alist-eyebrow">EXPERIMENTAL · AMC</span>
          <strong>Your A-List week</strong>
          <span className="v2-alist-teaser-caption">What to see now, what can wait</span>
        </span>
        <span className="v2-alist-count">{A_LIST_WEEKLY_ALLOWANCE - currentUsed} / 4 left <span aria-hidden="true">{expanded ? '−' : '+'}</span></span>
      </button>

      {expanded ? (
        <div className="v2-alist-content">
          <div className="v2-alist-week-switch" role="group" aria-label="Select A-List credit week">
            <button type="button" aria-pressed={weekOffset === 0}
              onClick={() => selectWeek(0)}>This week</button>
            <button type="button" aria-pressed={weekOffset === 1}
              onClick={() => selectWeek(1)}>Next week</button>
          </div>
          <div className="v2-alist-week">
            <strong>Fri {startLabel} – Thu {endLabel}</strong>
            <span>Friday 6 AM PT reset</span>
          </div>
          <div className="v2-alist-credits" aria-label="Manually logged A-List credits used">
            <div>
              <strong>{report.creditsRemaining} of 4 credits remaining</strong>
              <p>{weekOffset === 1
                ? 'Next week starts with four credits. Adjust if you have already planned usage.'
                : 'Credits used are tracked manually on this device.'}</p>
            </div>
            <div className="v2-alist-stepper">
              <button type="button" disabled={creditsUsed === 0}
                onClick={() => changeUsed(creditsUsed - 1)}
                aria-label="Decrease credits used">−</button>
              <output aria-label="Credits used">{creditsUsed} used</output>
              <button type="button" disabled={creditsUsed === 4}
                onClick={() => changeUsed(creditsUsed + 1)}
                aria-label="Increase credits used">+</button>
            </div>
          </div>
          {message ? <p role="status" className="v2-alist-error">{message}</p> : null}

          {weekOffset === 1 ? (
            <p className="v2-alist-preview-note">Early look · Only announced AMC showtimes are included. More films may appear as theaters publish their schedules.</p>
          ) : null}

          {!report.hasData ? (
            <p className="v2-alist-empty">AMC showtimes aren't loaded yet.</p>
          ) : report.eligibleAMCCount === 0 ? (
            <p className="v2-alist-empty">
              {weekOffset === 1
                ? 'No AMC showtimes have been announced for this credit week yet. Check back as schedules are published.'
                : 'No upcoming AMC showtimes are listed for the rest of this credit week.'}
            </p>
          ) : (
            <>
              <div className="v2-alist-section">
                <h3>{recommendedLabel}</h3>
                <p className="v2-alist-section-detail">
                  {weekOffset === 1
                    ? 'Saved and must-see films listed next week, with no later dates confirmed.'
                    : 'Your Saved and must-see films without confirmed showtimes in the following week.'}
                </p>
                {report.prioritize.length ? (
                  <ol className="v2-alist-list">
                    {report.prioritize.map((row, index) => renderRow(row, index + 1))}
                  </ol>
                ) : (
                  <p className="v2-alist-empty">No Saved or must-see films require attention in this credit week.</p>
                )}
                {report.remainingToChoose > 0 && report.prioritize.length ? (
                  <p className="v2-alist-footnote">{report.remainingToChoose} unallocated {report.remainingToChoose === 1 ? 'credit' : 'credits'}.</p>
                ) : null}
              </div>

              {report.canWait.length ? (
                <div className="v2-alist-section">
                  <h3>Confirmed the following week</h3>
                  <p className="v2-alist-section-detail">You can defer these films if you need credits for something else.</p>
                  <ul className="v2-alist-list">{report.canWait.map((row) => renderRow(row))}</ul>
                </div>
              ) : null}
              {report.otherSaved.length ? (
                <div className="v2-alist-section">
                  <h3>Other Saved films to review</h3>
                  <ul className="v2-alist-list">{report.otherSaved.map((row) => renderRow(row))}</ul>
                </div>
              ) : null}
              {otherCount ? (
                <details className="v2-alist-more">
                  <summary>Browse other AMC films ({otherCount})</summary>
                  <p className="v2-alist-section-detail">These aren't personalized recommendations. Save a film or mark it must-see to move it into your priorities.</p>
                  <ul className="v2-alist-list">{shownOthers.map((row) => renderRow(row))}</ul>
                  {!showAllOthers && otherCount > INITIAL_OTHER_LIMIT ? (
                    <button type="button" className="v2-alist-show-all"
                      onClick={() => setShowAllOthers(true)}>
                      Show all {otherCount} films
                    </button>
                  ) : null}
                </details>
              ) : null}
            </>
          )}
          <p className="v2-alist-disclaimer">
            Experimental planning guidance, not an AMC account balance or verified A-List eligibility.
            Missing future showtimes do not mean a film is leaving. Credits and must-see
            selections are stored on this device.
          </p>
        </div>
      ) : null}
    </section>
  );
}
