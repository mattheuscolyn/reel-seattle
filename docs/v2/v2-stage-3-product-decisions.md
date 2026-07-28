# Reel Seattle v2 — Stage 3 Pre-Roadmap Product Decision Packet

**Status:** **Approved** — product decisions D01–D17 recorded 2026-07-24  
**Date:** 2026-07-24  
**Authority:** Authoritative product decisions for Stage 3 / Stage 4 integration  
**Source:** [v2-data-and-backend-needs-audit.md](./v2-data-and-backend-needs-audit.md) §9  
**Stage 3 roadmap:** [v2-front-back-integration-roadmap.md](./v2-front-back-integration-roadmap.md)  
**Related:** [data-foundation-roadmap.md](../data-foundation-roadmap.md) · [specs/](./specs/) · [17-first-implementation-slice.md](./17-first-implementation-slice.md)

**How to use:** Decisions below are **approved**. Card “Recommended” lines are historical where they conflict with §Approved package. Do not reopen without an explicit product change.

**Already settled — do not reopen**

| Settled decision | Evidence |
|------------------|----------|
| Primary nav: Home · Explore · Planner · Profile | D-26 / I-04C |
| Theaters / Movies / Saved are not permanent tabs | Global nav + Explore specs |
| Saved film ≠ My Schedule entry | About My Schedule mockup; Stage 2 prompt |
| Reel Seattle does not sell or manage tickets | Film Detail / About specs |
| Do not fabricate enrichment, rankings, or person matches | Honesty rules in Home/Explore/FD specs |
| Opening This Week ≠ `newly_added_current` | Data-foundation + Home specs |
| Leaving Soon stays gated until product + data gate | Roadmap Deferred; Home honesty |
| v2 shell is local-only prototype; Pages ships static JSON today | AGENTS.md / operating model |

---

## Approved package (authoritative)

D01–D17 are **approved** and drive [v2-front-back-integration-roadmap.md](./v2-front-back-integration-roadmap.md).

| ID | Approved decision |
|----|-------------------|
| **D01** | Phased local-first portable browser storage (Save, Seen, NI, favorites, planner drafts/plans, Schedule, settings, profile/membership prefs, recent searches); versioned migratable contracts; export/import later; **defer accounts/cross-device sync**; clean future migration boundary; no auth/DB on initial critical path |
| **D02** | Hybrid opening: earliest known scheduled Seattle showtime from **history** + curated overrides; Opening = **calendar week**; Explore This Week = rolling 7 days; distinct wording; **not** `newly_added` |
| **D03** | Leaving absent until eval bar; false positives worse than misses; AMC-only OK after validation; confidence-aware/softened copy; must not block earlier work; eval + Pages gates required |
| **D04** | Never fixture-as-production fallback; hide unsupported values but **preserve UI slots/components**; partial-by-source OK; research AMC catalog republish; external enrichment = separate research/terms track; **do not select provider here**; roadmap valid if external delayed |
| **D05** | Schedule-derived/source-safe Why See It first; Letterboxd/cultural ranks deferred; must not block; preserve evidence-tile + visual fixture while types suppressed |
| **D06** | Repo-curated theater data; first-release: address, city, state, ZIP, neighborhood, coords, website, directions, short description, screen count, capabilities, stable amenities, licensed imagery; **defer pricing & hours** until ownership/cadence/stale behavior defined; automation may verify but not silently overwrite |
| **D07** | Travel phased: (1) same-theater, no walk display (2) curated walk matrix (3) routing only if later justified; no miles/times until validated; preserve travel UI slots; coords before calculations; **no paid routing assumed in Stage 3** |
| **D08** | First Planner = same-theater; suppress unsupported walk/multi facts; preserve result-card design; multi-theater after validated travel; extensible plan model; multi must not block same-theater |
| **D09** | Initial: ICS + one-time Add to Calendar; later optional one-way sync; **no bidirectional**; update About copy so it does not claim sync early; preserve Calendar Sync settings UI disabled/unavailable until one-way exists; **no OAuth/tokens on initial critical path** |
| **D10** | User-entered A-List preference; eligibility only when confidently backed; hide renew + weekly-use until supported; no live AMC integration; Prefer AMC / A-List weighting as prefs OK; preserve membership-card design |
| **D11** | Hybrid: small curated collections + rule-generated surfaces; curated thematic tags only; no auto-invented tags; ownership required; preserve collection/tag UI while unavailable |
| **D12** | Defer person search; change placeholder/copy; director search after enrichment; cast later; preserve search entity model for people without redesign |
| **D13** | First release = current registry venues; replace fixture-only venue names in conversion; new ingestion = separate PO-prioritized DF track; do not silently choose next venue |
| **D14** | Hide/disable genre coloring until reliable; default opportunity-type; theater coloring when deterministic; preserve genre option + fixture |
| **D15** | Seen films may surface for rare formats / limited engagements / special events / credible last-chance; casual recs deprioritize seen; user setting later optional |
| **D16** | Defer budget until reliable pricing; no partial AMC-as-universal; preserve budget control contract; hide/disable until gate; not a nonfunctional interactive control |
| **D17** | Preshow **15** min; transfer **10** min; same-building/venue **5** min; versioned tunable constants; planner validity + displayed end times share policy; theater-specific/user-adjustable later |

