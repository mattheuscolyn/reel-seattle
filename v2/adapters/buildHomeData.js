/**
 * Pure v2 Home data adapter (I-02).
 *
 * Converts showtimes_current + theaters registry + newly_added_current
 * (+ optional pipeline_report and leaving_soon_current) into Home view models.
 *
 * Does not invent ranking, cultural scores, synopsis, or landscape art.
 */

import { buildOpeningThisWeek } from './buildOpeningThisWeek.js';
import { buildLeavingSoon } from './buildLeavingSoon.js';
import { createHomeWarning } from './homeWarnings.js';
import {
  buildOpportunityKey,
  buildSortableLocalDateTime,
  isIsoDate,
  isLocalTime,
} from './opportunityIdentity.js';

export const LEAVING_SOON_EXCLUDED = false;

/**
 * @param {unknown} payload
 * @returns {asserts payload is object}
 */
export function assertShowtimesCurrentShape(payload) {
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('showtimes_current must be a JSON object');
  }
  if (!Array.isArray(payload.showtimes)) {
    throw new Error('showtimes_current must include a showtimes array');
  }
  if (!Array.isArray(payload.films)) {
    throw new Error('showtimes_current must include a films array');
  }
  if (!Array.isArray(payload.theaters)) {
    throw new Error('showtimes_current must include a theaters array');
  }
}

/**
 * @param {unknown} payload
 */
export function assertTheaterRegistryShape(payload) {
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('theaters registry must be a JSON object');
  }
  if (!Array.isArray(payload.theaters)) {
    throw new Error('theaters registry must include a theaters array');
  }
}

/**
 * @param {unknown} payload
 */
export function assertNewlyAddedShape(payload) {
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('newly_added_current must be a JSON object');
  }
  if (!Array.isArray(payload.entries)) {
    throw new Error('newly_added_current must include an entries array');
  }
}

/**
 * @param {unknown} payload
 */
export function assertPipelineReportShape(payload) {
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('pipeline_report must be a JSON object');
  }
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function asStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === 'string' && item.trim())
    .map((item) => item.trim());
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function asTrimmedString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Public ticket_url → presentation ticketUrl. Absolute http(s) only.
 * @param {unknown} value
 * @returns {string | null}
 */
