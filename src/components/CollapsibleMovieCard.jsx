import { useId, useMemo, useState } from 'react';
import { buildExpandedFilmSummary, buildFilmCardMetadata } from '../utils/showtimesDisplay.js';
import ExpandedFilmDetails from './ExpandedFilmDetails.jsx';
import PosterImage from './PosterImage.jsx';

export default function CollapsibleMovieCard({ movie, selectedDates, selectedTheaters }) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const filterOptions = useMemo(
    () => ({ selectedDates, selectedTheaters }),
    [selectedDates, selectedTheaters],
  );
  const metadata = useMemo(
    () => buildFilmCardMetadata(movie, filterOptions),
    [movie, filterOptions],
  );
  const expandedSummary = useMemo(
    () => (open ? buildExpandedFilmSummary(movie, filterOptions) : null),
    [open, movie, filterOptions],
  );

  return (
    <div className="movie-card movie-card--collapsible">
      <div className="sticky-movie-header movie-card-header">
        <div className="movie-card-summary">
          <PosterImage src={movie.poster} alt={movie.film} className="poster" />
          <div className="movie-info">
            <div className="movie-title">{movie.film}</div>
            {metadata.items.length > 0 ? (
              <div className="movie-metadata" aria-label="Film summary">
                {metadata.items.map((item) => (
                  <span key={item.type} className="movie-metadata-item">
                    {item.text}
                  </span>
                ))}
              </div>
            ) : null}
            {metadata.formats.length > 0 ? (
              <div className="movie-format-tags" aria-label="Available formats">
                {metadata.formats.map((format) => (
                  <span key={format} className="movie-format-tag">
                    {format}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          className="movie-toggle-button"
          onClick={() => setOpen((isOpen) => !isOpen)}
          aria-expanded={open}
          aria-controls={detailsId}
        >
          {open ? 'Hide Showtimes' : 'Show Showtimes'}
        </button>
      </div>
      {open ? (
        <div id={detailsId} className="movie-showtimes-expanded">
          <ExpandedFilmDetails summary={expandedSummary} />
        </div>
      ) : null}
    </div>
  );
}
