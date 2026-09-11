# Indie theater collection ingestion

**Status:** Prototype / data foundation  
**Product type:** Collection  
**Sources:** SIFF, The Beacon, NWFF  
**Not in this slice:** Explore Collections UI, Grand Illusion, TMDB/genre/user collections

Collection membership comes from explicit theater/source evidence:

```
collection page → member film links → source listing identity → safe title candidate → canonical film
```

Title prefixes are never used to *guess* membership. Known prefixes are stripped only after membership is already proven.

## Source-ingestion audit

| Source | Scraper entry | Source film URL | Provider film ID | Raw title | Series/programs scraped before? | Join key |
|--------|---------------|-----------------|------------------|-----------|----------------------------------|----------|
| SIFF | `reel_seattle/adapters/siff.py` (`fetch_siff_showtimes` from `/cinema/in-theaters`) | Yes — `RawShowtime.source_film_url` | Yes — program path (`programs-and-events/...` or `cinema/in-theaters/...`) | Yes — `title_raw` | No. Nested `/programs-and-events/{series}/{film}` pages were scraped as **film** pages only | `source` + `source_film_id` (path) or `source_film_url` |
| Beacon | `reel_seattle/adapters/beacon.py` (calendar → `/calendar/movie/{slug}`) | Yes | Yes — movie slug | Yes | No `/series/` or `/programs/` | `source` + slug / movie URL |
| NWFF | `reel_seattle/adapters/nwff.py` + prototype | Yes — film `/films/{slug}/` | Yes — film slug | Yes | No `/series/` | `source` + slug / film URL |
| Central Cinema | Existing adapter | Yes | Yes | Yes | No explicit series/program index used here | Out of scope unless a curated series page appears |

History CSV keeps `source_film_id` / `source_title` but **not** `source_film_url`. Daily logs remain the URL-rich join source.

History/observation: `firstObservedAt` / `lastObservedAt` on collections and memberships. A failed source scrape preserves prior valid rows. A trusted complete scrape may drop collections that are no longer linked.

## Discovery methods

**SIFF.** Programs & Events index → curated collection pages (Film Series / Cinema Programs). Membership = explicit `<a href>` film links on the collection page. Nested film URL under the collection slug is corroboration only. Generic pages (`$7 Tuesdays`, open captions, camps, festival, SIFF Cinema calendar) are omitted.

**Beacon.** `/series` and `/programs` indexes → collection pages. Membership = explicit `/calendar/movie/` links (“Films in this Series/Program”). `sourceCollectionType` is `series` or `program`. Product type remains Collection.

**NWFF.** `/series/` index → series pages with `/films/` member links, plus film-page “Series” links as corroboration. Series pages with zero film links (e.g. standup) are omitted.

## Model

- `Collection` — provider-namespaced `collectionId` (`siff:{slug}`, `beacon:series:{slug}`, `beacon:program:{slug}`, `nwff:{slug}`), source taxonomy retained.
- `CollectionMembership` — many-to-many; joins by source URL / source film id, not title equality. `canonicalFilmId` nullable.
- `identityTitleCandidate` — known collection prefix stripped, then existing format cleanup (`(35mm)` stays a screening format).
- Screenings get `attributes.collection_ids` only when the **source listing** matches. A later independent listing of the same canonical film does not inherit the collection.

## Artifact & pipeline

- Artifact: `public/data/collections_current.json` (`schema/collections_current/v1.0.0.json`)
- Builder: `scripts/build_collections_current.py`
- Daily hook: after `showtimes_current` emit in `daily_processor.py`. Failure preserves the prior artifact and does not block showtimes.
- Matcher: inventory copies `identityTitleCandidate`; matcher prefers it. Conflicting confident TMDB IDs from candidate vs raw title go to review.

## Explore → Collections (next PR, not this branch)

**Index card:** title, source theater, source type label (Series/Program), image, date range, upcoming screening count, member count.

**Detail:** description, source URL, member films (canonical when known, else source title + URL), current/upcoming showtimes for *member listings only*.

**Default sort:** upcoming screening count desc, then end date, then title. Past/inactive collections should be hidden on first ship; include a later “Past series” filter.

**Zero upcoming screenings:** still list as a valid collection with an “No upcoming screenings” state if `lastObservedAt` is recent; do not hide unresolved members.

## Current-data audit (2026-09-11 live run)

Totals after chrome-safe NWFF extraction and SIFF format-index omission (live 2026-09-11):

| Source | Collections | Memberships | Title candidates | Confirmed TMDB memberships |
|--------|-------------|----------------|------------------|----------------------------|
| SIFF | 7 (2 series + 5 programs) | 40 | 31 | 2 |
| Beacon | 2 series + 40 programs | 267 | 9 | 0 |
| NWFF | 47 series | 393 | 216 | 1 |
| All | 96 | 700 | 256 | 3 distinct canonical films |

Current-window showtime join (source film id, not title): SIFF 5/40 (12.5%), Beacon 9/267 (3.4%), NWFF 3/393 (0.8%). Most memberships are historical/archive programs and remain representable without upcoming screenings.

Exact examples:

- SIFF `siff:nouvelles-femmes` — *Nouvelles Femmes: Breathless* → candidate `Breathless`; *Nouvelles Femmes: Jules and Jim (35mm)* → candidate `Jules and Jim` (35mm retained on raw title).
- Beacon `beacon:series:time-as-a-symptom` — *Rebels of the Neon God* via explicit series-page link. `sourceCollectionType=series`.
- NWFF `nwff:sfcs-at-10` — series page members + film-page series label (nav series menus ignored). Candidate `First Cow` from `SFCS at 10: First Cow`.

Omitted for no explicit film links: Beacon Double Features; NWFF Disabled List / coffee / standup-like pages; SIFF grant page and Exhibition on Screen.

## Deliberately omitted

- Explore UI
- Grand Illusion
- Central Cinema collections (no explicit series index used)
- Generic format/calendar/search pages
- Fuzzy thematic grouping, TMDB collections, user collections
- Generic “strip before colon” title parsing
- Destructive canonical-film renames
