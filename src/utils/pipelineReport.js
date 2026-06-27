/** Human-readable labels for pipeline source keys. */
export const SOURCE_LABELS = {
  amc: 'AMC',
  siff: 'SIFF',
  beacon: 'Beacon',
};

export const SOURCE_ORDER = ['amc', 'siff', 'beacon'];

export const PIPELINE_STATUS_UNAVAILABLE = 'Data status unavailable';

/** Map raw pipeline source status to display label. */
export function formatSourceStatus(status) {
  if (!status || typeof status !== 'string') return 'Unknown';
  switch (status.toLowerCase()) {
    case 'success':
      return 'Current';
    case 'stale':
      return 'Stale';
    case 'empty':
      return 'Empty';
    case 'failed':
    case 'error':
      return 'Error';
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

/** CSS modifier for source status styling. */
export function sourceStatusClass(status) {
  if (!status || typeof status !== 'string') return 'unknown';
  const normalized = status.toLowerCase();
  if (normalized === 'success') return 'current';
  if (['stale', 'empty', 'failed', 'error'].includes(normalized)) return normalized;
  return 'unknown';
}

/** Format ISO date (YYYY-MM-DD) for display, e.g. "June 20". */
export function formatDisplayDate(isoDate) {
  if (!isoDate || typeof isoDate !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

/** Format pipeline generated_at timestamp for display. */
export function formatGeneratedAt(isoDateTime) {
  if (!isoDateTime || typeof isoDateTime !== 'string') return null;
  const date = new Date(isoDateTime);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function sourceDetailLine(source) {
  const status = source?.status;
  const count = source?.showtime_count;
  const lastRun = formatDisplayDate(source?.last_successful_run);

  if (status === 'success' && typeof count === 'number' && count > 0) {
    return `${count} showtime${count === 1 ? '' : 's'}`;
  }
  if (status === 'stale' && lastRun) {
    return `last successful scrape: ${lastRun}`;
  }
  if (status === 'empty') {
    return 'no current showtimes';
  }
  if (status === 'failed' && Array.isArray(source?.errors) && source.errors.length > 0) {
    return source.errors[0];
  }
  if (lastRun) {
    return `last successful scrape: ${lastRun}`;
  }
  if (typeof count === 'number') {
    return `${count} showtime${count === 1 ? '' : 's'}`;
  }
  return null;
}

/** Normalize one source entry from pipeline_report.json. */
export function normalizeSourceReport(sourceKey, source) {
  const label = SOURCE_LABELS[sourceKey] || sourceKey.toUpperCase();
  const status = source?.status ?? null;
  return {
    key: sourceKey,
    label,
    status,
    statusLabel: formatSourceStatus(status),
    statusClass: sourceStatusClass(status),
    showtimeCount: typeof source?.showtime_count === 'number' ? source.showtime_count : null,
    lastSuccessfulRun: source?.last_successful_run ?? null,
    lastSuccessfulRunDisplay: formatDisplayDate(source?.last_successful_run),
    detail: source ? sourceDetailLine(source) : null,
  };
}

/** Validate minimal pipeline_report.json shape. */
export function isValidPipelineReport(report) {
  return (
    report != null &&
    typeof report === 'object' &&
    typeof report.generated_at === 'string' &&
    report.sources != null &&
    typeof report.sources === 'object'
  );
}

/** Build normalized view model from pipeline_report.json. */
export function normalizePipelineReport(report) {
  if (!isValidPipelineReport(report)) {
    throw new Error('Invalid pipeline_report.json shape');
  }

  const sources = SOURCE_ORDER.map((key) =>
    normalizeSourceReport(key, report.sources[key]),
  );

  return {
    overallStatus: report.status ?? null,
    generatedAt: report.generated_at,
    generatedAtDisplay: formatGeneratedAt(report.generated_at),
    window: report.window ?? null,
    totals: report.totals ?? null,
    sources,
    summaryLine: buildSummaryLine(sources),
  };
}

/** One-line summary, e.g. "Data status: SIFF current · Beacon current · AMC stale". */
export function buildSummaryLine(sources) {
  if (!Array.isArray(sources) || sources.length === 0) {
    return PIPELINE_STATUS_UNAVAILABLE;
  }
  const parts = sources.map((source) => `${source.label} ${source.statusLabel.toLowerCase()}`);
  return `Data status: ${parts.join(' · ')}`;
}

/** Optional headline when some sources are stale or missing data. */
export function buildHeadline(viewModel) {
  if (!viewModel?.sources?.length) return null;

  const current = viewModel.sources.filter((s) => s.status === 'success');
  const stale = viewModel.sources.filter((s) => s.status === 'stale');
  const empty = viewModel.sources.filter((s) => s.status === 'empty');
  const failed = viewModel.sources.filter((s) => s.status === 'failed');

  if (stale.length === 0 && empty.length === 0 && failed.length === 0) {
    return null;
  }

  const currentNames = current.map((s) => s.label);
  const staleNames = stale.map((s) => s.label);
  const parts = [];

  if (viewModel.generatedAtDisplay) {
    parts.push(`Data updated ${viewModel.generatedAtDisplay}.`);
  }

  if (currentNames.length > 0) {
    parts.push(`${currentNames.join(' and ')} ${currentNames.length === 1 ? 'is' : 'are'} current.`);
  }

  if (staleNames.length > 0) {
    parts.push(`${staleNames.join(' and ')} data may be stale.`);
  }

  if (empty.length > 0) {
    parts.push(`${empty.map((s) => s.label).join(' and ')} has no current showtimes.`);
  }

  if (failed.length > 0) {
    parts.push(`${failed.map((s) => s.label).join(' and ')} reported errors.`);
  }

  return parts.join(' ');
}

const MARATHON_MESSAGES = {
  empty:
    'No current AMC showtimes are available, so marathon schedules may be empty.',
  stale:
    'Marathon schedules need current AMC showtimes. AMC data may be stale, so this planner may be empty.',
  error:
    'Marathon schedules need current AMC showtimes. AMC data reported an error, so this planner may be empty.',
  unavailable:
    'Marathon schedules depend on AMC showtimes. Data status is unavailable right now.',
  caution:
    'Marathon schedules need current AMC showtimes. AMC data may be unavailable, so this planner may be empty.',
};

function findAmcSource(report) {
  if (!report?.sources?.length) return null;
  return report.sources.find((source) => source.key === 'amc') ?? null;
}

/**
 * Banner copy for the Marathon route from a normalized pipeline report view model.
 * Returns null when AMC data looks current (success with showtimes).
 */
export function buildMarathonStatusMessage(report) {
  const amc = findAmcSource(report);
  if (!amc || amc.status == null) {
    return { message: MARATHON_MESSAGES.unavailable, variant: 'unavailable' };
  }

  const status = String(amc.status).toLowerCase();
  const count = amc.showtimeCount;

  if (status === 'success' && typeof count === 'number' && count > 0) {
    return null;
  }

  if (status === 'success' && count === 0) {
    return { message: MARATHON_MESSAGES.empty, variant: 'empty' };
  }

  if (status === 'stale') {
    return { message: MARATHON_MESSAGES.stale, variant: 'stale' };
  }

  if (status === 'empty') {
    return { message: MARATHON_MESSAGES.empty, variant: 'empty' };
  }

  if (status === 'failed' || status === 'error') {
    return { message: MARATHON_MESSAGES.error, variant: 'error' };
  }

  return { message: MARATHON_MESSAGES.caution, variant: 'caution' };
}
