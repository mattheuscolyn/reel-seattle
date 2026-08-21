/**
 * Normalize Film Detail presentations (production composer or mockup fixture)
 * into one render-oriented view model. Slots stay present; values may be null.
 */

/**
 * @param {object} resolved — from resolveFilmDetailPresentation()
 */
export function toFilmDetailView(resolved) {
  if (!resolved?.presentation) {
    return emptyView({ mode: 'production', source: 'home-data', filmKey: null });
  }

  if (resolved.mode === 'mockup-fixture') {
    return mockupToView(resolved.presentation);
  }

  return composedToView(resolved.presentation, resolved.mode);
}

function emptyView({ mode, source, filmKey }) {
  return {
    mode,
    source,
    resolved: false,
    filmKey,
    displayTitle: null,
    hero: {
      title: null,
      posterUrl: null,
      backdropUrl: null,
      year: null,
      runtimeLabel: null,
      rating: null,
      genres: null,
      director: null,
      metaLine: null,
      badges: [],
    },
    actions: {
      saveAvailable: false,
      saveAction: {
        available: false,
        isSaved: false,
        label: 'Save',
        activeLabel: 'Saved',
      },
      seenAvailable: false,
      seenAction: {
        available: false,
        isSeen: false,
        label: 'Seen',
        activeLabel: 'Seen',
      },
      seenActive: false,
      notInterestedAvailable: false,
      notInterestedAction: {
        available: false,
        isNotInterested: false,
        label: 'Not interested',
        activeLabel: 'Not interested',
      },
      notInterestedActive: false,
    },
    whySeeIt: { totalCount: 0, signals: [], empty: true },
    synopsis: {
      available: false,
      preview: null,
      full: null,
      needsMore: false,
      tags: [],
    },
    bestWay: null,
    bestWayEmpty: true,
    today: {
      rows: [],
      empty: true,
      timezoneNote: 'All times in PT',
    },
    availabilityNote: null,
    availabilityHint: null,
  };
}

function mockupToView(p) {
  return {
    mode: 'mockup-fixture',
    source: 'mockup-fixture',
    resolved: true,
    filmKey: 'mockup-2001',
    displayTitle: p.film.title,
    hero: {
      title: p.film.title,
      posterUrl: p.film.posterUrl,
      backdropUrl: p.film.backdropUrl,
      year: p.film.year,
      runtimeLabel: p.film.runtimeLabel,
      rating: p.film.rating,
      genres: p.film.genres,
      director: p.film.director,
      metaLine: [p.film.year, p.film.runtimeLabel, p.film.rating]
        .filter(Boolean)
        .join(' • '),
      badges: [...(p.film.badges ?? [])],
    },
    actions: {
      saveAvailable: p.actions?.saveAvailable !== false,
      saveAction: {
        available: p.actions?.saveAvailable !== false,
        isSaved: Boolean(p.actions?.saveActive),
        label: Boolean(p.actions?.saveActive) ? 'Saved' : 'Save',
        activeLabel: 'Saved',
      },
      seenAvailable: true,
      seenAction: {
        available: true,
        isSeen: Boolean(p.actions?.seenActive),
        label: 'Seen',
        activeLabel: 'Seen',
      },
      seenActive: Boolean(p.actions?.seenActive),
      notInterestedAvailable: true,
      notInterestedAction: {
        available: true,
        isNotInterested: Boolean(p.actions?.notInterestedActive),
        label: 'Not interested',
        activeLabel: 'Not interested',
      },
      notInterestedActive: Boolean(p.actions?.notInterestedActive),
    },
    whySeeIt: {
      totalCount: p.whySeeIt?.totalCount ?? p.whySeeIt?.signals?.length ?? 0,
      signals: [...(p.whySeeIt?.signals ?? [])],
      empty: (p.whySeeIt?.signals?.length ?? 0) === 0,
    },
    synopsis: {
      available: Boolean(p.synopsis?.preview || p.synopsis?.full),
      preview: p.synopsis?.preview ?? null,
      full: p.synopsis?.full ?? p.synopsis?.preview ?? null,
      needsMore: Boolean(
        p.synopsis?.full && p.synopsis.full !== p.synopsis.preview,
      ),
      tags: [...(p.synopsis?.tags ?? [])],
    },
    bestWay: p.bestWay
      ? {
          ...p.bestWay,
          opportunityKey: p.bestWay.opportunityKey ?? null,
          filmKey: p.bestWay.filmKey ?? 'mockup-2001',
          facts: [...(p.bestWay.facts ?? [])],
          ticketUrl: p.bestWay.ticketUrl ?? null,
        }
      : null,
    bestWayEmpty: !p.bestWay,
    today: {
      rows: (p.todaysShowtimes?.rows ?? []).map((row) => ({
        id: row.id,
        theaterId: row.id,
        theaterName: row.theaterName,
        venueMark: row.venueMark,
        accent: row.accent,
        chips: [...(row.chips ?? [])],
        times: (row.times ?? []).map((time) =>
          typeof time === 'string'
            ? { timeDisplay: time, opportunityKey: null, ticketUrl: null }
            : time,
        ),
      })),
      empty: (p.todaysShowtimes?.rows?.length ?? 0) === 0,
      timezoneNote: p.todaysShowtimes?.timezoneNote ?? 'All times in PT',
    },
    availabilityNote: null,
    availabilityHint: null,
  };
}

