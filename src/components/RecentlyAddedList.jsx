import RecentlyAddedCard from './RecentlyAddedCard.jsx';

export default function RecentlyAddedList({ films }) {
  if (!films?.length) return null;

  return (
    <div className="recently-added-list">
      {films.map((film) => (
        <RecentlyAddedCard key={film.showtime_film_key} film={film} />
      ))}
    </div>
  );
}
