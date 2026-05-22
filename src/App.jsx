import React, { useEffect, useState, useRef, useMemo } from 'react';
import Papa from 'papaparse';
import './App.css';

const CSV_URL = process.env.NODE_ENV === 'development' ? '/data/showtimes_history.csv' : './data/showtimes_history.csv';

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
  const [currentPage, setCurrentPage] = useState('showtimes'); // 'showtimes' or 'double-feature'

  return (
    <div className="app-container">
      <nav className="main-nav">
        <button 
          className={`nav-button ${currentPage === 'showtimes' ? 'active' : ''}`}
          onClick={() => setCurrentPage('showtimes')}
        >
          Showtimes
        </button>
        <button 
          className={`nav-button ${currentPage === 'double-feature' ? 'active' : ''}`}
          onClick={() => setCurrentPage('double-feature')}
        >
          Double Feature Planner
        </button>
        <a className="nav-button nav-link" href="/marathon/">
          Marathon Planner
        </a>
      </nav>
      {currentPage === 'showtimes' ? <ShowtimesPage /> : <DoubleFeaturePage />}
    </div>
  );
}

function ShowtimesPage() {
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

  const filtered = showtimes.filter(row => {
    // Filter by theater
    if (selectedTheaters.length > 0 && !selectedTheaters.includes(row.Theater)) {
      return false;
    }
    // Filter by date - if no dates selected, default to today or future
    if (selectedDates.length === 0) {
      if (!isTodayOrFuture(row.Date)) {
        return false;
      }
    } else {
      if (!selectedDates.includes(row.Date)) {
        return false;
      }
    }
    return true;
  });

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
    <>
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
    </>
  );
}

