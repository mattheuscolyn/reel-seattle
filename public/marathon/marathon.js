/**
 * Marathon planner — loads AMC showtimes from marathon_showtimes.json,
 * computes feasible same-day chains for the selected date and theater.
 */
(function () {
  const DEFAULT_THEATER = 'AMC Pacific Place 11';
  const FILTER_STORAGE_KEY = 'marathon-planner-filters';
  const mobileMq = window.matchMedia('(max-width: 640px)');

  let SOURCE = null;
  let DATA = null;
  let POSTERS = {};
  let PREFERRED = new Set();
  let DAY_START = 600;
  let DAY_END = 1440;
  let DAY_RANGE = DAY_END - DAY_START;
  let page = 0;
  let filtered = [];

  function pageSize() {
    return mobileMq.matches ? 6 : 12;
  }

  function parseDateKey(dateStr) {
    const [month, day, year] = dateStr.split('/').map(Number);
    return year * 10000 + month * 100 + day;
  }

  function sortDates(dates) {
    return [...dates].sort((a, b) => parseDateKey(a) - parseDateKey(b));
  }

  function parseTimeToMinutes(timeStr) {
    const m = timeStr.replace(/\s/g, '').match(/^(\d{1,2}):(\d{2})(AM|PM)$/i);
    if (!m) throw new Error(`Unrecognized time: ${timeStr}`);
    let hour = parseInt(m[1], 10);
    const minute = parseInt(m[2], 10);
    const meridiem = m[3].toUpperCase();
    if (meridiem === 'AM') {
      if (hour === 12) hour = 0;
    } else if (hour !== 12) {
      hour += 12;
    }
    return hour * 60 + minute;
  }

  function minutesToLabel(totalMin) {
    const h = Math.floor(totalMin / 60) % 24;
    const mins = totalMin % 60;
    const meridiem = h < 12 ? 'AM' : 'PM';
    let display = h % 12;
    if (display === 0) display = 12;
    return `${display}:${mins.toString().padStart(2, '0')} ${meridiem}`;
  }

  function formatDuration(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h && m) return `${h}h ${m}m`;
    if (h) return `${h}h`;
    return `${m}m`;
  }

  function findAllMarathons(showtimes) {
    const chains = [];
    function dfs(path, filmsSeen, startIdx) {
      const last = path[path.length - 1];
      for (let j = startIdx; j < showtimes.length; j++) {
        const cand = showtimes[j];
        if (cand.start_min >= last.end_min && !filmsSeen.has(cand.film)) {
          const nextSeen = new Set(filmsSeen);
          nextSeen.add(cand.film);
          dfs(path.concat(cand), nextSeen, j + 1);
        }
      }
      if (path.length >= 2) chains.push(path);
    }
    for (let i = 0; i < showtimes.length; i++) {
      const st = showtimes[i];
      dfs([st], new Set([st.film]), i + 1);
    }
    return chains;
  }

  function filmsKey(chain) {
    return chain.map((s) => s.film).join('\0');
  }

  function chainKey(chain) {
    return chain.map((s) => s.id).join(',');
  }

  function filterChains(chains, preferredMovies) {
    if (!preferredMovies.length) return chains;
    const preferred = new Set(preferredMovies);
    return chains.filter((c) => c.some((s) => preferred.has(s.film)));
  }

  function dedupeByFilmLineup(chains) {
    const best = new Map();
    const counts = new Map();
    for (const chain of chains) {
      const key = filmsKey(chain);
      counts.set(key, (counts.get(key) || 0) + 1);
      const span = chain[chain.length - 1].end_min - chain[0].start_min;
      const prev = best.get(key);
      if (!prev || span < prev.span) best.set(key, { span, chain });
    }
    const deduped = [...best.values()]
      .sort((a, b) => a.span - b.span)
      .map((p) => p.chain);
    const countObj = {};
    counts.forEach((v, k) => {
      countObj[k] = v;
    });
    return { deduped, counts: countObj };
  }

  function summarizeChain(chain, alternates, theater) {
    const first = chain[0];
    const last = chain[chain.length - 1];
    const totalSpan = last.end_min - first.start_min;
    const filmRuntime = chain.reduce((sum, s) => sum + s.runtime, 0);
    const gapTime = totalSpan - filmRuntime;
    return {
      movie_count: chain.length,
      total_span_min: totalSpan,
      total_span_label: formatDuration(totalSpan),
      film_runtime_min: filmRuntime,
      film_runtime_label: formatDuration(filmRuntime),
      gap_time_min: gapTime,
      gap_time_label: formatDuration(gapTime),
      alternate_count: alternates,
      start: minutesToLabel(first.start_min),
      end: minutesToLabel(last.end_min),
      start_min: first.start_min,
      end_min: last.end_min,
      films: chain.map((s) => s.film),
      movies: chain.map((s) => ({
        film: s.film,
        time: s.time,
        start: minutesToLabel(s.start_min),
        end: minutesToLabel(s.end_min),
        start_min: s.start_min,
        end_min: s.end_min,
        runtime: s.runtime,
        runtime_label: formatDuration(s.runtime),
        theater,
      })),
    };
  }

  function buildPosters(showtimes) {
    const posters = {};
    for (const s of showtimes) {
      if (s.poster && !posters[s.film]) posters[s.film] = s.poster;
    }
    return posters;
  }

  function parseTitleList(text) {
    return text
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function getActiveFilters() {
    return {
      blacklist: parseTitleList(document.getElementById('blacklist-input').value),
      preferred_movies: parseTitleList(document.getElementById('preferred-input').value),
    };
  }

  function setFilterInputs(blacklist, preferred) {
    document.getElementById('blacklist-input').value = (blacklist || []).join('\n');
    document.getElementById('preferred-input').value = (preferred || []).join('\n');
  }

  function loadStoredFilters() {
    try {
      const raw = localStorage.getItem(FILTER_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return {
        blacklist: Array.isArray(parsed.blacklist) ? parsed.blacklist : [],
        preferred_movies: Array.isArray(parsed.preferred_movies) ? parsed.preferred_movies : [],
      };
    } catch {
      return null;
    }
  }

  function saveFiltersToStorage(filters) {
    try {
      localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters));
    } catch {
      /* ignore quota / private mode */
    }
  }

  function filmsForDateTheater(date, theater) {
    if (!SOURCE) return [];
    const set = new Set();
    for (const s of SOURCE.showtimes) {
      if (s.date === date && s.theater === theater) set.add(s.film);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }

  function updateFilmSuggestions() {
    const date = document.getElementById('plan-date').value;
    const theater = document.getElementById('plan-theater').value;
    const list = document.getElementById('film-suggestions');
    list.innerHTML = '';
    for (const film of filmsForDateTheater(date, theater)) {
      const opt = document.createElement('option');
      opt.value = film;
      list.appendChild(opt);
    }
  }

  function computeMarathonData(source, date, theater, filters) {
    const blacklist = new Set(filters.blacklist);
    const rows = source.showtimes.filter(
      (s) => s.date === date && s.theater === theater && !blacklist.has(s.film),
    );
    rows.sort((a, b) => a.start_min - b.start_min || a.film.localeCompare(b.film) || a.id - b.id);

    let chains = findAllMarathons(rows);
    chains = filterChains(chains, filters.preferred_movies);

    const seen = new Set();
    const unique = [];
    for (const chain of chains) {
      const key = chainKey(chain);
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(chain);
      }
    }

    const { deduped, counts } = dedupeByFilmLineup(unique);
    const options = deduped.map((c) =>
      summarizeChain(c, counts[filmsKey(c)] || 1, theater),
    );
    const maxMovies = options.reduce((m, o) => Math.max(m, o.movie_count), 0);
    const posters = buildPosters(rows);

    return {
      date,
      theater,
      blacklist: filters.blacklist,
      preferred_movies: filters.preferred_movies,
      day_window: source.day_window,
      posters,
      all_combinations_count: unique.length,
      display_options_count: options.length,
      max_movies_in_one_day: maxMovies,
      showtime_count: rows.length,
      note:
        'Each card is a unique film lineup using the tightest same-day schedule. ' +
        "'alternate_count' is how many distinct showtime combinations exist for that lineup.",
      options,
    };
  }

  function pct(min) {
    return Math.max(0, Math.min(100, ((min - DAY_START) / DAY_RANGE) * 100));
  }

  function gapLabel(mins) {
    if (mins <= 0) return 'Back-to-back';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h && m) return `${h}h ${m}m`;
    if (h) return `${h}h`;
    return `${m}m`;
  }

  function buildDayBar(movies) {
    const wrap = document.createElement('div');
    wrap.className = 'day-bar-wrap';
    const labels = document.createElement('div');
    labels.className = 'day-bar-labels';
    labels.innerHTML = '<span>10:00 AM</span><span>Midnight</span>';
    const bar = document.createElement('div');
    bar.className = 'day-bar';
    let cursor = movies[0].start_min;
    for (const m of movies) {
      if (m.start_min > cursor) {
        const g = document.createElement('div');
        g.className = 'block gap';
        g.style.left = pct(cursor) + '%';
        g.style.width = pct(m.start_min) - pct(cursor) + '%';
        g.title = gapLabel(m.start_min - cursor) + ' between shows';
        bar.appendChild(g);
      }
      const b = document.createElement('div');
      b.className = 'block film';
      b.style.left = pct(m.start_min) + '%';
      b.style.width = Math.max(0.8, pct(m.end_min) - pct(m.start_min)) + '%';
      b.title = m.film;
      bar.appendChild(b);
      cursor = m.end_min;
    }
    wrap.appendChild(labels);
    wrap.appendChild(bar);
    return wrap;
  }

  function updateContextLabel() {
    const date = document.getElementById('plan-date').value;
    const theater = document.getElementById('plan-theater').value;
    document.getElementById('context-label').textContent = `${theater} · ${date}`;
  }

  function updatePills(filters) {
    const root = document.getElementById('pills');
    const blacklistNote =
      filters.blacklist.length
        ? `Excluding ${filters.blacklist.length} title${filters.blacklist.length === 1 ? '' : 's'}`
        : 'No blacklisted titles';
    const preferredNote =
      filters.preferred_movies.length
        ? `Requires ≥1 of ${filters.preferred_movies.length} preferred`
        : 'No preferred-movie filter';
    root.innerHTML = `
      <span class="pill">${blacklistNote}</span>
      <span class="pill">${preferredNote}</span>
    `;
  }

  function updateMinMoviesSelect() {
    const sel = document.getElementById('min-movies');
    const max = DATA?.max_movies_in_one_day || 2;
    const prev = sel.value;
    sel.innerHTML = '';
    for (let n = 2; n <= Math.max(2, max); n++) {
      const opt = document.createElement('option');
      opt.value = String(n);
      opt.textContent = n === max ? `${n} (max)` : `${n}+`;
      if (String(n) === prev || (n === max && !prev)) opt.selected = true;
      sel.appendChild(opt);
    }
    if (!sel.value) sel.value = String(Math.max(2, max));
  }

  function updateSummaryStats() {
    document.getElementById('stat-lineups').textContent = DATA.display_options_count;
    document.getElementById('stat-combos').textContent = DATA.all_combinations_count;
    document.getElementById('stat-max').textContent = DATA.max_movies_in_one_day;
    document.getElementById('stat-showtimes').textContent = DATA.showtime_count;
  }

  function renderHero() {
    const maxN = DATA.max_movies_in_one_day;
    const best = [...DATA.options]
      .filter((o) => o.movie_count === maxN)
      .sort((a, b) => a.total_span_min - b.total_span_min)[0];
    const el = document.getElementById('hero');
    if (!best) {
      el.innerHTML = '<p>No marathon options for this date and theater.</p>';
      return;
    }
    el.innerHTML = `
      <div>
        <h2>Longest day: ${maxN} unique films</h2>
        <p>Tightest ${maxN}-film schedule — ${best.total_span_label} door-to-door (${best.start} → ${best.end}).</p>
        <div class="hero-stats">
          <div class="hero-stat"><strong>${best.film_runtime_label}</strong><span>Screen time</span></div>
          <div class="hero-stat"><strong>${best.gap_time_label}</strong><span>Between films</span></div>
          <div class="hero-stat"><strong>${best.alternate_count}</strong><span>Showtime variants</span></div>
        </div>
      </div>
      <div class="hero-films" style="font-family: IBM Plex Mono, monospace; font-size: 0.75rem; color: var(--muted); max-width: 220px; line-height: 1.6;">
        ${best.films.join(' → ')}
      </div>
    `;
  }

  function applyFilters() {
    const minMovies = Number(document.getElementById('min-movies').value);
    const maximalOnly = document.getElementById('maximal-only').value === '1';
    const sortBy = document.getElementById('sort-by').value;
    const q = document.getElementById('search').value.trim().toLowerCase();
    const maxCount = DATA.max_movies_in_one_day;

    filtered = DATA.options.filter((o) => o.movie_count >= minMovies);
    if (maximalOnly) filtered = filtered.filter((o) => o.movie_count === maxCount);
    if (q) filtered = filtered.filter((o) => o.films.some((f) => f.toLowerCase().includes(q)));

    filtered.sort((a, b) => {
      if (sortBy === 'count-desc') {
        return b.movie_count - a.movie_count || a.total_span_min - b.total_span_min;
      }
      if (sortBy === 'gap') {
        return a.gap_time_min - b.gap_time_min || a.total_span_min - b.total_span_min;
      }
      return a.total_span_min - b.total_span_min || b.movie_count - a.movie_count;
    });

    page = 0;
    document.getElementById('stat-visible').textContent = filtered.length;
  }

  function renderCards() {
    const root = document.getElementById('cards');
    const empty = document.getElementById('empty');
    root.innerHTML = '';

    if (!filtered.length) {
      empty.style.display = 'block';
      document.getElementById('page-info').textContent = 'No results';
      return;
    }
    empty.style.display = 'none';

    const size = pageSize();
    const totalPages = Math.ceil(filtered.length / size);
    const slice = filtered.slice(page * size, (page + 1) * size);
    document.getElementById('page-info').textContent =
      `Page ${page + 1} / ${totalPages} · showing ${slice.length} of ${filtered.length}`;
    document.getElementById('prev-page').disabled = page === 0;
    document.getElementById('next-page').disabled = page >= totalPages - 1;

    slice.forEach((opt, i) => {
      const globalIdx = page * size + i + 1;
      const card = document.createElement('article');
      card.className = 'card';
      const altNote =
        opt.alternate_count > 1
          ? `<span class="badge">${opt.alternate_count} showtime variants</span>`
          : '';

      card.innerHTML = `
        <div class="card-top">
          <div>
            <div class="option-num">Option ${globalIdx}</div>
            <h3>${opt.movie_count} films · ${opt.start} → ${opt.end}</h3>
          </div>
          <div class="badges">
            <span class="badge accent">${opt.total_span_label} total</span>
            <span class="badge film">${opt.film_runtime_label} watching</span>
            <span class="badge gap">${opt.gap_time_label} gaps</span>
            ${altNote}
          </div>
        </div>
      `;
      card.appendChild(buildDayBar(opt.movies));

      const timeline = document.createElement('div');
      timeline.className = 'timeline';

      opt.movies.forEach((m, idx) => {
        if (idx > 0) {
          const prev = opt.movies[idx - 1];
          const gapMins = m.start_min - prev.end_min;
          const conn = document.createElement('div');
          conn.className = 'connector';
          conn.innerHTML = `
            <svg class="connector-icon-h" width="24" height="12" viewBox="0 0 24 12" aria-hidden="true"><path d="M0 6h18M14 2l6 4-6 4" stroke="#4ade80" fill="none" stroke-width="1.5"/></svg>
            <svg class="connector-icon-v" width="12" height="20" viewBox="0 0 12 20" aria-hidden="true"><path d="M6 0v14M2 10l4 4 4-4" stroke="#4ade80" fill="none" stroke-width="1.5"/></svg>
            <div class="connector-gap">${gapLabel(gapMins)} until next</div>
          `;
          timeline.appendChild(conn);
        }
        const pref = PREFERRED.has(m.film);
        const block = document.createElement('div');
        block.className = 'movie-block';
        const poster = POSTERS[m.film] || '';
        block.innerHTML = `
          <div class="poster-wrap${pref ? ' preferred' : ''}">
            <img src="${poster}" alt="" loading="lazy" />
          </div>
          <div class="movie-info">
            <div class="movie-title">${m.film}</div>
            <div class="showtime">${m.start} – ${m.end}</div>
            <div class="runtime-tag">${m.runtime_label}</div>
          </div>
        `;
        timeline.appendChild(block);
      });

      card.appendChild(timeline);
      root.appendChild(card);
    });
  }

  function render() {
    applyFilters();
    renderCards();
  }

  function bootComputed(data) {
    DATA = data;
    POSTERS = DATA.posters || {};
    PREFERRED = new Set(DATA.preferred_movies || []);
    DAY_START = DATA.day_window.start_min;
    DAY_END = DATA.day_window.end_min;
    DAY_RANGE = DAY_END - DAY_START;
    updateContextLabel();
    updateSummaryStats();
    updateMinMoviesSelect();
    renderHero();
    render();
  }

  function setComputing(active) {
    document.getElementById('computing').style.display = active ? 'block' : 'none';
    document.getElementById('recompute-btn').disabled = active;
  }

  function recompute() {
    if (!SOURCE) return;
    const date = document.getElementById('plan-date').value;
    const theater = document.getElementById('plan-theater').value;
    if (!date || !theater) return;

    const filters = getActiveFilters();
    saveFiltersToStorage(filters);
    updatePills(filters);

    setComputing(true);
    document.getElementById('cards').innerHTML = '';
    window.setTimeout(() => {
      try {
        bootComputed(computeMarathonData(SOURCE, date, theater, filters));
      } finally {
        setComputing(false);
      }
    }, 0);
  }

  function theatersForDate(date) {
    const set = new Set();
    for (const s of SOURCE.showtimes) {
      if (s.date === date) set.add(s.theater);
    }
    return [...set].sort();
  }

  function refreshTheaterOptions() {
    const date = document.getElementById('plan-date').value;
    const sel = document.getElementById('plan-theater');
    const prev = sel.value;
    const theaters = theatersForDate(date);
    sel.innerHTML = '';
    for (const t of theaters) {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      sel.appendChild(opt);
    }
    if (theaters.includes(prev)) sel.value = prev;
    else if (theaters.includes(DEFAULT_THEATER)) sel.value = DEFAULT_THEATER;
    else if (theaters.length) sel.value = theaters[0];
  }

  function onDateChange() {
    refreshTheaterOptions();
    updateFilmSuggestions();
    recompute();
  }

  function initSelectors() {
    const dateSel = document.getElementById('plan-date');
    const dates = sortDates(SOURCE.dates);
    dateSel.innerHTML = '';
    for (const d of dates) {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = d;
      dateSel.appendChild(opt);
    }
    if (SOURCE.default_date && dates.includes(SOURCE.default_date)) {
      dateSel.value = SOURCE.default_date;
    } else if (dates.length) {
      dateSel.value = dates[0];
    }
    refreshTheaterOptions();
    if (SOURCE.default_theater && theatersForDate(dateSel.value).includes(SOURCE.default_theater)) {
      document.getElementById('plan-theater').value = SOURCE.default_theater;
    }
  }

  function initSource(source) {
    SOURCE = source;
    document.getElementById('loading').style.display = 'none';
    document.getElementById('app').classList.add('ready');

    const stored = loadStoredFilters();
    const blacklist = stored?.blacklist ?? source.blacklist ?? [];
    const preferred = stored?.preferred_movies ?? source.preferred_movies ?? [];
    setFilterInputs(blacklist, preferred);

    initSelectors();
    updateFilmSuggestions();
    recompute();
  }

  ['min-movies', 'maximal-only', 'sort-by'].forEach((id) =>
    document.getElementById(id).addEventListener('change', render),
  );
  document.getElementById('search').addEventListener('input', () => {
    page = 0;
    render();
  });
  document.getElementById('prev-page').addEventListener('click', () => {
    if (page > 0) {
      page--;
      renderCards();
    }
  });
  document.getElementById('next-page').addEventListener('click', () => {
    const totalPages = Math.ceil(filtered.length / pageSize());
    if (page < totalPages - 1) {
      page++;
      renderCards();
    }
  });
  document.getElementById('plan-date').addEventListener('change', onDateChange);
  document.getElementById('plan-theater').addEventListener('change', () => {
    updateFilmSuggestions();
    recompute();
  });
  document.getElementById('recompute-btn').addEventListener('click', recompute);
  mobileMq.addEventListener('change', () => {
    page = 0;
    if (DATA) renderCards();
  });

  document.getElementById('json-file').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => initSource(JSON.parse(reader.result));
    reader.readAsText(file);
  });

  fetch('marathon_showtimes.json')
    .then((r) => {
      if (!r.ok) throw new Error('fetch failed');
      return r.json();
    })
    .then(initSource)
    .catch(() => {
      document.querySelector('#loading p').textContent =
        'Could not load showtimes — run npm run marathon after scraping, or pick a JSON file.';
    });
})();