**Fast response form:** Closed — answers are the table above.

---

## 1. Executive summary

Stage 3 cannot sequence workstreams until a few policy choices are fixed. Persistence mode, Opening definition, planner/travel scope, calendar promise vs About copy, enrichment republish rights, and theater-metadata ownership change **what systems exist**, not just polish.

| Class | Decisions | Effect |
|-------|-----------|--------|
| **Block architecture** | D01 persistence, D04 enrichment policy, D06 theater ownership, D07–D08 travel+planner, D09 calendar | Backend vs static/local; schema shape; whether OAuth/routing appear at all |
| **Block one workstream** | D02 Opening, D03 Leaving, D10 memberships, D11 editorial, D12 person search, D13 venues, D14–D17 | Can roadmap other streams first |
| **Safe recommended defaults** | D12 person-search copy, D14 genre colors off, D16 defer budget, D17 fixed buffers, D05 defer Letterboxd | Low regret; reversible |
| **Defer without blocking early Stage 4** | D05 cultural ranks, bidirectional calendar, live A-List, rich push/email, thematic tags | Mockup can omit or scaffold honestly |

**Single-user / early-product bias for recommendations:** prefer browser-local or local-first, GitHub Pages–compatible generation, curated repo JSON, no auth or paid APIs until a clear need appears. Preserve approved design by **honest omission** or **scaffold**, not fake data — Stage 5 only after options are exhausted.

---

## 2. Decision priority groups

### Group A — Must decide before Stage 3 roadmap

These change workstream boundaries, storage model, or public-data contracts.

| ID | Decision | Why Group A |
|----|----------|-------------|
| **D01** | Persistence mode | Determines whether any authenticated backend exists; shapes Save/plans/Profile |
| **D02** | Opening This Week definition | New derived artifact vs provisional newly_added; Home + Opening page contract |
| **D04** | Film enrichment / republish | Public artifact design; legal gate; Film Detail / Search real-data path |
| **D06** | Theater metadata ownership | Schema + curation process for Theater pages |
| **D07** | Travel MVP | Planner result model; Best Way distance |
| **D08** | Planner same- vs multi-theater | Engine rewrite vs reuse legacy; mockup parity |
| **D09** | Calendar scope | About mockup claims sync; ICS-only avoids OAuth |

### Group B — Must decide before the affected workstream

| ID | Decision | Blocks when |
|----|----------|-------------|
| **D03** | Leaving Soon quality bar | Before shipping Leaving shelf / alerts |
| **D10** | Memberships / A-List | Before Profile membership card + A-List badges as facts |
| **D11** | Editorial operations | Before Collections / Coming Soon / thematic tags |
| **D12** | Person search | Before Explore placeholder / Search person claims |
| **D13** | Venue expansion | Before Theater list coverage promises |
| **D14** | Genre color coding | Before Schedule color-by-genre mode |
| **D15** | Seen-film exceptions | Before Top Opportunity / planner exclusion rules |
| **D16** | Planner budget | Before Build a Plan budget control as live |
| **D17** | Runtime / transfer buffers | Before multi-film plan validity tuning |

### Group C — Can defer until late Stage 4 or Stage 5

