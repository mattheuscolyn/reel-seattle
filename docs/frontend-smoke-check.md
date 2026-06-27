# Frontend smoke check

Quick checks after frontend PRs. Automated checks need no browser; manual checks confirm UI behavior.

**Unified planner:** technical design is in [unified-planner-design.md](./unified-planner-design.md). Add a `/planner` section here when PR 62 lands.

## Automated (no browser)

Before manual QA, check whether local `public/` data is fresh enough to trust:

```bash
npm run check:data-freshness
```

Stale local AMC artifacts are common after pulling code without updated data. That can make Marathon look empty even when GitHub/deployed data is healthy. Pull the latest `public/data` artifacts or run `python daily_processor.py` before interpreting Marathon/AMC manual QA results.

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

Run `npm run check:data-freshness` first when local AMC/Marathon results look suspicious.

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

Checks section visibility, card/count parity, responsive overflow at 375/768/1200px, core Showtimes interactions, route loads, and forbidden data fetches.

### Showtimes (`/`)

- [ ] Page loads without console errors
- [ ] Current-window summary appears under the title
- [ ] Pipeline Status panel appears
- [ ] **Recently added** section appears when `newly_added_current.json` has matching entries (hidden when empty or unavailable)
- [ ] Recently added cards show film title, added date, showtime/theater counts, and poster or placeholder
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

### Double Feature (`/double-feature`)

- [ ] Page loads with a clean URL when using defaults (no shared-link prompt)
- [ ] Date, theater, time, and movie filter controls update the URL
- [ ] **Copy share link** copies the current URL with planner params; shows temporary “Link copied” feedback
- [ ] Pasting and opening a copied link restores controls and shows the shared-link prompt (no auto-search)
- [ ] Refreshing or opening a shared `/double-feature?...` URL restores controls
- [ ] Shared URL shows a prompt with a **Run search** action (results are not auto-run)
- [ ] Prompt disappears after **Run search** or **Find Double Features** is clicked
- [ ] Search returns results or shows the empty state
- [ ] Result cards show theater, both films, start/end times, runtimes, gap minutes, total schedule time, posters/placeholders, and tight vs comfortable gap labels
- [ ] Result cards are readable at 375px, 768px, and 1200px widths (no horizontal overflow; mobile stack looks correct)
- [ ] Invalid query params do not break the page

### Marathon (`/marathon`)

- [ ] React shell loads; marathon iframe appears
- [ ] Status banner appears when AMC data is stale, empty, or unavailable (hidden when AMC is current with showtimes)
- [ ] Banner copy is understandable and does not block the iframe
- [ ] Standalone UI loads at `/marathon/index.html`
- [ ] Empty marathon state is understandable when no AMC showtimes are present
- [ ] No console errors

### Network tab (any route)

- [ ] `showtimes_current.json` is requested (one fetch per session in production)
- [ ] `pipeline_report.json` is requested (Showtimes and Marathon pages; one fetch per session in production)
- [ ] `newly_added_current.json` is requested on `/` (one fetch per session in production)
- [ ] `showtimes_history.csv`, `movies_announcements.csv`, and `newly_announced.csv` are **not** requested

## Announcement CSV deploy audit (PR 58)

After PR 57, the React app uses `newly_added_current.json` only. A post-build audit of `dist/data/` found:

| File | In `dist/data/`? | Browser fetch? | Runtime code reference? | Smoke/check required? |
| --- | --- | --- | --- | --- |
| `movies_announcements.csv` | Yes (~512 KB) | No | No | No |
| `newly_announced.csv` | Yes (~4.5 KB) | No | No | No |
| `newly_added_current.json` | Yes (~5.5 KB) | Yes (Showtimes) | Yes | Yes (`check:dist`, `smoke:frontend`) |

**Size impact:** excluding both CSVs from deploy would save ~517 KB (~83% of current `dist/data/` bulk). Files should remain in `public/data/` for the Python pipeline and daily commits.

**Recommended PR 59:** add `data/movies_announcements.csv` and `data/newly_announced.csv` to `PUBLIC_SKIP_FILES` in `vite.config.js` (same pattern as `showtimes_history.csv`). No change to pipeline generation or repo copies.

## When to run

- Before merging frontend PRs
- After changing adapters, routes, deploy artifacts, or data loading
- CI runs `smoke:frontend` automatically after `npm run build`
