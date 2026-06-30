# Frontend smoke check

Quick checks after frontend PRs. Automated checks need no browser; manual checks confirm UI behavior.

**Unified planner:** technical design is in [unified-planner-design.md](./unified-planner-design.md). `/planner` is the unified same-theater planner (PR 62–64).

Optional automated Planner browser QA (Playwright, no repo dependency):

```bash
npm run dev
npx --yes -p playwright playwright install chromium
npx --yes -p playwright node scripts/qa_planner_browser.mjs http://localhost:5173
```

Parity audit (PR 66A — discovers scenarios from current data, data + browser checks):

```bash
npx --yes -p playwright node scripts/qa_planner_parity.mjs http://localhost:5173
```

See [planner-parity-qa.md](./planner-parity-qa.md) for audit results and PR 66 recommendation.

Checks filters, shared URL restore, timeline cards, pagination, max mode, legacy routes, discovered parity scenarios, and forbidden data fetches.

## Automated (no browser)

Before manual QA, check whether local `public/` data is fresh enough to trust:

```bash
npm run check:data-freshness
```

Stale local AMC artifacts are common after pulling code without updated data. That can make Planner max-mode AMC results look empty even when GitHub/deployed data is healthy. Pull the latest `public/data` artifacts or run `python daily_processor.py` before interpreting AMC manual QA results.

After building:

```bash
npm run test:frontend
npm run build
npm run check:dist
npm run smoke:frontend
python -m pytest
```

`smoke:frontend` verifies `dist/` artifacts, JSON parseability, forbidden history paths, and that the bundled JS references current JSON data (not history CSV or PapaParse).

## Manual browser QA

Run `npm run check:data-freshness` first when local AMC results look suspicious.

Start the dev server:

```bash
npm run dev
```

Use `npx vite --port 5199 --strictPort` if you need a fixed port.

Optional automated Recently Added browser QA (Playwright, no repo dependency):

```bash
npm run build
npx vite preview --port 5198 --strictPort
npx --yes -p playwright playwright install chromium
npx --yes -p playwright node scripts/qa_recently_added_browser.mjs http://localhost:5198
```

Checks preview card limit, total count badge, view-all link, full `/recently-added` page, responsive overflow at 375/768/1200px, core Showtimes interactions, route loads, and forbidden data fetches.

### Showtimes (`/`)

- [ ] **Reel Seattle** wordmark and tagline appear in the app shell header
- [ ] Nav shows **Showtimes** and **Planner** only; active tab uses accent styling
- [ ] Page loads without console errors
- [ ] Loading, error, and empty states use structured panels (not plain text)
- [ ] Movie posters use rounded-rectangle treatment; cards have clear surface/border
- [ ] Pipeline Status panel appears
- [ ] **Recently added** preview appears when `newly_added_current.json` has matching entries (hidden when empty or unavailable)
- [ ] Preview shows up to **4** films with total count badge (e.g. `23 recently added`) and **View all … recently added** link when more films exist
- [ ] Recently added cards show film title, added date, showtime/theater counts, and poster or placeholder
- [ ] **`/recently-added`** shows the full list with loading/error/empty panels when appropriate; linked from Showtimes preview, **not** in main nav
- [ ] Film search input appears between status and filters
- [ ] Search filters movie cards (partial, case-insensitive); clearing search restores results
- [ ] Date and theater filters work; URL query params update
- [ ] **Copy current view** copies the current URL with search/date/theater/sort params; shows temporary “Link copied” feedback
- [ ] Refreshing a filtered URL restores search/date/theater/sort
- [ ] Sort modes work (showtimes count and runtime, all four modes)
- [ ] Movie cards expand/collapse; posters and premium format badges display where available
- [ ] Collapsed film cards show compact metadata (runtime, theater/showtime counts, date span, format tags when available)
- [ ] Expanded film cards show a details panel, visible showtime summary line, and grouped date/theater showtimes
- [ ] Movies without poster URLs show styled placeholders with “No poster” (no empty `<img src="">` console warnings)
- [ ] No-results state when filters/search match nothing

### Double Feature (`/double-feature`) — redirect-only compatibility route (PR 66 / retired PR 67A–67B)

The legacy Double Feature UI, engine, and utility modules have been removed. `/double-feature` remains as a redirect-only compatibility route into Planner.

- [ ] Visiting `/double-feature` redirects to `/planner?count=2` with mapped query params (`date`, `theaters`, `start`, `movies`, `exclude`)
- [ ] `/double-feature?movies=Sinners` redirects with `movies`, `advanced=1`, and `count=2`
- [ ] `/double-feature?exclude=Jackass` redirects with `exclude`, `advanced=1`, and `count=2`
- [ ] `/double-feature?filter=whitelist` redirects to `/planner?count=2` only (mode-only filter is not migrated)
- [ ] `/double-feature?date=06/28/2026&end=10:00PM` redirects without `finish` or `end` on Planner URL (legacy `end` is not migrated)
- [ ] Legacy `end` param is **not** migrated to Planner `finish` (semantic mismatch)
- [ ] Main nav shows **Showtimes** and **Planner** only

### Planner (`/planner`)

