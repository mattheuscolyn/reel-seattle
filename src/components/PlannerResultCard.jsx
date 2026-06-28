import PosterImage from './PosterImage.jsx';
import {
  formatPlannerMovieDisplay,
  formatPlannerScheduleSummary,
} from '../utils/plannerDisplay.js';

function FilmRow({ movie, index, filmCount }) {
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
          <span className="double-feature-film-label">Film {index + 1}</span>
        </div>
        <div className="double-feature-film-details">
          <h4 className="double-feature-film-title">{display.film}</h4>
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
      {index < filmCount - 1 ? (
        <div className="planner-film-connector" aria-hidden="true">
          <span className="double-feature-arrow">↓</span>
        </div>
      ) : null}
    </div>
  );
}

export default function PlannerResultCard({ schedule }) {
  const summary = formatPlannerScheduleSummary(schedule);
  const movies = schedule?.movies ?? [];

  return (
    <article
      className="double-feature-card planner-result-card"
      aria-label={`${summary.theater}: ${movies.length} films`}
    >
      <header className="double-feature-card-header">
        <h3 className="double-feature-theater">{summary.theater}</h3>
        <div className="double-feature-card-badges">
          <span className="planner-film-count-badge">{summary.filmCountLabel} films</span>
        </div>
      </header>

      <div className="planner-card-stats">
        <div className="planner-stat">
          <span className="planner-stat-label">Start</span>
          <span className="planner-stat-value">{summary.startTime}</span>
        </div>
        <div className="planner-stat">
          <span className="planner-stat-label">End</span>
          <span className="planner-stat-value">{summary.endTime}</span>
        </div>
        <div className="planner-stat">
          <span className="planner-stat-label">Total span</span>
          <span className="planner-stat-value">{summary.totalSpan}</span>
        </div>
        <div className="planner-stat">
          <span className="planner-stat-label">Gap time</span>
          <span className="planner-stat-value">{summary.totalGap}</span>
        </div>
      </div>

      <div className="planner-film-sequence">
        {movies.map((movie, index) => (
          <FilmRow
            key={`${movie.showtime_film_key}-${movie.time}-${index}`}
            movie={movie}
            index={index}
            filmCount={movies.length}
          />
        ))}
      </div>

      <footer className="double-feature-card-footer">
        <span className="double-feature-total-label">Film runtime total</span>
        <span className="double-feature-total-value">{summary.filmRuntime}</span>
      </footer>
    </article>
  );
}