Deferral is safe because foundational schedule, local plans, and honest UI can ship without them.

| Topic | Why deferral is safe |
|-------|----------------------|
| **D05** Letterboxd / cultural ranks | Why See It already has schedule-derived signals; omit rank cards until licensed |
| Bidirectional calendar sync | About mockup already says external edits do not sync back; one-way or ICS is enough |
| Live A-List weekly counters | Manual preference or eligibility label can stand in |
| Advanced push/email notifications | Local reminders / in-app freshness first |
| Thematic editorial tags (“Mind-bending”) | Synopsis alone is enough; tags are optional flavor |
| Paid routing APIs | Same-theater or curated matrix can precede |

Hard ≠ Group C. Live A-List and Letterboxd are hard **and** deferrable.

---

## 3. Decision cards

### D01 — Persistence mode

- **Decision:** How Save, Seen, Not interested, favorites, plans, and Profile persist  
- **Why it matters:** Largest architecture fork (static/local vs auth backend)  
- **Gaps:** G10, G11, G11b, G12, G14  
- **Screens:** Profile, Explore activity, Film Detail actions, Planner landing, My Schedule  

| Option | Advantages | Disadvantages |
|--------|------------|---------------|
| A. Browser-local only | Fits Pages; no auth; matches current v2 stores | No cross-device; clear-data risk |
| B. Local-first + export/import | Backup without accounts | Manual; not “sync” |
| C. Authenticated accounts + sync | Cross-device; Profile story complete | Auth, DB, privacy, ops |
| D. Phased: A→B now, C later | Ship value early; upgrade path | Must design exportable schemas |

- **Architecture:** A/B → client stores + static JSON; C → backend  
- **Stage 3:** A/B keep roadmap on data emit + UI mapping; C adds auth workstream day one  
- **Can proceed:** Public emit, enrichment design, theater curation, Opening classifier design  
- **Blocked:** Cross-device Profile; server notifications; shared plans in cloud  
- **Recommended:** **D (phased: local-first + export/import; accounts later)**  
- **Reason:** Single-user early product; existing localStorage pattern; Pages-viable; schemas can stay portable  
- **Confidence:** High  
- **Reversible?** Yes if schemas stay portable · **Cost if reverse late:** Medium (migrate local → account)  
- **My answer:** ☐ A ☐ B ☐ C ☐ D ☐ Other: _______________

---

### D02 — Opening This Week definition

- **Decision:** What makes a film “opening,” and what “week” means  
- **Why it matters:** Home shelf + Opening page counts/sorts; must not equal newly_added  
- **Gaps:** G03  
- **Screens:** Home, Opening This Week page, signals  

| Option | Notes |
|--------|-------|
| A. First observed Seattle showtime in history | Automatable; can lag true “opening” |
| B. First scheduled showtime in current window | Simple; misses pre-window openings |
| C. Distributor / nationwide release date | Needs enrichment; not Seattle-specific |
| D. Curated opening date | Accurate; editorial cost |
| E. Hybrid: rule + curated overrides | Best quality; more process |
| Week: calendar Mon–Sun vs rolling 7 days | Explore “This Week” is already rolling 7d (product Q logged) — Opening may differ |

- **Architecture:** New derived daily artifact vs continued provisional newly_added  
- **Stage 3:** Needs explicit classifier workstream if not provisional forever  
- **Can proceed:** Emit completeness, Search, Theater curation  
- **Blocked:** Honest Opening This Week as designed  
- **Recommended:** **E hybrid** — default rule = first Seattle showtime date (history-aware), curated overrides; **calendar week** for Opening label; keep Explore “This Week” as rolling 7d with distinct copy  
- **Reason:** Seattle-specific; automatable with escape hatch; avoids conflating announcement with opening  
- **Confidence:** Medium  
- **Reversible?** Rule tunable · **Cost:** Low–medium (recompute artifact)  
- **My answer:** ☐ A ☐ B ☐ C ☐ D ☐ E Week: ☐ calendar ☐ rolling ☐ Other: _______________

---

### D03 — Leaving Soon quality bar

- **Decision:** When (if ever) to ship Leaving Soon to users  
- **Why it matters:** False urgency damages trust; feature is review-only today  
- **Gaps:** G04  
- **Screens:** Home Leaving, Why See It, Planner “Leaves soonest,” alerts  

