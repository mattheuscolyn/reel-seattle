import React, { useEffect, useState, useRef } from 'react';
import Papa from 'papaparse';
import './App.css';

const CSV_URL = process.env.NODE_ENV === 'development' ? '/showtimes_history.csv' : './showtimes_history.csv';

function uniqueSorted(arr) {
  return Array.from(new Set(arr)).sort();
}

function isTodayOrFuture(dateStr) {
  // dateStr is MM/DD/YYYY or M/D/YYYY
  const [month, day, year] = dateStr.split('/').map(Number);
  const date = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0,0,0,0);
  return date >= today;
}

const SORT_OPTIONS = [
  { value: 'showtimes-desc', label: 'Showtimes (Most to Least)' },
  { value: 'showtimes-asc', label: 'Showtimes (Least to Most)' },
  { value: 'runtime-desc', label: 'Runtime (Longest to Shortest)' },
  { value: 'runtime-asc', label: 'Runtime (Shortest to Longest)' },
];

function App() {
  const [showtimes, setShowtimes] = useState([]);
  const [theaters, setTheaters] = useState([]);
  const [dates, setDates] = useState([]);
  const [selectedTheaters, setSelectedTheaters] = useState([]);
  const [selectedDates, setSelectedDates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState('showtimes-desc');

  useEffect(() => {
    Papa.parse(CSV_URL, {
      download: true,
      header: true,
      complete: (results) => {
        const data = results.data.filter(row => row.Date && row.Film);
        setShowtimes(data);
        setTheaters(uniqueSorted(data.map(r => r.Theater)));
        setDates(uniqueSorted(data.map(r => r.Date).filter(isTodayOrFuture)));
        setLoading(false);
      }
    });
  }, []);

  useEffect(() => {
    function setStickyHeaderTop() {
      const mainHeader = document.querySelector('.main-header');
      const stickyControls = document.querySelector('.sticky-controls');
      if (mainHeader && stickyControls) {
        const offset = mainHeader.offsetHeight + stickyControls.offsetHeight - 8;
        document.documentElement.style.setProperty('--sticky-header-top', offset + 'px');
        document.documentElement.style.setProperty('--sticky-date-header-top', (offset + 60) + 'px'); // 60px estimate for movie header
        document.documentElement.style.setProperty('--sticky-theater-header-top', (offset + 92) + 'px'); // 32px estimate for date header
      }
    }
    setStickyHeaderTop();
    window.addEventListener('resize', setStickyHeaderTop);
    return () => window.removeEventListener('resize', setStickyHeaderTop);
  }, []);

  const filtered = showtimes.filter(row =>
    (selectedTheaters.length === 0 || selectedTheaters.includes(row.Theater)) &&
    (selectedDates.length === 0 || selectedDates.includes(row.Date))
  );

  // Group by film, then by date, then by theater
  const movies = Object.values(filtered.reduce((acc, row) => {
    const key = row.Film;
    if (!acc[key]) {
      acc[key] = {
        film: row.Film,
        runtime: row.Runtime,
        poster: row.posterDynamic,
        showtimes: {}, // date -> theater -> [times]
      };
    }
    if (!acc[key].showtimes[row.Date]) acc[key].showtimes[row.Date] = {};
    if (!acc[key].showtimes[row.Date][row.Theater]) acc[key].showtimes[row.Date][row.Theater] = [];
    acc[key].showtimes[row.Date][row.Theater].push(row.Time);
    return acc;
  }, {}));

  // Calculate showtime count for each movie (based on filters)
  const movieShowtimeCounts = movies.map(movie => {
    let count = 0;
    Object.entries(movie.showtimes).forEach(([date, theatersObj]) => {
      if (selectedDates.length === 0 || selectedDates.includes(date)) {
        Object.entries(theatersObj).forEach(([theater, times]) => {
          if (selectedTheaters.length === 0 || selectedTheaters.includes(theater)) {
            count += times.length;
          }
        });
      }
    });
    return count;
  });

  // Sort movies based on selected sort
  const sortedMovies = [...movies].sort((a, b) => {
    // Helper to count showtimes for a movie
    const countShowtimes = (movie) => {
      let count = 0;
      Object.entries(movie.showtimes).forEach(([date, theatersObj]) => {
        if (selectedDates.length === 0 || selectedDates.includes(date)) {
          Object.entries(theatersObj).forEach(([theater, times]) => {
            if (selectedTheaters.length === 0 || selectedTheaters.includes(theater)) {
              count += times.length;
            }
          });
        }
      });
      return count;
    };
    if (sort === 'showtimes-desc') {
      return countShowtimes(b) - countShowtimes(a);
    } else if (sort === 'showtimes-asc') {
      return countShowtimes(a) - countShowtimes(b);
    } else if (sort === 'runtime-desc') {
      return Number(b.runtime) - Number(a.runtime);
    } else if (sort === 'runtime-asc') {
      return Number(a.runtime) - Number(b.runtime);
    }
    return 0;
  });

  return (
    <div className="app-container">
      <h1 className="main-header">Showtimes</h1>
      <div className="sticky-controls">
        <div className="filters">
          <DropdownMultiSelect
            label="Theater"
            options={theaters}
            selected={selectedTheaters}
            setSelected={setSelectedTheaters}
          />
          <DropdownMultiSelect
            label="Date"
            options={dates}
            selected={selectedDates}
            setSelected={setSelectedDates}
          />
        </div>
        <div className="sort-row">
          <SortDropdown
            sort={sort}
            setSort={setSort}
          />
        </div>
      </div>
      {loading ? <div>Loading showtimes...</div> : (
        <div className="movie-list">
          {sortedMovies.length === 0 && <div>No movies found for selected filters.</div>}
          {sortedMovies.map((movie, idx) => (
            <CollapsibleMovieCard key={movie.film + idx} movie={movie} selectedDates={selectedDates} selectedTheaters={selectedTheaters} />
          ))}
        </div>
      )}
    </div>
  );
}

function DropdownMultiSelect({ label, options, selected, setSelected }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const toggleOption = (opt) => {
    if (selected.includes(opt)) {
      setSelected(selected.filter(o => o !== opt));
    } else {
      setSelected([...selected, opt]);
    }
  };

  const labelText = selected.length === 0
    ? label
    : `${label} (${selected.length})`;

  return (
    <div className="dropdown-multiselect" ref={ref}>
      <button
        className={`dropdown-btn${open ? ' open' : ''}`}
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {labelText}
      </button>
      {open && (
        <div className="dropdown-menu" role="listbox">
          {options.map(opt => (
            <label className="dropdown-option" key={opt}>
              <input
                type="checkbox"
                className="dropdown-checkbox"
                checked={selected.includes(opt)}
                onChange={() => toggleOption(opt)}
              />
              {opt}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function SortDropdown({ sort, setSort }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const labelText = SORT_OPTIONS.find(opt => opt.value === sort)?.label || 'Sort';

  return (
    <div className="sort-dropdown" ref={ref}>
      <button
        className={`sort-btn${open ? ' open' : ''}`}
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {labelText}
      </button>
      {open && (
        <div className="sort-menu" role="listbox">
          {SORT_OPTIONS.map(opt => (
            <button
              className="sort-option"
              key={opt.value}
              onClick={() => {
                setSort(opt.value);
                setOpen(false);
              }}
              style={{fontWeight: sort === opt.value ? 700 : 400}}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CollapsibleMovieCard({ movie, selectedDates, selectedTheaters }) {
  const [open, setOpen] = useState(false);
  // Only show showtimes for selected dates/theaters, or all if none selected
  const datesToShow = selectedDates.length > 0 ? selectedDates.filter(d => movie.showtimes[d]) : Object.keys(movie.showtimes);

  return (
    <div className="movie-card" style={{flexDirection: 'column', gap: 0}}>
      <div className="sticky-movie-header" style={{flexDirection: 'column', alignItems: 'flex-start', gap: 0}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 24, width: '100%'}}>
          <img className="poster" src={movie.poster} alt={movie.film} />
          <div className="movie-info">
            <div className="movie-title">{movie.film}</div>
            <div className="movie-runtime">{movie.runtime} min</div>
          </div>
        </div>
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            margin: '18px 0 0 0',
            background: '#222',
            color: '#fff',
            border: '1px solid #333',
            borderRadius: 8,
            padding: '8px 18px',
            fontSize: 15,
            cursor: 'pointer',
            fontWeight: 600,
            alignSelf: 'flex-start',
          }}
        >
          {open ? 'Hide Showtimes' : 'Show Showtimes'}
        </button>
      </div>
      {open && (
        <div style={{marginTop: 18, width: '100%'}}>
          {datesToShow.length === 0 && <div style={{color: '#aaa'}}>No showtimes for selected dates.</div>}
          {datesToShow.map(date => (
            <div key={date} style={{marginBottom: 18}}>
              <div className="sticky-date-header" style={{fontWeight: 700, fontSize: 17, marginBottom: 6}}>{date}</div>
              {Object.entries(movie.showtimes[date])
                .filter(([theater]) => selectedTheaters.length === 0 || selectedTheaters.includes(theater))
                .map(([theater, times]) => (
                  <div key={theater} style={{marginLeft: 18, marginBottom: 8}}>
                    <div className="sticky-theater-header" style={{fontWeight: 600, fontSize: 15, marginBottom: 3}}>{theater}</div>
                    <div className="showtimes">
                      {times.map((time, i) => (
                        <span className="showtime-pill" key={time + i}>{time}</span>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;