function DoubleFeaturePage() {
  const [showtimes, setShowtimes] = useState([]);
  const [theaters, setTheaters] = useState([]);
  const [dates, setDates] = useState([]);
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filter state
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTheaters, setSelectedTheaters] = useState([]);
  const [earliestStartTime, setEarliestStartTime] = useState('');
  const [earliestEndTime, setEarliestEndTime] = useState('');
  const [movieFilterType, setMovieFilterType] = useState('none'); // 'none', 'whitelist', 'blacklist'
  const [selectedMovies, setSelectedMovies] = useState([]);
  
  // Results
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    Papa.parse(CSV_URL, {
      download: true,
      header: true,
      complete: (results) => {
        const data = results.data.filter(row => row.Date && row.Film);
        setShowtimes(data);
        const uniqueTheaters = uniqueSorted(data.map(r => r.Theater));
        const uniqueDates = uniqueSorted(data.map(r => r.Date).filter(isTodayOrFuture));
        setTheaters(uniqueTheaters);
        setDates(uniqueDates);
        
        // Group movies for the movie selector
        const moviesMap = data.reduce((acc, row) => {
          if (!acc[row.Film]) {
            acc[row.Film] = {
              film: row.Film,
              runtime: row.Runtime,
              poster: row.posterDynamic,
            };
          }
          return acc;
        }, {});
        setMovies(Object.values(moviesMap));
        
        if (uniqueDates.length > 0 && !selectedDate) {
          setSelectedDate(uniqueDates[0]);
        }
        setLoading(false);
      }
    });
  }, []);

  // Parse time string (e.g., "7:30PM") to minutes since midnight
  const parseTimeToMinutes = (timeStr) => {
    if (!timeStr) return null;
    const match = timeStr.match(/(\d+):(\d+)(AM|PM)/i);
    if (!match) return null;
    let hours = parseInt(match[1]);
    const minutes = parseInt(match[2]);
    const period = match[3].toUpperCase();
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    return hours * 60 + minutes;
  };

  // Format minutes to time string
  const formatMinutesToTime = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);
    return `${displayHours}:${mins.toString().padStart(2, '0')}${period}`;
  };

  // Calculate end time of a movie
  const getMovieEndTime = (startTimeStr, runtimeStr) => {
    const startMinutes = parseTimeToMinutes(startTimeStr);
    if (startMinutes === null) return null;
    const runtime = parseInt(runtimeStr);
    if (isNaN(runtime)) return null;
    return startMinutes + runtime;
  };

  // Filter movies based on current filters (date, theaters, time)
  const filteredMovies = useMemo(() => {
    if (!selectedDate) return [];
    
    let filtered = showtimes.filter(row => {
      // Must match selected date
      if (row.Date !== selectedDate) return false;
      
      // Must match selected theaters (if any selected)
      if (selectedTheaters.length > 0 && !selectedTheaters.includes(row.Theater)) return false;
      
      // Must have runtime data
      if (!row.Runtime || row.Runtime === 'Unknown') return false;
      
      return true;
    });

    // Apply time filters
    if (earliestStartTime) {
      const earliestStart = parseTimeToMinutes(earliestStartTime);
      if (earliestStart !== null) {
        filtered = filtered.filter(row => {
          const start = parseTimeToMinutes(row.Time);
          return start !== null && start >= earliestStart;
        });
      }
    }

    if (earliestEndTime) {
      const earliestEnd = parseTimeToMinutes(earliestEndTime);
      if (earliestEnd !== null) {
        filtered = filtered.filter(row => {
          const end = getMovieEndTime(row.Time, row.Runtime);
          return end !== null && end >= earliestEnd;
        });
      }
    }

    // Get unique movies from filtered showtimes
    const moviesMap = filtered.reduce((acc, row) => {
      if (!acc[row.Film]) {
        acc[row.Film] = {
          film: row.Film,
          runtime: row.Runtime,
          poster: row.posterDynamic,
        };
      }
      return acc;
    }, {});

    return Object.values(moviesMap);
  }, [selectedDate, selectedTheaters, earliestStartTime, earliestEndTime, showtimes]);

  // Clear selected movies if they're no longer in the filtered list
  useEffect(() => {
    if (selectedMovies.length > 0 && filteredMovies.length > 0) {
      const validMovies = selectedMovies.filter(movie => 
        filteredMovies.some(fm => fm.film === movie)
      );
      if (validMovies.length !== selectedMovies.length) {
        setSelectedMovies(validMovies);
      }
    } else if (selectedMovies.length > 0 && filteredMovies.length === 0) {
      // Clear all selections if no movies match filters
      setSelectedMovies([]);
    }
  }, [filteredMovies]); // eslint-disable-line react-hooks/exhaustive-deps

  // Calculate movie popularity (total showtimes across all theaters)
  const getMoviePopularity = (filmName) => {
    return showtimes.filter(row => row.Film === filmName).length;
  };

  const findDoubleFeatures = () => {
    setIsSearching(true);
    
    // Use setTimeout to allow UI to update before heavy computation
    setTimeout(() => {
      if (!selectedDate) {
        setResults([]);
        setIsSearching(false);
        return;
      }

    // Filter showtimes by date and theaters
    let filtered = showtimes.filter(row => {
      if (row.Date !== selectedDate) return false;
      if (selectedTheaters.length > 0 && !selectedTheaters.includes(row.Theater)) return false;
      if (!row.Runtime || row.Runtime === 'Unknown') return false; // Skip movies without runtime
      
      // Apply movie filter
      if (movieFilterType === 'whitelist' && selectedMovies.length > 0) {
        if (!selectedMovies.includes(row.Film)) return false;
      } else if (movieFilterType === 'blacklist' && selectedMovies.length > 0) {
        if (selectedMovies.includes(row.Film)) return false;
      }
      
      return true;
    });

    // Apply time filters
    if (earliestStartTime) {
      const earliestStart = parseTimeToMinutes(earliestStartTime);
      if (earliestStart !== null) {
        filtered = filtered.filter(row => {
          const start = parseTimeToMinutes(row.Time);
          return start !== null && start >= earliestStart;
        });
      }
    }

    if (earliestEndTime) {
      const earliestEnd = parseTimeToMinutes(earliestEndTime);
      if (earliestEnd !== null) {
        filtered = filtered.filter(row => {
          const end = getMovieEndTime(row.Time, row.Runtime);
          return end !== null && end >= earliestEnd;
        });
      }
    }

    // Group by theater and film
    const byTheater = {};
    filtered.forEach(row => {
      if (!byTheater[row.Theater]) byTheater[row.Theater] = {};
      if (!byTheater[row.Theater][row.Film]) {
        byTheater[row.Theater][row.Film] = {
          film: row.Film,
          runtime: parseInt(row.Runtime),
          poster: row.posterDynamic,
          showtimes: []
        };
      }
      const timeMinutes = parseTimeToMinutes(row.Time);
      if (timeMinutes !== null) {
        byTheater[row.Theater][row.Film].showtimes.push({
          time: row.Time,
          timeMinutes: timeMinutes
        });
      }
    });

    // Find all valid double feature pairs
    const pairs = [];
    Object.entries(byTheater).forEach(([theater, films]) => {
      const filmList = Object.values(films);
      for (let i = 0; i < filmList.length; i++) {
        for (let j = i + 1; j < filmList.length; j++) {
          const movieA = filmList[i];
          const movieB = filmList[j];
          
          // Try all combinations of showtimes
          movieA.showtimes.forEach(showtimeA => {
            movieB.showtimes.forEach(showtimeB => {
              // Check if A -> B works
              const endA = showtimeA.timeMinutes + movieA.runtime;
              const startB = showtimeB.timeMinutes;
              if (startB > endA) {
                const gap = startB - endA;
                if (gap < 60) { // Less than 1 hour gap
                  pairs.push({
                    theater,
                    movieA: { ...movieA, showtime: showtimeA.time },
                    movieB: { ...movieB, showtime: showtimeB.time },
                    gap,
                    popularity: getMoviePopularity(movieA.film) + getMoviePopularity(movieB.film)
                  });
                }
              }
              
              // Check if B -> A works
              const endB = showtimeB.timeMinutes + movieB.runtime;
              const startA = showtimeA.timeMinutes;
              if (startA > endB) {
                const gap = startA - endB;
                if (gap < 60) {
                  pairs.push({
                    theater,
                    movieA: { ...movieB, showtime: showtimeB.time },
                    movieB: { ...movieA, showtime: showtimeA.time },
                    gap,
                    popularity: getMoviePopularity(movieA.film) + getMoviePopularity(movieB.film)
                  });
                }
              }
            });
          });
        }
      }
    });

    // Sort: first by popularity (desc), then by gap (asc), then by movie pairing
    pairs.sort((a, b) => {
      if (b.popularity !== a.popularity) {
        return b.popularity - a.popularity;
      }
      if (a.gap !== b.gap) {
        return a.gap - b.gap;
      }
      // Same pairing, sort by first movie name
      const aKey = `${a.movieA.film}-${a.movieB.film}`;
      const bKey = `${b.movieA.film}-${b.movieB.film}`;
      return aKey.localeCompare(bKey);
    });

    setResults(pairs);
    setIsSearching(false);
    }, 0);
  };

  const handleSearch = () => {
    findDoubleFeatures();
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <>
      <h1 className="main-header">Double Feature Planner</h1>
      <div className="double-feature-controls">
        <div className="double-feature-filters">
          <div className="filter-group">
            <label>Date</label>
            <select 
              value={selectedDate} 
              onChange={(e) => setSelectedDate(e.target.value)}
              className="filter-select"
            >
              {dates.map(date => (
                <option key={date} value={date}>{date}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Theaters</label>
            <DropdownMultiSelect
              label="Select Theaters"
              options={theaters}
              selected={selectedTheaters}
              setSelected={setSelectedTheaters}
            />
          </div>

          <div className="filter-group">
            <label>Earliest Start Time (optional)</label>
            <input
              type="text"
              placeholder="e.g., 7:30PM"
              value={earliestStartTime}
              onChange={(e) => setEarliestStartTime(e.target.value)}
              className="filter-input"
            />
          </div>

          <div className="filter-group">
            <label>Earliest End Time (optional)</label>
            <input
              type="text"
              placeholder="e.g., 10:00PM"
              value={earliestEndTime}
              onChange={(e) => setEarliestEndTime(e.target.value)}
              className="filter-input"
            />
          </div>

          <div className="filter-group">
            <label>Movie Filter</label>
            <select 
              value={movieFilterType} 
              onChange={(e) => {
                setMovieFilterType(e.target.value);
                if (e.target.value === 'none') setSelectedMovies([]);
              }}
              className="filter-select"
            >
              <option value="none">None</option>
              <option value="whitelist">Whitelist</option>
              <option value="blacklist">Blacklist</option>
            </select>
          </div>

          {movieFilterType !== 'none' && (
            <div className="filter-group">
              <label>{movieFilterType === 'whitelist' ? 'Include Movies' : 'Exclude Movies'}</label>
              {filteredMovies.length === 0 ? (
                <div style={{color: '#aaa', fontSize: '14px', padding: '10px 14px'}}>
                  No movies match your current filters. Adjust date, theaters, or time filters.
                </div>
              ) : (
                <DropdownMultiSelect
                  label={`Select Movies (${selectedMovies.length})`}
                  options={filteredMovies.map(m => m.film)}
                  selected={selectedMovies}
                  setSelected={setSelectedMovies}
                />
              )}
            </div>
          )}
        </div>
        <div className="search-button-container">
          <button 
            onClick={handleSearch}
            disabled={isSearching || !selectedDate}
            className="search-button"
          >
            {isSearching ? (
              <>
                <span className="loading-spinner"></span>
                Searching...
              </>
            ) : (
              'Find Double Features'
            )}
          </button>
        </div>
      </div>

      <div className="double-feature-results">
        {results.length > 0 && (
          <h2 style={{marginBottom: '24px', fontSize: '1.5rem'}}>
            {results.length} Double Feature Option{results.length !== 1 ? 's' : ''} Found
          </h2>
        )}
        {isSearching ? (
          <div className="search-loading">
            <span className="loading-spinner-large"></span>
            <div style={{color: '#aaa', fontSize: '1.1rem', marginTop: '16px'}}>Searching for double features...</div>
          </div>
        ) : results.length === 0 ? (
          <div style={{color: '#aaa', fontSize: '1.1rem'}}>
            No double features found matching your criteria. Try adjusting your filters and click "Find Double Features" again.
          </div>
        ) : (
          <div className="double-feature-list">
            {results.map((result, idx) => {
              return (
                <div key={idx} className="double-feature-card">
                  <div className="double-feature-header">
                    <h3 className="double-feature-theater">{result.theater}</h3>
                    <div className="double-feature-gap">Gap: {result.gap} min</div>
                  </div>
                  <div className="double-feature-movies">
                    <div className="double-feature-movie">
                      <img className="double-feature-poster" src={result.movieA.poster} alt={result.movieA.film} />
                      <div className="double-feature-movie-info">
                        <div className="double-feature-movie-title">{result.movieA.film}</div>
                        <div className="double-feature-movie-time">{result.movieA.showtime}</div>
                        <div className="double-feature-movie-runtime">{result.movieA.runtime} min</div>
                      </div>
                    </div>
                    <div className="double-feature-arrow">→</div>
                    <div className="double-feature-movie">
                      <img className="double-feature-poster" src={result.movieB.poster} alt={result.movieB.film} />
                      <div className="double-feature-movie-info">
                        <div className="double-feature-movie-title">{result.movieB.film}</div>
                        <div className="double-feature-movie-time">{result.movieB.showtime}</div>
                        <div className="double-feature-movie-runtime">{result.movieB.runtime} min</div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
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