| Option | Notes |
|--------|-------|
| A. Remain absent until eval passes documented bar | Safest; shelf stays unavailable |
| B. AMC-only with confidence label | Matches current research scope |
| C. AMC-only without confidence | Simpler UI; less honest |
| D. Multi-source when ready | Harder; different booking cadences |

**Policy lean (choose explicitly):** False positives worse than misses? (recommended: **yes**)

- **Architecture:** Pages allowlist + eval gate vs permanent omit  
- **Stage 3:** Can schedule after core emit/enrichment  
- **Can proceed:** Entire early Stage 4 without Leaving  
- **Blocked:** Leaving shelf, leaving sorts, leaving alerts  
- **Recommended:** **A**, then **B** when precision/recall bar you set is met; display confidence or soft wording  
- **Reason:** Roadmap already Deferred; honesty rules forbid overconfident urgency  
- **Confidence:** High  
- **Reversible?** Shipping early is costly · **Cost of reverse after bad ship:** High (trust)  
- **My answer:** ☐ A ☐ B ☐ C ☐ D False positives worse? ☐ Yes ☐ No Bar notes: _______________

---

### D04 — Film enrichment policy

- **Decision:** How year, rating, genres, director, synopsis, backdrop become public  
- **Why it matters:** Unlocks Film Detail / Search / Opening cards without fixtures  
- **Gaps:** G01, G02, G23  
- **Screens:** Film Detail, Search, Home expand, Opening  

| Option | Notes |
|--------|-------|
| A. Hide unsupported fields until data exists | Already v2 honesty pattern |
| B. Selective AMC catalog → public (if rights OK) | Fast for AMC titles; uneven coverage |
| C. External metadata provider later (research required) | Broader coverage; ToS/attribution TBD |
| D. Partial by source acceptable temporarily | Honest “rich for AMC, thin for indie” |
| E. Combination: A + D now; B/C after terms | |

**Do not pick a named external vendor in this packet** — requires web + terms research.

- **Architecture:** New public enrichment JSON vs keep thin showtimes  
- **Stage 3:** Enrichment workstream size depends on B vs C  
- **Can proceed:** Emit tickets/IDs; schedule UI; local plans  
- **Blocked:** Fixture→real Film Detail parity  
- **Recommended:** **E** — keep A always; allow D; pursue B only after terms review; treat C as parallel research track, not a Stage 3 assumption  
- **Reason:** Pages-friendly; avoids fake fields; AMC catalog already exists internally  
- **Confidence:** Medium (rights unknown)  
- **Reversible?** Adding sources later easy · **Removing republished fields hard**  
- **My answer:** ☐ A only ☐ B ☐ C later ☐ D ☐ E ☐ Other: _______________

---

### D05 — Cultural rankings / Letterboxd

- **Decision:** Whether ranking badges are launch-required  
- **Why it matters:** Fixture Why See It shows Letterboxd Top 250  
- **Gaps:** G16  
- **Screens:** Film Detail Why See It / badges  

| Option | Notes |
|--------|-------|
| A. Required at launch | High policy risk |
| B. Optional if licensed later | |
| C. Replace with source-safe signals only | Format rarity, scarcity, exclusivity, newly added |
| D. Defer pending access/licensing | Omit cards |

- **Architecture:** None if C/D; external dependency if A/B  
- **Stage 3:** Do not block roadmap on this  
- **Can proceed:** Everything foundational  
- **Blocked:** Only that badge type  
- **Recommended:** **C + D** — ship schedule-derived evidence; defer Letterboxd  
- **Reason:** Group C; licensing unresolved; alternatives already in composer  
- **Confidence:** High  
- **Reversible?** Easy to add later · **Cost:** Low  
- **My answer:** ☐ A ☐ B ☐ C ☐ D ☐ C+D ☐ Other: _______________

---

### D06 — Theater metadata ownership

- **Decision:** Who owns address, amenities, hours, pricing, imagery; first-release scope  
- **Why it matters:** Theater Detail mockup is mostly curated facts  
- **Gaps:** G08, G28  
- **Screens:** Theaters list/detail, Search theater hits, Directions  

