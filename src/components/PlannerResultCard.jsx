import { useEffect, useState } from 'react';
import PosterImage from './PosterImage.jsx';
import PlannerTimeline from './PlannerTimeline.jsx';
import {
  buildMovieSequenceItems,
  formatMovieSequenceLabel,
  formatPlannerCommitmentLines,
  formatPlannerMovieDisplay,
  formatPlannerScheduleSummary,
  getMovieFormatTags,
} from '../utils/plannerDisplay.js';
import { formatPlannerLineupShareText } from '../utils/plannerShare.js';
import { shareTextWithFallback } from '../utils/shareLinkUtils.js';

function FormatTags({ movie }) {
  const tags = getMovieFormatTags(movie);
  if (tags.length === 0) return null;

  return (
    <div className="planner-format-tags">
      {tags.map((tag) => (
        <span key={tag} className="planner-format-tag">
          {tag}
        </span>
      ))}
    </div>
  );
}

function FilmRow({ movie, index, total }) {
  const display = formatPlannerMovieDisplay(movie);

  return (
    <div className="planner-film-row">
      <div className="planner-film">
        <div className="planner-film-poster-wrap">
          <PosterImage
            src={movie?.poster}
            alt={display.film}
            className="planner-film-poster"
          />
          <span className="planner-film-label">{formatMovieSequenceLabel(index, total)}</span>
        </div>
        <div className="planner-film-details">
          <h4 className="planner-film-title">{display.film}</h4>
          <p className="planner-film-time-range">
            {display.startTime} – {display.endTime} · {display.runtime}
          </p>
          <FormatTags movie={movie} />
          <dl className="planner-film-meta planner-film-meta--verbose">
            <div className="planner-film-meta-row">
              <dt>Start</dt>
              <dd>{display.startTime}</dd>
            </div>
            <div className="planner-film-meta-row">
              <dt>Ends</dt>
              <dd>{display.endTime}</dd>
            </div>
            <div className="planner-film-meta-row">
              <dt>Runtime</dt>
              <dd>{display.runtime}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}

function GapRow({ label }) {
  return (
    <div className="planner-gap-row" aria-label={label}>
      <span className="planner-gap-line" aria-hidden="true" />
      <span className="planner-gap-label">{label}</span>
      <span className="planner-gap-line" aria-hidden="true" />
    </div>
  );
}

export default function PlannerResultCard({ schedule, filterShareUrl = '' }) {
  const [shareStatus, setShareStatus] = useState('idle');
  const summary = formatPlannerScheduleSummary(schedule);
  const commitment = formatPlannerCommitmentLines(schedule);
  const sequenceItems = buildMovieSequenceItems(schedule);
  const movies = schedule?.movies ?? [];

  useEffect(() => {
    if (shareStatus === 'idle') return undefined;
    const timer = setTimeout(() => setShareStatus('idle'), 2500);
    return () => clearTimeout(timer);
  }, [shareStatus]);

  const handleShareLineup = async () => {
    const text = formatPlannerLineupShareText(schedule, { filterUrl: filterShareUrl });
    if (!text) {
      setShareStatus('error');
      return;
    }

    const result = await shareTextWithFallback({
      title: `${summary.theater} movie plan`,
      text,
    });

    if (result.method === 'cancelled') return;

    if (!result.ok) {
      setShareStatus('error');
      return;
    }

    setShareStatus(result.method === 'share' ? 'shared' : 'copied');
  };

  return (
    <article
      className="planner-result-card"
      aria-label={`${summary.theater}: ${movies.length} films`}
    >
      <header className="planner-result-card-header">
        <div className="planner-card-heading">
          <h3 className="planner-result-theater">{summary.theater}</h3>
          <p className="planner-commitment-summary">
            <span>{commitment.starts}</span>
            <span aria-hidden="true"> · </span>
            <span>{commitment.ends}</span>
          </p>
        </div>
        <div className="planner-result-card-badges">
          <span className="planner-film-count-badge">{summary.filmCountLabel} films</span>
          <div className="planner-result-card-actions">
            <button
              type="button"
              className="planner-share-lineup"
              onClick={handleShareLineup}
            >
              Share lineup
            </button>
            <div
              className={`planner-share-lineup-status${
                shareStatus === 'error' ? ' planner-share-lineup-status--error' : ''
              }`}
              aria-live="polite"
            >
              {shareStatus === 'shared' ? 'Shared' : null}
              {shareStatus === 'copied' ? 'Copied' : null}
              {shareStatus === 'error' ? 'Could not share' : null}
            </div>
          </div>
        </div>
      </header>

      <div className="planner-card-stats planner-card-stats--detailed">
        <div className="planner-stat">
          <span className="planner-stat-label">Total</span>
          <span className="planner-stat-value">{commitment.total}</span>
        </div>
        <div className="planner-stat">
          <span className="planner-stat-label">Movies</span>
          <span className="planner-stat-value">{commitment.movies}</span>
        </div>
        <div className="planner-stat">
          <span className="planner-stat-label">Gaps</span>
          <span className="planner-stat-value">{commitment.gaps}</span>
        </div>
      </div>

      <PlannerTimeline schedule={schedule} />

      <div className="planner-film-sequence">
        {sequenceItems.map((item, index) =>
          item.type === 'film' ? (
            <FilmRow
              key={`${item.movie.showtime_film_key}-${item.movie.time}-${item.index}`}
              movie={item.movie}
              index={item.index}
              total={item.total}
            />
          ) : (
            <GapRow key={`gap-${index}-${item.label}`} label={item.label} />
          ),
        )}
      </div>
    </article>
  );
}
