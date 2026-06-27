export default function FilmShowtimeGroup({ date, dateHeading, theaters }) {
  return (
    <section className="film-showtime-group" aria-label={`Showtimes for ${date}`}>
      <h3 className="film-showtime-group-date">
        <span className="film-showtime-group-date-primary">{dateHeading}</span>
        <span className="film-showtime-group-date-secondary">{date}</span>
      </h3>
      <div className="film-showtime-group-theaters">
        {theaters.map(({ theater, slots }) => (
          <div key={theater} className="film-showtime-theater-block">
            <h4 className="film-showtime-theater-name">{theater}</h4>
            <div className="showtimes film-showtime-pills">
              {slots.map((slot, index) => (
                <span
                  className="showtime-pill"
                  key={`${slot.time}-${slot.premiumFormat || ''}-${index}`}
                >
                  {slot.time}
                  {slot.premiumFormat ? (
                    <span className="premium-format-tag">{slot.premiumFormat}</span>
                  ) : null}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