| Option | Notes |
|--------|-------|
| A. Repo-curated JSON only | Fits current registry model |
| B. Automated scraping | Fragile; ToS; still needs review |
| C. Hybrid (curate core; scrape hints) | |
| Include pricing/hours in first dynamic release? | Higher churn |

- **Recommended cadence (if curated):** Address/geo/website semi-annual; hours monthly/holiday; pricing quarterly; stale → hide or “verify on site”  
- **Architecture:** Expand `theaters.json` (or sibling curated file) + validation  
- **Stage 3:** Curation workstream size  
- **Can proceed:** Program/showtimes on theaters without full visit meta  
- **Blocked:** Full Theater Detail mockup parity  
- **Recommended:** **A** for v2; **pricing/hours optional later** (first release: address, geo, website, short description, screens/capabilities, imagery if rights clear; amenities light)  
- **Reason:** Low automation need at 13–15 theaters; hours/pricing go stale  
- **Confidence:** High  
- **Reversible?** Can add scrape assists later · **Cost:** Low  
- **My answer:** ☐ A ☐ B ☐ C First release includes pricing/hours? ☐ Yes ☐ No ☐ Other: _______________

---

### D07 — Travel MVP

- **Decision:** How distance/walk appears in Planner and Best Way  
- **Why it matters:** Mockup shows miles; no coords today  
- **Gaps:** G09  
- **Screens:** Build a Plan results, Best Way  

| Option | Notes |
|--------|-------|
| A. Same-theater only (no miles) | Matches legacy engine |
| B. Straight-line from curated coords | Cheap; not walk time |
| C. Curated theater-to-theater walk matrix | Accurate enough; finite N² |
| D. Routing API | Cost/ToS/privacy TBD |
| E. Phased: A → B/C → D | |

- **Architecture:** Client matrix JSON vs API proxy  
- **Stage 3:** Ties to D08  
- **Can proceed:** Same-theater planner immediately  
- **Blocked:** Walk miles UI as real data  
- **Recommended:** **E** — same-theater first; add **C** when coords exist (~15×15); hide miles until then; no routing API until needed  
- **Reason:** Scale tiny; Pages-friendly; avoids paid infra  
- **Confidence:** High  
- **Reversible?** Yes · **Cost:** Low–medium  
- **My answer:** ☐ A ☐ B ☐ C ☐ D ☐ E ☐ Other: _______________

---

### D08 — Planner scope (same- vs multi-theater)

- **Decision:** Whether multi-theater plans are required before “real data” Planner  
- **Why it matters:** Results mockup is multi-theater with walks  
- **Gaps:** G13, G09  
- **Screens:** Build a Plan, results, film-click sheet  

| Option | Notes |
|--------|-------|
| A. Same-theater for initial v2 | Reuse legacy engine; hide walk UI |
| B. Multi-theater required before launch | Large engine rewrite |
| C. Multi-theater only where matrix exists | Partial coverage |
| D. Keep walk UI hidden until supported | Design-preserving honesty |

- **Architecture:** Extend `plannerEngine.js` vs new solver  
- **Stage 3:** A shrinks critical path dramatically  
- **Can proceed:** Config UI, seeds from Film Detail, same-theater results  
- **Blocked:** Full results mockup parity if A  
- **Recommended:** **A + D**, then **C** when matrix ready  
- **Reason:** Useful movie days without travel; legacy engine exists; Stage 5 only if multi-theater never comes  
- **Confidence:** High  
- **Reversible?** Adding multi-theater later is additive · **Cost:** Medium eng  
- **My answer:** ☐ A ☐ B ☐ C ☐ A+D ☐ Other: _______________

---

### D09 — Calendar

- **Decision:** Which calendar capabilities are in scope for first usable release  
- **Why it matters:** About My Schedule claims ongoing one-way sync (“creates and updates… external edits won’t sync back”)  
- **Gaps:** G15  
- **Screens:** Schedule settings, About, FAQ  

| Option | Notes |
|--------|-------|
| A. ICS export only | No OAuth; Pages-friendly |
| B. One-time Add to Calendar links | OS-handled |
| C. Ongoing one-way sync | Matches About copy; needs OAuth + backend |
| D. Bidirectional | Explicitly **not** what About says |
| E. Phased: A/B now; C later; update About until C ships | |