function composedToView(p, mode) {
  if (!p?.resolved) {
    return emptyView({
      mode: mode === 'visual-fixture' ? 'visual-fixture' : 'production',
      source: p?.source ?? 'home-data',
      filmKey: p?.filmKey ?? null,
    });
  }

  const hero = p.hero ?? {};
  const signals = Array.isArray(p.signals) ? p.signals : [];
  const todayRows = Array.isArray(p.today?.rows) ? p.today.rows : [];

  return {
    mode: mode === 'visual-fixture' ? 'visual-fixture' : 'production',
    source: p.source,
    resolved: true,
    filmKey: p.filmKey,
    displayTitle: p.displayTitle ?? hero.title ?? null,
    hero: {
      title: hero.title ?? p.displayTitle ?? null,
      posterUrl: hero.posterUrl ?? null,
      backdropUrl: hero.backdropUrl ?? null,
      year: hero.year ?? null,
      runtimeLabel: hero.runtimeLabel ?? null,
      rating: hero.rating ?? null,
      genres: hero.genres ?? null,
      director: hero.director ?? null,
      metaLine: hero.metaLine ?? null,
      badges: [...(hero.badges ?? [])],
    },
    actions: {
      // Production Save/Seen availability is decided by the container via real filmRef.
      // Visual fixtures keep the control interactive without production persistence.
      saveAvailable: mode === 'visual-fixture' ? true : Boolean(p.filmKey),
      saveAction: {
        available: mode === 'visual-fixture' ? true : Boolean(p.filmKey),
        isSaved: false,
        label: 'Save',
        activeLabel: 'Saved',
      },
      seenAvailable: mode === 'visual-fixture' ? true : Boolean(p.filmKey),
      seenAction: {
        available: mode === 'visual-fixture' ? true : Boolean(p.filmKey),
        isSeen: false,
        label: 'Seen',
        activeLabel: 'Seen',
      },
      seenActive: false,
      // Production NI availability is decided by the container via real filmRef.
      notInterestedAvailable: mode === 'visual-fixture' ? true : Boolean(p.filmKey),
      notInterestedAction: {
        available: mode === 'visual-fixture' ? true : Boolean(p.filmKey),
        isNotInterested: false,
        label: 'Not interested',
        activeLabel: 'Not interested',
      },
      notInterestedActive: false,
    },
    whySeeIt: {
      totalCount: p.signalTotal ?? signals.length,
      signals,
      empty: signals.length === 0,
    },
    synopsis: {
      available: Boolean(p.synopsis?.available),
      preview: p.synopsis?.preview ?? null,
      full: p.synopsis?.full ?? null,
      needsMore: Boolean(p.synopsis?.needsMore),
      tags: [...(p.synopsis?.tags ?? [])],
    },
    bestWay: p.bestWay
      ? {
          ...p.bestWay,
          facts: [...(p.bestWay.facts ?? [])],
        }
      : null,
    bestWayEmpty: Boolean(p.bestWayEmpty) || !p.bestWay,
    today: {
      rows: todayRows.map((row) => ({
        id: row.theaterId ?? row.id,
        theaterId: row.theaterId ?? row.id,
        theaterName: row.theaterName,
        venueMark: row.venueMark,
        accent: row.accent,
        chips: (row.formatChips ?? row.chips ?? []).map((chip) =>
          typeof chip === 'string' ? { label: chip } : chip,
        ),
        times: (row.times ?? []).map((time) =>
          typeof time === 'string'
            ? {
                timeDisplay: time,
                opportunityKey: null,
                ticketUrl: null,
                detailLabel: null,
              }
            : {
                timeDisplay: time.timeDisplay,
                opportunityKey: time.opportunityKey ?? null,
                ticketUrl: time.ticketUrl ?? null,
                emphasized: Boolean(time.emphasized),
                detailLabel: time.detailLabel ?? null,
              },
        ),
      })),
      empty: Boolean(p.today?.empty) || todayRows.length === 0,
      timezoneNote: 'All times in PT',
    },
    availabilityNote:
      typeof p.availabilityNote === 'string' ? p.availabilityNote : null,
    availabilityHint:
      typeof p.availabilityHint === 'string' ? p.availabilityHint : null,
  };
}
