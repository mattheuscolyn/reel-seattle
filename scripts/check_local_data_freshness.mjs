#!/usr/bin/env node
/**
 * Report whether local public/ data artifacts look fresh enough for manual QA.
 * Informational only — stale AMC data exits 0 with warnings.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const LOCALE = 'en-US';

const ARTIFACTS = {
  showtimes: {
    label: 'showtimes_current.json',
    path: join(ROOT, 'public/data/showtimes_current.json'),
    required: true,
  },
  pipeline: {
    label: 'pipeline_report.json',
    path: join(ROOT, 'public/data/pipeline_report.json'),
    required: true,
  },
  newlyAdded: {
    label: 'newly_added_current.json',
    path: join(ROOT, 'public/data/newly_added_current.json'),
    required: true,
  },
};

const SOURCE_ORDER = ['amc', 'siff', 'beacon'];

function fail(message) {
  console.error(`check_local_data_freshness: ${message}`);
  process.exit(1);
}

function readJsonArtifact({ label, path, required }) {
  const rel = relative(ROOT, path).replace(/\\/g, '/');
  if (!existsSync(path)) {
    if (required) {
      fail(`missing required file: ${rel}`);
    }
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`${rel} is not valid JSON: ${error.message}`);
  }
}

/**
 * @param {string | undefined} isoDate
 * @returns {Date | null}
 */