- **Architecture:** A/B client-only; C needs tokens/backend (conflicts with pure Pages unless separate service)  
- **Stage 3:** If C required day one → auth-like infra early  
- **Can proceed:** My Schedule without any calendar  
- **Blocked:** Literal About sync claims if A-only  
- **Recommended:** **E** — ship ICS (+ optional one-time add); **revise About copy** until one-way sync exists; never bidirectional unless you change policy  
- **Reason:** Single-user; About already forbids bidirectional; sync is a product promise that forces infra  
- **Confidence:** High  
- **Reversible?** Copy easy; adding sync later medium · **Cost of over-promising:** High  
- **My answer:** ☐ A ☐ B ☐ C ☐ D ☐ E Update About until sync? ☐ Yes ☐ No ☐ Other: _______________

---

### D10 — Memberships / AMC A-List

- **Decision:** How membership UI is backed  
- **Why it matters:** Profile shows renew date + “4 of 4 this week”; FD shows A-List eligible  
- **Gaps:** G19  
- **Screens:** Profile, Film Detail badges, Planner Prefer AMC  

| Option | Notes |
|--------|-------|
| A. User-entered membership preference only | |
| B. Eligibility labels from data (e.g. catalog flag) | Not user usage |
| C. Manual usage tracking in-app | User taps “used tonight” |
| D. Live AMC integration | Likely infeasible / ToS |
| E. Hide renew/weekly-use until supported | Keep Prefer AMC as preference |

- **Architecture:** A/C local state; D external auth  
- **Stage 3:** Prefer AMC can work as theater filter without live A-List  
- **Can proceed:** Planner theater prefs  
- **Blocked:** Live counters / renew facts  
- **Recommended:** **A + B + E** — preference + eligibility when known; **remove renew/weekly-use** until C or real integration; not D  
- **Reason:** Catalog has `available_for_a_list` internally; live usage is Group C/F  
- **Confidence:** High  
- **Reversible?** Easy · **Cost:** Low  
- **My answer:** ☐ A ☐ B ☐ C ☐ D ☐ E ☐ A+B+E ☐ Other: _______________

---

### D11 — Editorial operations

- **Decision:** Whether Collections / thematic tags / Suggested imagery need human curation  
- **Why it matters:** Explore Browse By includes Collections, Coming Soon, Special Events  
- **Gaps:** G18  
- **Screens:** Explore, Suggested Starts cards  

| Option | Notes |
|--------|-------|
| A. No editorial surfaces (honest unavailable) | Current early v2 posture |
| B. Small repo-curated collections | Git JSON/Markdown |
| C. Rule-generated only (formats, leaving, opening) | |
| D. Hybrid B+C | |
| Thematic tags allowed? | Avoid invented mood tags |

- **Recommended:** **D** with **no thematic invention tags** unless curated; Coming Soon/Special Events rule-based when attributes exist  
- **Reason:** Light curation fits repo workflow; fake tags violate honesty  
- **Confidence:** Medium  
- **Reversible?** Yes · **Cost:** Low  
- **My answer:** ☐ A ☐ B ☐ C ☐ D Thematic tags? ☐ No ☐ Curated only ☐ Other: _______________

---

### D12 — Person search

- **Decision:** Launch requirement vs honest placeholder  
- **Why it matters:** Explore placeholder says “person”; data lacks cast/crew publicly  
- **Gaps:** G17  
- **Screens:** Explore, Search  

| Option | Notes |
|--------|-------|
| A. Required at initial release | Needs enrichment + index |
| B. Defer; change placeholder copy | Matches `personSearchSupported: false` |
| C. Directors only after enrichment | Smaller than full cast |
| D. Cast + directors after enrichment | |

- **Recommended:** **B** now; **C** after enrichment if desired  
- **Reason:** Already documented; prevents fabricated Kurosawa-as-person results  
- **Confidence:** High  
- **Reversible?** Easy · **Cost:** Low  
- **My answer:** ☐ A ☐ B ☐ C ☐ D ☐ Other: _______________

---

### D13 — Venue expansion

- **Decision:** Which non-registry venues matter for v2; mockup venue handling  
- **Why it matters:** Mockups show Paramount, Grand Illusion, Egyptian naming variants  
- **Gaps:** G22  
- **Screens:** Home, Theaters, Search  

