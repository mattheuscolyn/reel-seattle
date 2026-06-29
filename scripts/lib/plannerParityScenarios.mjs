/**
 * Discover stable planner parity scenarios from showtimes_current.json.
 * Used by qa_planner_parity.mjs and qa_planner_browser.mjs.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rowsFromShowtimesCurrent } from '../../src/showtimesAdapter.js';
import { buildPlannerSearchFilters } from '../../src/utils/plannerDisplay.js';
import { findSchedules } from '../../src/utils/plannerEngine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_DATA_PATH = join(__dirname, '../../public/data/showtimes_current.json');

/** Whether a legacy MM/DD/YYYY date string is today or later (matches Planner UI). */
export function isTodayOrFuture(dateStr) {
  const [month, day, year] = String(dateStr).split('/').map(Number);
  const date = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date >= today;
}

/** Convert legacy CSV date (MM/DD/YYYY) to ISO (YYYY-MM-DD). */
export function csvDateToIso(csvDate) {
  const [month, day, year] = String(csvDate).split('/');
  if (!month || !day || !year) return '';
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function countSchedules(rows, csvDate, theater, filmCount) {
  const filters = buildPlannerSearchFilters({
    date: csvDate,
    theaters: theater ? [theater] : [],
    filmCount,
  });
  return findSchedules({ rows, filters });
}

function scheduleCacheKey(csvDate, theater, filmCount) {
  return `${csvDate}\0${theater || ''}\0${filmCount}`;
}

function cachedCountSchedules(cache, rows, csvDate, theater, filmCount) {
  const key = scheduleCacheKey(csvDate, theater, filmCount);
  if (!cache.has(key)) {
    cache.set(key, countSchedules(rows, csvDate, theater, filmCount));
  }
  return cache.get(key);
}

function summarizeScenario({ csvDate, theater, filmCount, result, extra = {} }) {
  const top = result.schedules[0];
  return {
    date: csvDateToIso(csvDate),
    csvDate,
    theater,
    filmCount,
    minResults: result.schedules.length,
    topFilmCount: top?.filmCount ?? top?.movies?.length ?? 0,
    browserEligible: isTodayOrFuture(csvDate),
    ...extra,
  };
}

function considerScenario(scenarios, key, candidate) {
  if (!candidate) return;
  const current = scenarios[key];
  if (!current) {
    scenarios[key] = candidate;
    return;
  }
  if (candidate.browserEligible && !current.browserEligible) {
    scenarios[key] = candidate;
    return;
  }
  if (candidate.browserEligible === current.browserEligible && candidate.minResults > current.minResults) {
    scenarios[key] = candidate;
  }
}

/**
 * Scan current-window data for reliable QA scenarios.
 *
 * @param {string} [dataPath]
 * @returns {{ artifact: object, rows: object[], scenarios: object, audit: object }}
 */
export function discoverPlannerParityScenarios(dataPath = DEFAULT_DATA_PATH) {
  const artifact = JSON.parse(readFileSync(dataPath, 'utf8'));
  const rows = rowsFromShowtimesCurrent(artifact);

  const groups = new Map();
  for (const row of rows) {
    const key = `${row.Date}\0${row.Theater}`;
    if (!groups.has(key)) groups.set(key, { csvDate: row.Date, theater: row.Theater, rows: [] });
    groups.get(key).rows.push(row);
  }

  const scenarios = {
    twoFilm: null,
    threeFilm: null,
    fourFilm: null,
    maxMode: null,
    marathonAmc: null,
    nonAmc: null,
    pagination: null,
  };

  const sortedGroups = [...groups.values()].sort((a, b) => {
    const aFuture = isTodayOrFuture(a.csvDate);
    const bFuture = isTodayOrFuture(b.csvDate);
    if (aFuture !== bFuture) return aFuture ? -1 : 1;
    const dateCmp = a.csvDate.localeCompare(b.csvDate);
    if (dateCmp !== 0) return dateCmp;
    return a.theater.localeCompare(b.theater);
  });

  const scheduleCache = new Map();

  for (const group of sortedGroups) {
    const { csvDate, theater, rows: groupRows } = group;
    const uniqueFilms = new Set(groupRows.map((row) => row.Film)).size;
    if (uniqueFilms < 2) continue;

    const result2 = cachedCountSchedules(scheduleCache, rows, csvDate, theater, 2);
    if (result2.schedules.length >= 5) {
      considerScenario(
        scenarios,
        'twoFilm',
        summarizeScenario({ csvDate, theater, filmCount: 2, result: result2 }),
      );
    }

    if (uniqueFilms >= 3) {
      const result3 = cachedCountSchedules(scheduleCache, rows, csvDate, theater, 3);
      if (result3.schedules.length >= 3) {
        considerScenario(
          scenarios,
          'threeFilm',
          summarizeScenario({ csvDate, theater, filmCount: 3, result: result3 }),
        );
      }
    }

    if (uniqueFilms >= 4) {
      const result4 = cachedCountSchedules(scheduleCache, rows, csvDate, theater, 4);
      if (result4.schedules.length >= 1) {
        considerScenario(
          scenarios,
          'fourFilm',
          summarizeScenario({ csvDate, theater, filmCount: 4, result: result4 }),
        );
      }
    }

    if (uniqueFilms >= 5) {
      const resultMax = cachedCountSchedules(scheduleCache, rows, csvDate, theater, 'max');
      const topFilms = resultMax.schedules[0]?.filmCount ?? resultMax.schedules[0]?.movies?.length ?? 0;
      if (resultMax.schedules.length >= 1 && topFilms >= 5) {
        considerScenario(
          scenarios,
          'maxMode',
          summarizeScenario({ csvDate, theater, filmCount: 'max', result: resultMax }),
        );
      }
    }

    const isNonAmc =
      theater.includes('SIFF') ||
      theater.includes('Beacon') ||
      groupRows.some((row) => row.source && row.source !== 'amc');
    if (isNonAmc && result2.schedules.length >= 1) {
      considerScenario(
        scenarios,
        'nonAmc',
        summarizeScenario({
          csvDate,
          theater,
          filmCount: 2,
          result: result2,
          extra: { source: groupRows[0]?.source ?? 'unknown' },
        }),
      );
    }

    if (theater.startsWith('AMC ') && uniqueFilms >= 5) {
      const resultMax = cachedCountSchedules(scheduleCache, rows, csvDate, theater, 'max');
      const topFilms = resultMax.schedules[0]?.filmCount ?? resultMax.schedules[0]?.movies?.length ?? 0;
      if (resultMax.schedules.length >= 1 && topFilms >= 4) {
        considerScenario(
          scenarios,
          'marathonAmc',
          summarizeScenario({
            csvDate,
            theater,
            filmCount: 'max',
            result: resultMax,
            extra: { marathonDefaultTheater: theater.startsWith('AMC Pacific Place') },
          }),
        );
      }
    }

    if (
      scenarios.twoFilm?.browserEligible &&
      scenarios.threeFilm?.browserEligible &&
      scenarios.maxMode?.browserEligible &&
      scenarios.nonAmc?.browserEligible &&
      scenarios.pagination
    ) {
      break;
    }
  }

  if (!scenarios.pagination) {
    const dates = [...new Set(rows.map((row) => row.Date))].sort((a, b) => {
      const aFuture = isTodayOrFuture(a);
      const bFuture = isTodayOrFuture(b);
      if (aFuture !== bFuture) return aFuture ? -1 : 1;
      return a.localeCompare(b);
    });
    for (const csvDate of dates) {
      const result = cachedCountSchedules(scheduleCache, rows, csvDate, '', 2);
      if (result.schedules.length > 20) {
        considerScenario(
          scenarios,
          'pagination',
          summarizeScenario({
            csvDate,
            theater: '(all theaters)',
            filmCount: 2,
            result,
          }),
        );
        break;
      }
    }
  }

  const audit = {
    generatedAt: artifact.generated_at ?? null,
    window: artifact.window ?? null,
    stats: artifact.stats ?? null,
    sourcesIncluded: artifact.sources_included ?? [],
    rowCount: rows.length,
    scenarioCount: Object.values(scenarios).filter(Boolean).length,
  };

  return { artifact, rows, scenarios, audit };
}

/** Pick the best scenario for browser QA (prefers browser-eligible dates). */
export function pickBrowserScenario(scenarios) {
  const ordered = [
    scenarios.twoFilm,
    scenarios.threeFilm,
    scenarios.fourFilm,
    scenarios.maxMode,
    scenarios.nonAmc,
  ].filter(Boolean);
  return ordered.find((scenario) => scenario.browserEligible) ?? ordered[0] ?? null;
}

/** Return browser-eligible scenario or null. */
export function pickBrowserEligibleScenario(scenario) {
  if (!scenario) return null;
  return scenario.browserEligible ? scenario : null;
}
