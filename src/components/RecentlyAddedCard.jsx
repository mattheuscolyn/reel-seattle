import PosterImage from './PosterImage.jsx';
import {
  formatFirstAnnouncedLabel,
  formatRecentlyAddedFilmMeta,
} from '../utils/recentlyAddedDisplay.js';

export default function RecentlyAddedCard({ film }) {
  const announcedLabel = formatFirstAnnouncedLabel(film.first_announced_date);
  const meta = formatRecentlyAddedFilmMeta(film);
  const theaterNames =
    film.theaters.length > 1
      ? film.theaters.map((theater) => theater.name).join(', ')
      : null;

  return (
    <article className="recently-added-card">
      <PosterImage src={film.poster} alt={film.film_title} className="recently-added-card-poster" />
      <div className="recently-added-card-body">
        <h3 className="recently-added-card-title">{film.film_title}</h3>
        {announcedLabel ? (
          <div className="recently-added-card-date">{announcedLabel}</div>
        ) : null}
        {meta ? <div className="recently-added-card-meta">{meta}</div> : null}
        {theaterNames ? (
          <div className="recently-added-card-theaters">{theaterNames}</div>
        ) : null}
      </div>
    </article>
  );
}