| Option | Notes |
|--------|-------|
| A. Ship only current registry venues; replace mockup-only names in real-data conversion | |
| B. Prioritize Grand Illusion next ingestion | Product pick — not automatic |
| C. Prioritize other venues (list) | |
| D. No new venues until enrichment/planner settle | |

- **Recommended:** **A + D** for first usable release; treat Grand Illusion as a **separate PO pick**, not a silent default  
- **Reason:** New source is PO-blocked on data-foundation roadmap; coverage honesty > fictional venues  
- **Confidence:** Medium  
- **Reversible?** Adding venues later normal · **Cost:** Medium per source  
- **My answer:** ☐ A ☐ B ☐ C ☐ D ☐ A+D Priority list: _______________

---

### D14 — Genre color coding

- **Decision:** Schedule color-by-genre without public genres  
- **Why it matters:** Settings offer “By genre”  
- **Gaps:** G01 (genres), Schedule settings  
- **Screens:** My Schedule settings  

| Option | Notes |
|--------|-------|
| A. Disable until genre coverage exists | |
| B. Infer only when confident | |
| C. Partial coverage OK | |
| D. Recommend opportunity-type / theater modes only for now | |

- **Recommended:** **A + D** — default “By opportunity type”; hide or disable genre mode until enrichment  
- **Reason:** Avoid misleading colors  
- **Confidence:** High  
- **Reversible?** Easy · **Cost:** Low  
- **My answer:** ☐ A ☐ B ☐ C ☐ D ☐ A+D ☐ Other: _______________

---

### D15 — Seen-film behavior

- **Decision:** Whether seen films can still surface as opportunities  
- **Why it matters:** Explore copy: “Seen films can still appear for special opportunities”  
- **Gaps:** G11, Top Opportunity / planner  
- **Screens:** Home, Explore, Planner, Film Detail  

| Option | Notes |
|--------|-------|
| A. Always exclude from recommendations | |
| B. Allow special-format / rare / leaving exceptions | Matches Explore note |
| C. User setting | |
| D. Exclude from Top Opp; allow in Search/browse | |

- **Recommended:** **B + optional C later** — default allow rare/special/leaving exceptions; still exclude from casual “for you” once personalization exists  
- **Reason:** Aligns with existing Explore honesty copy  
- **Confidence:** Medium  
- **Reversible?** Easy · **Cost:** Low  
- **My answer:** ☐ A ☐ B ☐ C ☐ D ☐ B+C ☐ Other: _______________

---

### D16 — Planner budget

- **Decision:** Whether budget is launch-required  
- **Why it matters:** Build a Plan shows Budget control; prices only partial in AMC logs, not public  
- **Gaps:** G05-related pricing, planner  
- **Screens:** Build a Plan  

| Option | Notes |
|--------|-------|
| A. Required at launch | |
| B. AMC-only partial pricing | Uneven |
| C. User-entered estimates | |
| D. Defer until reliable coverage | Hide control until then (Stage 5 only if never) |
| E. Keep control but non-functional with explanation | Weaker UX |

- **Recommended:** **D** — defer; do not fake prices  
- **Reason:** Incomplete price coverage; not core to same-theater planning  
- **Confidence:** High  
- **Reversible?** Easy · **Cost:** Low  
- **My answer:** ☐ A ☐ B ☐ C ☐ D ☐ E ☐ Other: _______________

---

### D17 — Runtime and transfer buffers

- **Decision:** How end times and gaps are computed  
- **Why it matters:** Legacy uses start+runtime only; mockup plans need realistic breaks  
- **Gaps:** G26  
- **Screens:** Planner results, My Schedule breaks  

| Option | Notes |
|--------|-------|
| A. Runtime only (legacy) | Underestimates occupancy |
| B. Fixed preshow buffer (e.g. +15 min) | Simple |
| C. Theater-specific buffers | More accurate; curation |
| D. User-adjustable buffer | Power user |
| E. Transfer buffer between screenings (same or cross theater) | Needed for multi-theater |
| Defaults | Propose values even if adjustable |

