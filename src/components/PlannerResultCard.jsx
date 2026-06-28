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
      <div className="double-feature-film">
        <div className="double-feature-film-poster-wrap">
          <PosterImage
            src={movie?.poster}
            alt={display.film}
            className="double-feature-poster"
          />
          <span className="double-feature-film-label">{formatMovieSequenceLabel(index, total)}</span>
        </div>
        <div className="double-feature-film-details">
          <h4 className="double-feature-film-title">{display.film}</h4>
          <FormatTags movie={movie} />
          <dl className="double-feature-film-meta">
            <div className="double-feature-film-meta-row">
              <dt>Start</dt>
              <dd>{display.startTime}</dd>
            </div>
            <div className="double-feature-film-meta-row">
              <dt>Ends</dt>
              <dd>{display.endTime}</dd>
            </div>
            <div className="double-feature-film-meta-row">
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

export default function PlannerResultCard({ schedule }) {
  const summary = formatPlannerScheduleSummary(schedule);
  const commitment = formatPlannerCommitmentLines(schedule);
  const sequenceItems = buildMovieSequenceItems(schedule);
  const movies = schedule?.movies ?? [];

  return (
    <article
      className="double-feature-card planner-result-card"
      aria-label={`${summary.theater}: ${movies.length} films`}
    >
      <header className="double-feature-card-header">
        <div className="planner-card-heading">
          <h3 className="double-feature-theater">{summary.theater}</h3>
          <p className="planner-commitment-summary">
            <span>{commitment.starts}</span>
            <span aria-hidden="true"> · </span>
            <span>{commitment.ends}</span>
          </p>
        </div>
        <div className="double-feature-card-badges">
          <span className="planner-film-count-badge">{summary.filmCountLabel} films</span>
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
