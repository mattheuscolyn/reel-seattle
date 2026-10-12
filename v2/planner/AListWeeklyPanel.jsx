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

function FilmItem({ row, number, onOpenFilmDetail, isPriority, togglePriority }) {
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
        <span className="v2-alist-film-meta">
          {row.saved ? 'Saved' : 'Not saved'} · {row.thisWeekShowtimes} listed this week
        </span>
        <p className="v2-alist-reason">{row.reason}</p>
        <button
          type="button"
          className="v2-alist-priority"
          aria-pressed={isPriority}
          onClick={() => togglePriority(row.identity)}
        >
          {isPriority ? '★ Must-see' : '☆ Mark must-see'}
        </button>
      </div>
    </li>
  );
}

/**
 * Self-contained experimental report. No attempt is made to access AMC account
 * balances, or to assert that every AMC screening qualifies for A-List.
 */
export default function AListWeeklyPanel({ homeData, onOpenFilmDetail }) {
  const storage = browserStorage();
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [revision, setRevision] = useState(0);
  const [priorityIds, setPriorityIds] = useState(() => readAListPriorities(browserStorage()));
  const week = resolveAListCreditWeek(now);
  const [used, setUsed] = useState(() => readAListUsed(storage, week.startDate));
  const [message, setMessage] = useState('');

  useEffect(() => subscribeFilmStoreMutations(() => setRevision((n) => n + 1)), []);
  useEffect(() => {
    const onFocus = () => setNow(new Date());
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);
  useEffect(() => {
    setUsed(readAListUsed(storage, week.startDate));
  }, [storage, week.startDate]);

  const report = useMemo(() => buildAListWeeklyReport({
    homeData,
    storage,
    now,
    creditsUsed: used,
    priorityIds,
  }), [homeData, storage, now, used, priorityIds, revision]);

  function changeUsed(next) {
    const clamped = Math.max(0, Math.min(A_LIST_WEEKLY_ALLOWANCE, next));
    if (!writeAListUsed(storage, week.startDate, clamped)) {
      setMessage('Could not save the credit count on this device.');
      return;
    }
    setUsed(clamped);
    setMessage('');
  }

  function togglePriority(id) {
    const next = priorityIds.includes(id)
      ? priorityIds.filter((key) => key !== id)
      : [...priorityIds, id];
    try {
      storage?.setItem(PRIORITY_KEY, JSON.stringify(next));
      setPriorityIds(next);
      setMessage('');
    } catch {
      setMessage('Could not save your must-see selection on this device.');
    }
  }

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
        <span className="v2-alist-count">{report.creditsRemaining} / 4 left <span aria-hidden="true">{expanded ? '−' : '+'}</span></span>
      </button>
      {expanded ? (
        <div className="v2-alist-content">
          <div className="v2-alist-week">
            <span>Fri {formatDate(week.startDate)} – Thu {formatDate(
              // Thursday before next Friday
              (() => {
                const end = new Date(week.endDate + 'T12:00:00Z');
                end.setUTCDate(end.getUTCDate() - 1);
                return end.toISOString().slice(0, 10);
              })()
            )}</span>
            <span>Resets Friday at 6 AM PT</span>
          </div>
          <div className="v2-alist-credits" aria-label="Credit usage (manually entered)">
            <div>
              <strong>{report.creditsRemaining} credits remaining</strong>
              <p>Track usage manually; Reel Seattle is not linked to your AMC account.</p>
            </div>
            <div className="v2-alist-stepper">
              <button type="button" disabled={used === 0} onClick={() => changeUsed(used - 1)} aria-label="Decrease credits used">−</button>
              <output aria-label="Credits used">{used} used</output>
              <button type="button" disabled={used === 4} onClick={() => changeUsed(used + 1)} aria-label="Increase credits used">+</button>
            </div>
          </div>
          {message ? <p role="status" className="v2-alist-error">{message}</p> : null}
          {!report.hasData ? (
            <p className="v2-alist-empty">AMC showtimes aren't loaded yet.</p>
          ) : report.eligibleAMCCount === 0 ? (
            <p className="v2-alist-empty">No remaining AMC screenings found for this credit week.</p>
          ) : (
            <>
              <div className="v2-alist-section">
                <h3>Prioritize this week</h3>
                {report.prioritize.length ? (
                  <ol className="v2-alist-list">
                    {report.prioritize.map((row, index) => (
                      <FilmItem key={row.identity} row={row} number={index + 1}
                        onOpenFilmDetail={onOpenFilmDetail}
                        isPriority={row.mustSee} togglePriority={togglePriority} />
                    ))}
                  </ol>
                ) : (
                  <p className="v2-alist-empty">No urgent Saved or must-see films identified. You don't need to fill every credit.</p>
                )}
                {report.remainingToChoose > 0 && report.prioritize.length ? (
                  <p className="v2-alist-footnote">{report.remainingToChoose} more credits available. Consider the other films below.</p>
                ) : null}
              </div>
              {report.canWait.length ? (
                <div className="v2-alist-section">
                  <h3>Can wait until next week</h3>
                  <p className="v2-alist-section-detail">These films already have AMC screenings listed for next week's credit cycle.</p>
                  <ul className="v2-alist-list">{report.canWait.map((row) =>
                    <FilmItem key={row.identity} row={row} onOpenFilmDetail={onOpenFilmDetail}
                      isPriority={row.mustSee} togglePriority={togglePriority} />
                  )}</ul>
                </div>
              ) : null}
              {report.otherSaved.length ? (
                <div className="v2-alist-section">
                  <h3>Also at risk of losing showtimes</h3>
                  <ul className="v2-alist-list">{report.otherSaved.map((row) =>
                    <FilmItem key={row.identity} row={row} onOpenFilmDetail={onOpenFilmDetail}
                      isPriority={row.mustSee} togglePriority={togglePriority} />
                  )}</ul>
                </div>
              ) : null}
              {report.discover.length ? (
                <details className="v2-alist-more">
                  <summary>Other AMC films to consider ({report.discover.length})</summary>
                  <p className="v2-alist-section-detail">Not ranked by your taste. Save a film or mark it must-see to prioritize it.</p>
                  <ul className="v2-alist-list">{report.discover.slice(0, 24).map((row) =>
                    <FilmItem key={row.identity} row={row} onOpenFilmDetail={onOpenFilmDetail}
                      isPriority={row.mustSee} togglePriority={togglePriority} />
                  )}</ul>
                </details>
              ) : null}
            </>
          )}
          <p className="v2-alist-disclaimer">Experimental scheduling guidance, not an AMC account balance or verified A-List eligibility. Missing next-week showtimes do not mean a film is leaving. Forecast probabilities are deliberately excluded until their freshness and calibration are validated. Must-see settings and credit counts are stored on this device.</p>
        </div>
      ) : null}
    </section>
  );
}
