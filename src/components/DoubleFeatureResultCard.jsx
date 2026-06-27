import PosterImage from './PosterImage.jsx';
import {
  computePairTotalMinutes,
  formatFilmEndTime,
  formatFilmTitle,
  formatGapMinutes,
  formatRuntimeMinutes,
  formatScheduleDuration,
  formatShowtime,
  formatTheaterName,
  getGapLabel,
} from '../utils/doubleFeatureDisplay.js';

function FilmSlot({ film, showtime, endTime, runtime, poster, label }) {
  return (
    <div className="double-feature-film">
      <div className="double-feature-film-poster-wrap">
        <PosterImage
          src={poster}
          alt={film}
          className="double-feature-poster"
        />
        <span className="double-feature-film-label">{label}</span>
      </div>
      <div className="double-feature-film-details">
        <h4 className="double-feature-film-title">{film}</h4>
        <dl className="double-feature-film-meta">
          <div className="double-feature-film-meta-row">
            <dt>Start</dt>
            <dd>{showtime}</dd>
          </div>
          <div className="double-feature-film-meta-row">
            <dt>Ends</dt>
            <dd>{endTime}</dd>
          </div>
          <div className="double-feature-film-meta-row">
            <dt>Runtime</dt>
            <dd>{runtime}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

export default function DoubleFeatureResultCard({ pair }) {
  const gapLabel = getGapLabel(pair.gap);
  const totalMinutes = computePairTotalMinutes(pair);
  const totalDisplay = formatScheduleDuration(totalMinutes);

  const movieA = {
    film: formatFilmTitle(pair.movieA?.film),
    showtime: formatShowtime(pair.movieA?.showtime),
    endTime: formatFilmEndTime(pair.movieA?.showtime, pair.movieA?.runtime),
    runtime: formatRuntimeMinutes(pair.movieA?.runtime),
    poster: pair.movieA?.poster,
  };
  const movieB = {
    film: formatFilmTitle(pair.movieB?.film),
    showtime: formatShowtime(pair.movieB?.showtime),
    endTime: formatFilmEndTime(pair.movieB?.showtime, pair.movieB?.runtime),
    runtime: formatRuntimeMinutes(pair.movieB?.runtime),
    poster: pair.movieB?.poster,
  };

  const theater = formatTheaterName(pair.theater);

  return (
    <article
      className="double-feature-card"
      aria-label={`${theater}: ${movieA.film}, then ${movieB.film}`}
    >
      <header className="double-feature-card-header">
        <h3 className="double-feature-theater">{theater}</h3>
        <div className="double-feature-card-badges">
          <span
            className={`double-feature-gap-label double-feature-gap-label--${gapLabel.variant}`}
          >
            {gapLabel.text}
          </span>
          <span className="double-feature-gap-time">{formatGapMinutes(pair.gap)} between films</span>
        </div>
      </header>

      <div className="double-feature-card-body">
        <FilmSlot label="Film 1" {...movieA} />
        <div className="double-feature-card-connector" aria-hidden="true">
          <span className="double-feature-arrow">→</span>
        </div>
        <FilmSlot label="Film 2" {...movieB} />
      </div>

      <footer className="double-feature-card-footer">
        <span className="double-feature-total-label">Total commitment</span>
        <span className="double-feature-total-value">{totalDisplay}</span>
      </footer>
    </article>
  );
}