function asTicketUrl(value) {
  const trimmed = asTrimmedString(value);
  if (!trimmed) return null;
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    return trimmed;
  }
  return null;
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function asPositiveNumber(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

/**
 * Accept only namespaced public film_id values (T-FILMID-02).
 * Never treat source_film_id / titles as canonical identity.
 * @param {unknown} value
 * @returns {string | null}
 */
function asCanonicalFilmId(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^tmdb:[1-9][0-9]*$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * @param {unknown} status
 */
function isCanceledStatus(status) {
  if (typeof status !== 'string') return false;
  return status.trim().toLowerCase() === 'canceled';
}

/**
 * @param {object} registryTheater
 * @param {object | null} embeddedTheater
 */
function mergeTheaterRecord(registryTheater, embeddedTheater) {
  const base = registryTheater || embeddedTheater || {};
  const pick = (snake, camel = null) =>
    asTrimmedString(base[snake]) ??
    (camel ? asTrimmedString(base[camel]) : null) ??
    asTrimmedString(embeddedTheater?.[snake]) ??
    (camel ? asTrimmedString(embeddedTheater?.[camel]) : null);

  const pickNumber = (snake, camel = null) => {
    const fromBase =
      asPositiveNumber(base[snake]) ??
      (camel ? asPositiveNumber(base[camel]) : null);
    if (fromBase != null) return fromBase;
    return (
      asPositiveNumber(embeddedTheater?.[snake]) ??
      (camel ? asPositiveNumber(embeddedTheater?.[camel]) : null)
    );
  };

  const capabilities = asStringArray(
    base.capabilities ?? embeddedTheater?.capabilities,
  );
  const amenities = asStringArray(base.amenities ?? embeddedTheater?.amenities);

  return {
    id: asTrimmedString(base.id) ?? '',
    name: asTrimmedString(base.name) ?? asTrimmedString(embeddedTheater?.name) ?? 'Unknown theater',
    source: asTrimmedString(base.source) ?? asTrimmedString(embeddedTheater?.source),
    city: asTrimmedString(base.city) ?? asTrimmedString(embeddedTheater?.city),
    neighborhood:
      asTrimmedString(base.neighborhood) ??
      asTrimmedString(embeddedTheater?.neighborhood),
    type: asTrimmedString(base.type) ?? asTrimmedString(embeddedTheater?.type),
    enabled: typeof base.enabled === 'boolean' ? base.enabled : null,
    // D06 visit metadata (nullable until T-THEA-10 curation) — never invent.
    addressLine1: pick('address_line1', 'addressLine1'),
    addressLine2: pick('address_line2', 'addressLine2'),
    state: pick('state'),
    postalCode: pick('postal_code', 'postalCode'),
    latitude: pickNumber('latitude'),
    longitude: (() => {
      const lng = base.longitude ?? base.lng ?? embeddedTheater?.longitude;
      if (typeof lng === 'number' && Number.isFinite(lng)) return lng;
      return null;
    })(),
    websiteUrl: pick('website_url', 'websiteUrl'),
    directionsUrl: pick('directions_url', 'directionsUrl'),
    phone: pick('phone'),
    shortDescription: pick('short_description', 'shortDescription'),
    screenCount: (() => {
      const n = base.screen_count ?? base.screenCount ?? embeddedTheater?.screen_count;
      if (typeof n === 'number' && Number.isInteger(n) && n >= 1) return n;
      return null;
    })(),
    capabilities,
    amenities,
    imageUrl: pick('image_url', 'imageUrl'),
    imageHeroUrl: pick('image_hero_url', 'imageHeroUrl'),
    imageThumbnailUrl: pick('image_thumbnail_url', 'imageThumbnailUrl'),
    imageAttribution: pick('image_attribution', 'imageAttribution'),
    imageLicense: pick('image_license', 'imageLicense'),
  };
}

/**
 * Build HomeData from already-parsed artifacts.
 *
 * @param {{
 *   showtimesCurrent: unknown,
 *   theatersRegistry?: unknown | null,
 *   newlyAdded?: unknown | null,
 *   openingThisWeek?: unknown | null,
 *   leavingSoon?: unknown | null,
 *   pipelineReport?: unknown | null,
 * }} input
 */
export function buildHomeData(input) {
  const warnings = [];

  assertShowtimesCurrentShape(input.showtimesCurrent);
  const showtimesArtifact = input.showtimesCurrent;

  let registryTheaters = [];
  if (input.theatersRegistry != null) {
    try {
      assertTheaterRegistryShape(input.theatersRegistry);
      registryTheaters = input.theatersRegistry.theaters;
    } catch (error) {
      warnings.push(
        createHomeWarning(
          'recoverable',
          'theater_registry_invalid',
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  } else {
    warnings.push(
      createHomeWarning(
        'informational',
        'theater_registry_missing',
        'Theater registry unavailable; using theaters embedded in showtimes_current.',
      ),
    );
  }

  /** @type {Map<string, object>} */
  const registryById = new Map();
  for (const theater of registryTheaters) {
    const id = asTrimmedString(theater?.id);
    if (!id) continue;
    registryById.set(id, theater);
  }

  /** @type {Map<string, object>} */
  const embeddedById = new Map();
  for (const theater of showtimesArtifact.theaters) {
    const id = asTrimmedString(theater?.id);
    if (!id) continue;
    embeddedById.set(id, theater);
  }

  /** @type {Map<string, object>} */
  const filmRefsByKey = new Map();
  for (const film of showtimesArtifact.films) {
    const key = asTrimmedString(film?.showtime_film_key);
    if (!key) continue;
    filmRefsByKey.set(key, film);
  }

  /** @type {Map<string, object>} */
  const opportunityByKey = new Map();
  /** @type {Map<string, object>} */
  const filmAgg = new Map();
  /** @type {Map<string, { count: number, earliest: string | null, latest: string | null }>} */
  const theaterAgg = new Map();

  for (let index = 0; index < showtimesArtifact.showtimes.length; index += 1) {
    const raw = showtimesArtifact.showtimes[index];
    if (raw == null || typeof raw !== 'object') {
      warnings.push(
        createHomeWarning('record_skipped', 'showtime_not_object', 'Showtime record is not an object.', {
          index,
        }),
      );
      continue;
    }

    if (isCanceledStatus(raw.status)) {
      warnings.push(
        createHomeWarning(
          'informational',
          'showtime_canceled_skipped',
          'Canceled showtime skipped.',
          { index, id: raw.id ?? null },
        ),
      );
      continue;
    }

    const filmKey = asTrimmedString(raw.showtime_film_key);
    const title = asTrimmedString(raw.film_title);
    const theaterId = asTrimmedString(raw.theater_id);
    const localDate = asTrimmedString(raw.date);
    const localTime = asTrimmedString(raw.time);

    if (!filmKey) {
      warnings.push(
        createHomeWarning('record_skipped', 'missing_film_key', 'Showtime missing showtime_film_key.', {
          index,
          id: raw.id ?? null,
        }),
      );
      continue;
    }
    if (!title) {
      warnings.push(
        createHomeWarning('record_skipped', 'missing_title', 'Showtime missing film_title.', {
          index,
          filmKey,
          id: raw.id ?? null,
        }),
      );
      continue;
    }
    if (!theaterId) {
      warnings.push(
        createHomeWarning('record_skipped', 'missing_theater_id', 'Showtime missing theater_id.', {
          index,
          filmKey,
          id: raw.id ?? null,
        }),
      );
      continue;
    }
    if (!isIsoDate(localDate)) {
      warnings.push(
        createHomeWarning('record_skipped', 'invalid_local_date', 'Showtime missing or invalid local date.', {
          index,
          filmKey,
          theaterId,
          date: raw.date ?? null,
        }),
      );
      continue;
    }
    if (!isLocalTime(localTime)) {
      warnings.push(
        createHomeWarning('record_skipped', 'invalid_local_time', 'Showtime missing or invalid local time.', {
          index,
          filmKey,
          theaterId,
          time: raw.time ?? null,
        }),
      );
      continue;
    }

    const formatLabels = asStringArray(raw.format_tags);
    const opportunityKey = buildOpportunityKey({
      id: asTrimmedString(raw.id),
      source: asTrimmedString(raw.source),
      sourceShowtimeId: asTrimmedString(raw.source_showtime_id),
      theaterId,
      localDate,
      localTime: localTime.slice(0, 5),
      filmKey,
      formatLabels,
    });

    if (opportunityByKey.has(opportunityKey)) {
      warnings.push(
        createHomeWarning(
          'informational',
          'duplicate_opportunity_identity',
          'Duplicate opportunity identity skipped; first record kept.',
          { opportunityKey, index },
        ),
      );
      continue;
    }

    const registryTheater = registryById.get(theaterId) ?? null;
    const embeddedTheater = embeddedById.get(theaterId) ?? null;
    if (!registryTheater && !embeddedTheater) {
      warnings.push(
        createHomeWarning(
          'recoverable',
          'unknown_theater_id',
          'Showtime references an unknown theater id.',
          { theaterId, filmKey, opportunityKey },
        ),
      );
    }

    const theaterMeta = mergeTheaterRecord(registryTheater, embeddedTheater);
    const theaterName = theaterMeta.name;
    const sortableLocalDateTime = buildSortableLocalDateTime(localDate, localTime);
    if (!sortableLocalDateTime) {
      warnings.push(
        createHomeWarning('record_skipped', 'unsortable_datetime', 'Could not build sortable local datetime.', {
          index,
          localDate,
          localTime,
        }),
      );
      continue;
    }

    const attributes =
      raw.attributes && typeof raw.attributes === 'object' && !Array.isArray(raw.attributes)
        ? raw.attributes
        : {};

    const opportunity = {
      opportunityKey,
      filmKey,
      theaterId,
      theaterName,
      localDate,
      localTime: localTime.slice(0, 5),
      timeDisplay: asTrimmedString(raw.time_display) ?? localTime.slice(0, 5),
      sortableLocalDateTime,
      formatLabels,
      ticketUrl: asTicketUrl(raw.ticket_url),
      // sourceUrl is non-ticket context only — never used as a ticket fallback.
      sourceUrl: asTrimmedString(attributes.source_url) ?? asTrimmedString(attributes.url),
      auditorium: asTrimmedString(attributes.auditorium) ?? asTrimmedString(attributes.screen),
      status: asTrimmedString(raw.status),
      source: asTrimmedString(raw.source) ?? 'unknown',
      sourceShowtimeId: asTrimmedString(raw.source_showtime_id),
      sourceFilmId: asTrimmedString(raw.source_film_id),
      parentFilmKey: asTrimmedString(raw.parent_film_key),
      parentDisplayTitle: asTrimmedString(raw.parent_display_title),
      screeningVariantType: asTrimmedString(raw.screening_variant_type),
      isSpecialScreening: raw.is_special_screening === true,
    };
    opportunityByKey.set(opportunityKey, opportunity);

    const filmRef = filmRefsByKey.get(filmKey);
    let film = filmAgg.get(filmKey);
    if (!film) {
      film = {
        filmKey,
        parentFilmKey:
          asTrimmedString(raw.parent_film_key) ??
          asTrimmedString(filmRef?.parent_film_key),
        title,
        parentDisplayTitle:
          asTrimmedString(raw.parent_display_title) ??
          asTrimmedString(filmRef?.parent_display_title),
        posterUrl:
          asTrimmedString(raw.poster_url) ?? asTrimmedString(filmRef?.poster_url),
        runtimeMin:
          asPositiveNumber(raw.runtime_min) ?? asPositiveNumber(filmRef?.runtime_min),
        sourceFilmId:
          asTrimmedString(raw.source_film_id) ?? asTrimmedString(filmRef?.source_film_id),
        // Canonical identity from public film_id only (T-FILMID-02). Never invent from title/source id.
        filmId: asCanonicalFilmId(filmRef?.film_id),
        sourceTitle: asTrimmedString(raw.source_title),
        screeningVariantType:
          asTrimmedString(raw.screening_variant_type) ??
          asTrimmedString(filmRef?.screening_variant_type),
        isSpecialScreening:
          raw.is_special_screening === true ||
          filmRef?.is_special_screening === true,
        showtimeCount: 0,
        theaterIds: new Set(),
        firstShowtimeAt: null,
        lastShowtimeAt: null,
      };
      filmAgg.set(filmKey, film);
    } else {
      if (!film.posterUrl) {
        film.posterUrl =
          asTrimmedString(raw.poster_url) ?? asTrimmedString(filmRef?.poster_url);
      }
      if (film.runtimeMin == null) {
        film.runtimeMin =
          asPositiveNumber(raw.runtime_min) ?? asPositiveNumber(filmRef?.runtime_min);
      }
    }
    film.showtimeCount += 1;
    film.theaterIds.add(theaterId);
    if (!film.firstShowtimeAt || sortableLocalDateTime < film.firstShowtimeAt) {
      film.firstShowtimeAt = sortableLocalDateTime;
    }
    if (!film.lastShowtimeAt || sortableLocalDateTime > film.lastShowtimeAt) {
      film.lastShowtimeAt = sortableLocalDateTime;
    }

    let tAgg = theaterAgg.get(theaterId);
    if (!tAgg) {
      tAgg = {
        meta: theaterMeta,
        count: 0,
        earliest: null,
        latest: null,
      };
      theaterAgg.set(theaterId, tAgg);
    }
    tAgg.count += 1;
    if (!tAgg.earliest || sortableLocalDateTime < tAgg.earliest) {
      tAgg.earliest = sortableLocalDateTime;
    }
    if (!tAgg.latest || sortableLocalDateTime > tAgg.latest) {
      tAgg.latest = sortableLocalDateTime;
    }
  }

  // Include registry theaters with zero opportunities so Home can list venues honestly.
  for (const [id, theater] of registryById) {
    if (theaterAgg.has(id)) continue;
    theaterAgg.set(id, {
      meta: mergeTheaterRecord(theater, embeddedById.get(id) ?? null),
      count: 0,
      earliest: null,
      latest: null,
    });
  }

  const opportunities = [...opportunityByKey.values()].sort((a, b) => {
    if (a.sortableLocalDateTime !== b.sortableLocalDateTime) {
      return a.sortableLocalDateTime < b.sortableLocalDateTime ? -1 : 1;
    }
    if (a.theaterId !== b.theaterId) {
      return a.theaterId < b.theaterId ? -1 : 1;
    }
    if (a.filmKey !== b.filmKey) {
      return a.filmKey < b.filmKey ? -1 : 1;
    }
    return a.opportunityKey < b.opportunityKey ? -1 : 1;
  });

  const films = [...filmAgg.values()]
    .map((film) => ({
      filmKey: film.filmKey,
      parentFilmKey: film.parentFilmKey,
      title: film.title,
      parentDisplayTitle: film.parentDisplayTitle,
      posterUrl: film.posterUrl,
      runtimeMin: film.runtimeMin,
      sourceFilmId: film.sourceFilmId,
      filmId: film.filmId ?? null,
      sourceTitle: film.sourceTitle,
      screeningVariantType: film.screeningVariantType ?? null,
      isSpecialScreening: film.isSpecialScreening === true,
      showtimeCount: film.showtimeCount,
      theaterCount: film.theaterIds.size,
      firstShowtimeAt: film.firstShowtimeAt,
      lastShowtimeAt: film.lastShowtimeAt,
    }))
    .sort((a, b) => {
      if (a.title !== b.title) return a.title < b.title ? -1 : 1;
      return a.filmKey < b.filmKey ? -1 : 1;
    });

  /** @type {Record<string, object>} */
  const theatersById = {};
  /** @type {string[]} */
  const theaterOrder = [];

  // Preserve registry authorship order for Theaters list.
  for (const theater of registryTheaters) {
    const id = asTrimmedString(theater?.id);
    if (!id || !theaterAgg.has(id)) continue;
    theaterOrder.push(id);
  }
  for (const id of [...theaterAgg.keys()].sort((a, b) => (a < b ? -1 : 1))) {
    if (!theaterOrder.includes(id)) theaterOrder.push(id);
  }

  for (const id of theaterOrder) {
    const agg = theaterAgg.get(id);
    if (!agg) continue;
    theatersById[id] = {
      id,
      name: agg.meta.name,
      source: agg.meta.source,
      city: agg.meta.city,
      neighborhood: agg.meta.neighborhood,
      type: agg.meta.type,
      enabled: agg.meta.enabled,
      addressLine1: agg.meta.addressLine1,
      addressLine2: agg.meta.addressLine2,
      state: agg.meta.state,
      postalCode: agg.meta.postalCode,
      latitude: agg.meta.latitude,
      longitude: agg.meta.longitude,
      websiteUrl: agg.meta.websiteUrl,
      directionsUrl: agg.meta.directionsUrl,
      phone: agg.meta.phone,
      shortDescription: agg.meta.shortDescription,
      screenCount: agg.meta.screenCount,
      capabilities: agg.meta.capabilities,
      amenities: agg.meta.amenities,
      imageUrl: agg.meta.imageUrl,
      imageHeroUrl: agg.meta.imageHeroUrl,
      imageThumbnailUrl: agg.meta.imageThumbnailUrl,
      imageAttribution: agg.meta.imageAttribution,
      imageLicense: agg.meta.imageLicense,
      opportunityCount: agg.count,
      earliestShowtimeAt: agg.earliest,
      latestShowtimeAt: agg.latest,
    };
  }

  const newlyAdded = buildNewlyAddedSummaries({
    newlyAddedArtifact: input.newlyAdded,
    filmsByKey: new Map(films.map((film) => [film.filmKey, film])),
    opportunities,
    warnings,
  });

  const openingThisWeek = buildOpeningThisWeek(input.openingThisWeek, {
    warnings,
  });

  const leavingSoon = buildLeavingSoon(input.leavingSoon, {
    warnings,
  });

  const newlyAddedFilmKeys = new Set(newlyAdded.map((item) => item.filmKey));

  const opportunityCandidates = opportunities.map((opportunity) => {
    const film = filmAgg.get(opportunity.filmKey);
    return {
      opportunityKey: opportunity.opportunityKey,
      filmKey: opportunity.filmKey,
      title: film?.title ?? opportunity.filmKey,
      theaterId: opportunity.theaterId,
      theaterName: opportunity.theaterName,
      sortableLocalDateTime: opportunity.sortableLocalDateTime,
      formatLabels: opportunity.formatLabels,
      isNewlyAdded: newlyAddedFilmKeys.has(opportunity.filmKey),
      filmShowtimeCount: film?.showtimeCount ?? 0,
      filmTheaterCount: film?.theaterIds.size ?? 0,
      hasPoster: Boolean(film?.posterUrl),
      hasTicketUrl: Boolean(opportunity.ticketUrl),
      // Mechanical order key for tests — not a recommendation score.
      chronologicalKey: `${opportunity.sortableLocalDateTime}|${opportunity.theaterId}|${opportunity.filmKey}|${opportunity.opportunityKey}`,
    };
  });

  let sourceHealth = null;
  if (input.pipelineReport != null) {
    try {
      assertPipelineReportShape(input.pipelineReport);
      const report = input.pipelineReport;
      sourceHealth = {
        generatedAt: asTrimmedString(report.generated_at),
        status: asTrimmedString(report.status),
        sources: report.sources && typeof report.sources === 'object' ? report.sources : {},
        totals: report.totals && typeof report.totals === 'object' ? report.totals : null,
        messages: Array.isArray(report.messages) ? report.messages : [],
      };
    } catch (error) {
      warnings.push(
        createHomeWarning(
          'recoverable',
          'pipeline_report_invalid',
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  }

  return {
    generatedAt: asTrimmedString(showtimesArtifact.generated_at),
    timezone: asTrimmedString(showtimesArtifact.timezone) ?? 'America/Los_Angeles',
    window:
      showtimesArtifact.window && typeof showtimesArtifact.window === 'object'
        ? showtimesArtifact.window
        : null,
    theatersById,
    theaterOrder,
    films,
    opportunities,
    newlyAdded,
    openingThisWeek,
    leavingSoon,
    opportunityCandidates,
    warnings,
    sourceHealth,
    leavingSoonExcluded: LEAVING_SOON_EXCLUDED,
    counts: {
      films: films.length,
      opportunities: opportunities.length,
      newlyAdded: newlyAdded.length,
      openingThisWeek: openingThisWeek.entries.length,
      leavingSoon: leavingSoon.entries.length,
      theaters: Object.keys(theatersById).length,
      warnings: warnings.length,
    },
  };
}

/**
 * @param {{
 *   newlyAddedArtifact: unknown | null | undefined,
 *   filmsByKey: Map<string, object>,
 *   opportunities: object[],
 *   warnings: object[],
 * }} args
 */
function buildNewlyAddedSummaries({
  newlyAddedArtifact,
  filmsByKey,
  opportunities,
  warnings,
}) {
  if (newlyAddedArtifact == null) {
    warnings.push(
      createHomeWarning(
        'informational',
        'newly_added_missing',
        'newly_added_current unavailable; newlyAdded list is empty.',
      ),
    );
    return [];
  }

  try {
    assertNewlyAddedShape(newlyAddedArtifact);
  } catch (error) {
    warnings.push(
      createHomeWarning(
        'recoverable',
        'newly_added_invalid',
        error instanceof Error ? error.message : String(error),
      ),
    );
    return [];
  }

  /** @type {Map<string, object>} */
  const byFilmKey = new Map();

  for (let index = 0; index < newlyAddedArtifact.entries.length; index += 1) {
    const entry = newlyAddedArtifact.entries[index];
    if (entry == null || typeof entry !== 'object') {
      warnings.push(
        createHomeWarning('record_skipped', 'newly_added_not_object', 'Newly-added entry is not an object.', {
          index,
        }),
      );
      continue;
    }

    const filmKey = asTrimmedString(entry.showtime_film_key);
    const title = asTrimmedString(entry.film_title);
    if (!filmKey) {
      warnings.push(
        createHomeWarning('record_skipped', 'newly_added_missing_film_key', 'Newly-added entry missing film key.', {
          index,
        }),
      );
      continue;
    }
    if (!title) {
      warnings.push(
        createHomeWarning('record_skipped', 'newly_added_missing_title', 'Newly-added entry missing title.', {
          index,
          filmKey,
        }),
      );
      continue;
    }

    const theaterId = asTrimmedString(entry.theater_id);
    let group = byFilmKey.get(filmKey);
    if (!group) {
      group = {
        filmKey,
        title,
        firstObservedAt: asTrimmedString(entry.first_announced_date),
        lastSeenDate: asTrimmedString(entry.last_seen_date),
        theaterIds: new Set(),
      };
      byFilmKey.set(filmKey, group);
    }
    if (theaterId) group.theaterIds.add(theaterId);
    const first = asTrimmedString(entry.first_announced_date);
    if (first && (!group.firstObservedAt || first < group.firstObservedAt)) {
      group.firstObservedAt = first;
    }
    const last = asTrimmedString(entry.last_seen_date);
    if (last && (!group.lastSeenDate || last > group.lastSeenDate)) {
      group.lastSeenDate = last;
    }
  }

  const oppsByFilm = new Map();
  for (const opportunity of opportunities) {
    let list = oppsByFilm.get(opportunity.filmKey);
    if (!list) {
      list = [];
      oppsByFilm.set(opportunity.filmKey, list);
    }
    list.push(opportunity);
  }

  return [...byFilmKey.values()]
    .map((group) => {
      const film = filmsByKey.get(group.filmKey);
      const filmOpps = oppsByFilm.get(group.filmKey) ?? [];
      const theaterIdsFromOpps = new Set(filmOpps.map((item) => item.theaterId));
      const theaterCount = film
        ? film.theaterCount
        : Math.max(group.theaterIds.size, theaterIdsFromOpps.size);

      return {
        filmKey: group.filmKey,
        title: group.title,
        // Poster only when current showtimes/film refs provide one — never invent.
        posterUrl: film?.posterUrl ?? null,
        firstObservedAt: group.firstObservedAt,
        lastSeenDate: group.lastSeenDate,
        opportunityCount: filmOpps.length,
        theaterCount,
        nextShowtimeAt: filmOpps[0]?.sortableLocalDateTime ?? null,
        hasActiveShowtimes: filmOpps.length > 0,
      };
    })
    .sort((a, b) => {
      if (a.firstObservedAt !== b.firstObservedAt) {
        if (a.firstObservedAt == null) return 1;
        if (b.firstObservedAt == null) return -1;
        return a.firstObservedAt < b.firstObservedAt ? 1 : -1;
      }
      return a.title < b.title ? -1 : 1;
    });
}