export function parseIsoCalendarDate(isoDate) {
  if (!isoDate || typeof isoDate !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function formatShortMonthDay(date) {
  return date.toLocaleDateString(LOCALE, { month: 'short', day: 'numeric' });
}

/**
 * @param {string | undefined} startIso
 * @param {string | undefined} endIso
 * @returns {string | null}
 */
export function formatIsoDateSpan(startIso, endIso) {
  const start = parseIsoCalendarDate(startIso);
  const end = parseIsoCalendarDate(endIso);
  if (!start || !end) return null;

  const startYear = start.getFullYear();
  const endYear = end.getFullYear();
  const startMonth = start.getMonth();
  const endMonth = end.getMonth();
  const startDay = start.getDate();
  const endDay = end.getDate();

  if (startYear === endYear && startMonth === endMonth && startDay === endDay) {
    return formatShortMonthDay(start);
  }

  if (startYear === endYear && startMonth === endMonth) {
    const monthShort = start.toLocaleDateString(LOCALE, { month: 'short' });
    return `${monthShort} ${startDay}–${endDay}`;
  }

  return `${formatShortMonthDay(start)}–${formatShortMonthDay(end)}`;
}

function formatSourceStatusLabel(sourceKey, status) {
  const normalized = String(status || 'unknown').trim().toLowerCase();
  const name = sourceKey.toUpperCase();
  if (normalized === 'success') return `${name} current`;
  return `${name} ${normalized}`;
}

/**
 * @param {Record<string, { status?: string }> | undefined} sources
 * @returns {string}
 */
export function summarizePipelineSources(sources) {
  if (!sources || typeof sources !== 'object') return 'source statuses unavailable';

  const parts = [];
  const seen = new Set();

  for (const key of SOURCE_ORDER) {
    if (!sources[key]) continue;
    parts.push(formatSourceStatusLabel(key, sources[key].status));
    seen.add(key);
  }

  for (const [key, entry] of Object.entries(sources)) {
    if (seen.has(key)) continue;
    parts.push(formatSourceStatusLabel(key, entry?.status));
  }

  return parts.length > 0 ? parts.join(', ') : 'no source entries';
}

function finiteCount(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function summarizeShowtimesCurrent(artifact) {
  if (!artifact || typeof artifact !== 'object') {
    fail('showtimes_current.json has invalid shape');
  }
  if (!Array.isArray(artifact.showtimes)) {
    fail('showtimes_current.json is missing a showtimes array');
  }

  const window = artifact.window ?? {};
  const span = formatIsoDateSpan(window.start_date, window.end_date);
  const statsCount = finiteCount(artifact.stats?.showtime_count);
  const count = statsCount ?? artifact.showtimes.length;
  const windowText = span ? `window ${span}` : 'window unavailable';
  const generated = artifact.generated_at ? `generated ${artifact.generated_at}` : null;

  return {
    line: `- showtimes_current.json: ${windowText}, ${count} showtimes${generated ? ` (${generated})` : ''}`,
    count,
    sources: artifact.sources ?? {},
    sourcesIncluded: Array.isArray(artifact.sources_included) ? artifact.sources_included : [],
    generatedAt: artifact.generated_at ?? null,
  };
}

function summarizePipelineReport(artifact) {
  if (!artifact || typeof artifact !== 'object' || !artifact.sources) {
    fail('pipeline_report.json has invalid shape');
  }

  const generated = artifact.generated_at ? ` (generated ${artifact.generated_at})` : '';
  return {
    line: `- pipeline_report.json: ${summarizePipelineSources(artifact.sources)}${generated}`,
    sources: artifact.sources,
    generatedAt: artifact.generated_at ?? null,
  };
}

function summarizeNewlyAddedCurrent(artifact) {
  if (!artifact || typeof artifact !== 'object') {
    fail('newly_added_current.json has invalid shape');
  }
  if (!Array.isArray(artifact.entries)) {
    fail('newly_added_current.json is missing an entries array');
  }

  const daysBack = artifact.days_back ?? null;
  const generated = artifact.generated_at ? `generated ${artifact.generated_at}` : null;
  const daysText = daysBack == null ? 'days_back unavailable' : `days_back=${daysBack}`;

  return {
    line: `- newly_added_current.json: ${artifact.entries.length} entries, ${daysText}${generated ? `, ${generated}` : ''}`,
    count: artifact.entries.length,
    daysBack,
    generatedAt: artifact.generated_at ?? null,
    malformed: false,
  };
}

function collectWarnings({ showtimes, pipeline, newlyAdded }) {
  const warnings = [];

  const amcPipeline = pipeline.sources?.amc;
  const amcStatus = String(amcPipeline?.status || '').toLowerCase();
  const amcPipelineCount = finiteCount(amcPipeline?.showtime_count);

  if (amcStatus === 'stale' || amcStatus === 'failed' || amcStatus === 'error') {
    warnings.push(`pipeline_report.json marks AMC as ${amcStatus}.`);
  }
  if (amcPipelineCount === 0) {
    warnings.push('pipeline_report.json reports 0 AMC showtimes.');
  }

  const amcShowtimes = showtimes.sources?.amc;
  const amcShowtimesStatus = String(amcShowtimes?.status || '').toLowerCase();
  const amcShowtimesCount = finiteCount(amcShowtimes?.showtime_count);
  if (amcShowtimesStatus === 'stale' || amcShowtimesStatus === 'failed' || amcShowtimesStatus === 'error') {
    warnings.push(`showtimes_current.json marks AMC as ${amcShowtimesStatus}.`);
  }
  if (amcShowtimesCount === 0) {
    warnings.push('showtimes_current.json reports 0 AMC showtimes.');
  }
  if (showtimes.sourcesIncluded.length > 0 && !showtimes.sourcesIncluded.includes('amc')) {
    warnings.push('showtimes_current.json does not include AMC in sources_included.');
  }

  if (showtimes.count === 0) {
    warnings.push('showtimes_current.json contains 0 showtimes.');
  }

  if (!newlyAdded) {
    warnings.push('newly_added_current.json is missing; Recently Added QA may be incomplete locally.');
  } else if (newlyAdded.malformed) {
    warnings.push('newly_added_current.json has an unexpected shape.');
  } else if (newlyAdded.count === 0) {
    warnings.push('newly_added_current.json contains 0 entries.');
  }

  const uniqueWarnings = [...new Set(warnings)];
  if (uniqueWarnings.some((warning) => /amc/i.test(warning))) {
    uniqueWarnings.push(
      'Local AMC data appears stale or empty. Manual Planner QA may not reflect the latest GitHub/deployed data.',
    );
  }

  return [...new Set(uniqueWarnings)];
}

function main() {
  const showtimesArtifact = readJsonArtifact(ARTIFACTS.showtimes);
  const pipelineArtifact = readJsonArtifact(ARTIFACTS.pipeline);
  const newlyAddedArtifact = readJsonArtifact(ARTIFACTS.newlyAdded);

  const showtimes = summarizeShowtimesCurrent(showtimesArtifact);
  const pipeline = summarizePipelineReport(pipelineArtifact);
  const newlyAdded = newlyAddedArtifact
    ? summarizeNewlyAddedCurrent(newlyAddedArtifact)
    : null;

  const warnings = collectWarnings({ showtimes, pipeline, newlyAdded });

  console.log('Local data freshness:');
  console.log(showtimes.line);
  console.log(pipeline.line);
  if (newlyAdded) {
    console.log(newlyAdded.line);
  } else {
    console.log('- newly_added_current.json: not found');
  }

  if (warnings.length > 0) {
    console.log('');
    for (const warning of warnings) {
      console.log(`Warning: ${warning}`);
    }
  } else {
    console.log('');
    console.log('No freshness warnings detected for local public/ artifacts.');
  }

  console.log('');
  console.log(
    'check_local_data_freshness: OK (informational; stale local data does not fail this check)',
  );
}

main();
