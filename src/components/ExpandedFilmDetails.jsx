import { formatLegacyDateHeading } from '../utils/showtimesDisplay.js';
import FilmShowtimeGroup from './FilmShowtimeGroup.jsx';

export default function ExpandedFilmDetails({ summary }) {
  if (!summary) return null;

  return (
    <div className="expanded-film-details">
      {summary.summaryLine ? (
        <p className="expanded-film-summary-line">{summary.summaryLine}</p>
      ) : null}

      {summary.details.length > 0 || summary.formats.length > 0 ? (
        <div className="expanded-film-details-panel">
          <h3 className="expanded-film-details-heading">Details</h3>
          <dl className="expanded-film-details-grid">
            {summary.details.map((item) => (
              <div key={item.label} className="expanded-film-details-row">
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
            {summary.formats.length > 0 ? (
              <div className="expanded-film-details-row expanded-film-details-row--formats">
                <dt>Formats</dt>
                <dd>
                  <div className="expanded-film-format-tags">
                    {summary.formats.map((format) => (
                      <span key={format} className="movie-format-tag">
                        {format}
                      </span>
                    ))}
                  </div>
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : null}

      <div className="expanded-film-showtimes">
        <h3 className="expanded-film-showtimes-heading">Showtimes</h3>
        {summary.dateGroups.length === 0 ? (
          <p className="movie-showtimes-empty">No showtimes for selected filters.</p>
        ) : (
          summary.dateGroups.map((group) => (
            <FilmShowtimeGroup
              key={group.date}
              date={group.date}
              dateHeading={formatLegacyDateHeading(group.date)}
              theaters={group.theaters}
            />
          ))
        )}
      </div>
    </div>
  );
}