- **Recommended:** **B + E** with defaults **preshow 15 min**, **transfer 10 min** (same building 5); optional **D** later; not C initially  
- **Reason:** Valid plans without theater-specific research; aligns with D07/D08 phasing  
- **Confidence:** Medium (numbers are proposals)  
- **Reversible?** Easy to tune · **Cost:** Low  
- **My answer:** ☐ A ☐ B ☐ C ☐ D ☐ E ☐ B+E Defaults: preshow ___ min · transfer ___ min · Other: _______________

---

## 4. Recommended default decision set

**Not approved until you confirm.** Optimized for first usable v2: design preserved, fixtures replaced honestly, Pages-viable, single-user, minimal infra.

| ID | Recommended package | Type |
|----|---------------------|------|
| D01 | Phased local-first + export/import; accounts later | Foundational schema portable; auth deferred |
| D02 | Hybrid opening (first Seattle showtime + overrides); calendar week for Opening; Explore stays rolling 7d | Reversible MVP rule |
| D03 | Keep Leaving absent until eval bar; then AMC-only + honest confidence | Temporary omit → gated ship |
| D04 | Hide missing fields; partial-by-source OK; AMC republish only after terms; external provider = research track | Temporary compromise + legal gate |
| D05 | Schedule-derived Why See It only; defer Letterboxd | Deferred feature |
| D06 | Repo-curated theater JSON; defer pricing/hours from first dynamic release | Reversible MVP |
| D07 | Same-theater first; curated walk matrix later; hide miles until then | Reversible MVP |
| D08 | Same-theater planner + hide walk UI; multi-theater when matrix exists | Reversible MVP |
| D09 | ICS (+ optional one-time add); revise About until one-way sync; no bidirectional | Temporary copy compromise |
| D10 | User preference + eligibility labels; hide renew/weekly-use; no live AMC | Temporary compromise |
| D11 | Hybrid light curation + rules; no invented thematic tags | Reversible MVP |
| D12 | Change placeholder; defer person search | Temporary compromise |
| D13 | Registry venues only for first release; new venues = explicit later picks | Deferred expansion |
| D14 | Disable genre colors; default opportunity-type | Temporary compromise |
| D15 | Allow special/rare/leaving exceptions for seen films | Reversible MVP |
| D16 | Defer budget control | Deferred feature |
| D17 | Fixed +15m preshow, +10m transfer (tunable) | Reversible MVP |

**What this package deliberately postpones:** accounts, routing APIs, Letterboxd, live A-List, Leaving Soon ship, multi-theater miles, pricing/hours completeness, person search, new theater scrapers.

**Upgrade paths left clean:** local schemas → accounts; same-theater → matrix multi-theater; ICS → one-way sync; enrichment research → public artifact; curated theaters → richer visit meta.

---

## 5. What Stage 3 can draft once Group A is answered

With D01, D02, D04, D06, D07, D08, D09 answered, Stage 3 can sequence:

1. Public emit completeness (tickets / source IDs)  
2. Enrichment artifact policy (per D04)  
3. Theater curation slice (per D06)  
4. Opening classifier (per D02)  
5. User-state stores (per D01)  
6. Planner v2 scope (per D07–D08)  
7. My Schedule + calendar mode (per D09)  
8. Group B items as separate streams  

---

## 6. Fast response form

Copy and fill:

```text
D01 Persistence: 
D02 Opening definition: 
D02 Week boundary: 
D03 Leaving Soon: 
D03 False positives worse than misses?: 
D04 Film enrichment: 
D05 Cultural rankings / Letterboxd: 
D06 Theater metadata ownership: 
D06 Pricing/hours in first release?: 
D07 Travel MVP: 
D08 Planner scope: 
D09 Calendar: 
D09 Update About copy until sync?: 
D10 Memberships / A-List: 
D11 Editorial operations: 
D11 Thematic tags?: 
D12 Person search: 
D13 Venue expansion: 
D14 Genre color coding: 
D15 Seen-film behavior: 
D16 Planner budget: 
D17 Runtime buffers: 
D17 Default preshow minutes: 
D17 Default transfer minutes: 

Accept recommended package as starting point?: Yes / No / With changes:
Changes:
```

---

*End of Stage 3 pre-roadmap decision packet. Recommendations are not decisions until answered above.*