Planner UI uses neutral `.planner-*` CSS class names (PR 68). Browser QA scripts target these selectors.

- [ ] Page loads without console errors
- [ ] Nav shows **Showtimes** and **Planner** only (legacy routes are direct-access)
- [ ] Basic filters work: date, theaters, film count, start after, finish by
- [ ] **Constraint preview** appears when film count is set and at least one of: required films, first/last film, time constraints, or gap constraints
- [ ] Preview shows mock timeline with film slots, time boundaries, and gap indicators
- [ ] Preview displays disclaimer text: "This is a hypothetical preview... click Find plans for real showtimes"
- [ ] Preview shows anchored/required films with actual titles and posters when selected
- [ ] Preview shows placeholder slots ("?") for unknown films
- [ ] Preview warning appears for impossible constraints (e.g., start after >= finish by, tight time window)
- [ ] Preview legend shows film types and gap constraints when applicable
- [ ] Preview animates smoothly when appearing/disappearing as filters change
- [ ] Preview is responsive on 375px, 768px, and desktop widths
- [ ] Advanced filters expand/collapse and affect results (gaps, required/include, preferred, exclude, first/last, sort)
- [ ] **Preferred films** accept comma-separated titles; plans must include at least one preferred movie when set
- [ ] Shared `/planner?count=max&preferred=Movie+A&preferred=Movie+B` restores preferred films and opens advanced panel
- [ ] **Copy share link** copies the current URL; shows temporary feedback
- [ ] Each result card has **Share lineup**; copies or natively shares a readable schedule summary plus the current filter URL (not a lineup-specific deep link)
- [ ] Share lineup status text clears after a few seconds and does not clash with filter copy status
- [ ] Shared `/planner?...` URL restores controls and shows a prompt (no auto-search)
- [ ] Search returns polished result cards with timeline, gap rows, posters/placeholders, and format tags when available
- [ ] **Show more results** appears when more than 20 plans match
- [ ] Truncated/capped results show an explanatory notice when applicable
- [ ] Empty state suggests relaxing filters
- [ ] Page intro and filter panels are readable on 375px, 768px, and desktop widths
- [ ] Focus rings visible when tabbing through nav, filters, and buttons
- [ ] Invalid query params do not break the page

### Planner parity audit (PR 66A)

- [ ] Run `node scripts/qa_planner_parity.mjs http://localhost:5173` — passes with discovered scenarios
- [ ] Review [planner-parity-qa.md](./planner-parity-qa.md) for current scenario table and gap list

### Marathon redirect (`/marathon`) — retired into Planner

- [ ] `/marathon` redirects to `/planner?count=max` with Marathon migration notice
- [ ] `/marathon/` and `/marathon/index.html` reach Planner via static redirect stub
- [ ] Saved Marathon localStorage filters (`marathon-planner-filters`) map to `preferred` / `exclude` when present
- [ ] No marathon iframe or `marathon_showtimes.json` in the app or dist

### Sharing / metadata

- [ ] `index.html` includes description and Open Graph / Twitter card tags
- [ ] `public/og-image.svg` is referenced for `og:image` and `twitter:image`
- [ ] Shared link preview text describes Seattle movie planning (platform-dependent)

### Visual polish (Phase E)

- [ ] Date/theater dropdowns and sort control use tokenized surfaces, accent hover/focus, and 44px tap targets on mobile
- [ ] Filter row stacks full-width on 375px without horizontal overflow
- [ ] Planner result cards show per-film time range under titles; timeline uses accent film segments

### Network tab (any route)

- [ ] `showtimes_current.json` is requested (one fetch per session in production)
- [ ] `pipeline_report.json` is requested (Showtimes; one fetch per session in production)
- [ ] `newly_added_current.json` is requested on `/` or `/recently-added` (one fetch per session in production; cached across routes)
- [ ] `showtimes_history.csv`, `movies_announcements.csv`, and `newly_announced.csv` are **not** requested

## Announcement CSV deploy audit (PR 58)

After PR 57, the React app uses `newly_added_current.json` only. A post-build audit of `dist/data/` found:

| File | In `dist/data/`? | Browser fetch? | Runtime code reference? | Smoke/check required? |
| --- | --- | --- | --- | --- |
| `movies_announcements.csv` | Yes (~512 KB) | No | No | No |
| `newly_announced.csv` | Yes (~4.5 KB) | No | No | No |
| `newly_added_current.json` | Yes (~5.5 KB) | Yes (Showtimes preview, `/recently-added`) | Yes | Yes (`check:dist`, `smoke:frontend`) |

**Size impact:** excluding both CSVs from deploy would save ~517 KB (~83% of current `dist/data/` bulk). Files should remain in `public/data/` for the Python pipeline and daily commits.

**Recommended PR 59:** add `data/movies_announcements.csv` and `data/newly_announced.csv` to `PUBLIC_SKIP_FILES` in `vite.config.js` (same pattern as `showtimes_history.csv`). No change to pipeline generation or repo copies.

## When to run

- Before merging frontend PRs
- After changing adapters, routes, deploy artifacts, or data loading
- CI runs `smoke:frontend` automatically after `npm run build`
