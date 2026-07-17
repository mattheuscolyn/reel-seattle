# Reel Seattle — Development Operating Model

**Status:** Living document  
**Audience:** Product owner, ChatGPT (project lead), Cursor (implementation agent)  
**Purpose:** Keep collaboration consistent while the **legacy public site** stays maintained and new work focuses on **data architecture, source health, film identity, metadata, and a future public site**.

---

## 1. Working Model

| Role | Responsibility |
|------|----------------|
| **User** | **Product Owner + Pipeline** — sets priorities, approves scope, runs manual QC, merges/pushes when ready, monitors daily data pipeline and GitHub state |
| **ChatGPT** | **Project Lead + Architect** — breaks work into tracks, writes Cursor prompts, interprets reports, proposes decisions, enforces anti-drift rules, maintains handoffs |
| **Cursor** | **Implementation Agent** — executes scoped tasks in-repo, runs validation, reports in the standard format, does not expand scope without approval |

**Principles**

- One coherent task per Cursor session when possible.
- ChatGPT interprets; Cursor implements; the user decides at gates.
- Docs and small PRs beat large unreviewed diffs.
- Legacy public UI changes are explicit, not accidental side effects of data work.

---

## 2. Development Tracks

Work is tagged to a track in prompts, commits, and handoffs.

| Track | Focus | Default rule |
|-------|--------|--------------|
| **Legacy Public Site** | Current GitHub Pages app — Showtimes, Planner, mobile UX | Maintain; bugfix and polish only when scoped |
| **Data Foundation** | Schema, emit contracts, history CSV, pipeline reports, source health | No public UI redesign |
| **Theater Expansion** | New adapters, scraping feasibility, theater registry | Source health report required before ship |
| **Film Identity + Metadata** | Parent/variant identity, `source_film_id`, enrichment fields | Additive JSON; fuzzy matching documented |
| **Developer Data Cockpit** | Internal views, audits, analysis scripts, QA tooling | Not user-facing product |
| **Next Public Site** | Future consumer site (v2) | Design-first via [docs/v2/](./v2/README.md); no silent coupling to legacy UI refactors |

**Master references:** [product-roadmap.md](./product-roadmap.md) · [data-foundation-roadmap.md](./data-foundation-roadmap.md) · [film-identity-normalization.md](./film-identity-normalization.md) · [data-artifact-inventory.md](./data-artifact-inventory.md) · [v2 design specification](./v2/README.md) · [SCRAPING_README.md](../SCRAPING_README.md)

---

## 2b. v2 product design workflow

Reel Seattle **v2** is a parallel product-design track. The live public site stays production; v2 specs live under [docs/v2/](./v2/README.md).

```text
Product Owner
        +
ChatGPT Product Lead / UX Architect
        ↓
Product Specification (docs/v2/)
        ↓
Cursor Implementation
        ↓
Review
```

**Rules**

* Product Owner and ChatGPT author the specification incrementally.
* Cursor implements **agreed specifications**; it must **not** invent UX, interaction, navigation, or product decisions independently.
* Incomplete docs are expected; placeholders are not invitations to fill gaps with unapproved design.
* Implementation of v2 UI does not begin from empty placeholder sections.
* Data-foundation and v2 design may proceed in parallel without changing production UI.

---

## 3. Standard Session Flow

```
Start session
    → Cursor task (scoped prompt)
    → Cursor report (standard format)
    → ChatGPT interpretation
    → Decision gate? (if scope/ architecture / risk)
    → Verification (tests, manual QC, git diff review)
    → Commit / sync (user-approved)
    → Update handoff or roadmap if needed
```

| Step | Owner | Output |
|------|--------|--------|
| **Start session** | User or ChatGPT | Track, goal, constraints, link to handoff |
| **Cursor task** | ChatGPT → Cursor | Prompt with Context / Goal / Scope / Do not change / Validation |
| **Cursor report** | Cursor | Standard report template (below) |
| **ChatGPT interpretation** | ChatGPT | Plain-language summary, drift check, decision needed? |
| **Decision gate** | User | Decision template filled (below) |
| **Verification** | Cursor + User | Automated tests + targeted manual QC |
| **Commit / sync** | User (or Cursor only when explicitly asked) | Focused commit; push when ready |

---

## 4. Cursor Prompt Standard

Every implementation prompt should include:

```markdown
Context:
- [Current state, recent commits, track, handoff link]

Goal:
- [One clear outcome]

Scope:
- [Files/areas in scope]
- [Track tag]

Do not change:
- [Explicit exclusions: scrapers, public data, UI, engine, etc.]

Implementation expectations:
- [Concrete deliverables]

Validation:
- [Commands: npm run test:frontend, pytest, check:dist, manual QA]

Report back:
Use the Cursor Report Standard (docs/development-operating-model.md §5).
```

---

## 5. Cursor Report Standard

Cursor ends every task with this structure:

```markdown
Task Summary:

Files Changed:

Validation Run:

Git Status:

Data Pipeline Notes:

Risks / Open Questions:

Recommended Next Step:
```

**Field guidance**

| Field | Content |
|-------|---------|
| **Task Summary** | 1–3 sentences: what was done and why |
| **Files Changed** | Paths only; note if docs-only or code |
| **Validation Run** | Commands run + pass/fail; omit if docs-only |
| **Git Status** | `git status -sb`; note unstaged `dist/`, daily data |
| **Data Pipeline Notes** | Whether `public/data/`, daily logs, or scrape artifacts touched |
| **Risks / Open Questions** | Regressions, follow-ups, decisions needed |
| **Recommended Next Step** | Single best next task on the active track |

---

## 6. User Decision Template

Use when scope, architecture, or product direction is unclear.

```markdown
Decision needed:

Why it matters:

Recommended option:

Options:

Reply template:

Decision:

Reason:

Constraints:
```

**Reply template (for the user)**

```text
Decision: [A / B / other]
Reason: [one or two sentences]
Constraints: [anything Cursor must not do]
```

---

## 7. User QC Template

Use after UI, pipeline, or data-visible changes.

```markdown
QC needed:

Steps:

Check for:

Reply template:

Result:

Notes:

Screenshot attached:
```

**Reply template (for the user)**

```text
Result: Pass / Fail / Partial
Notes: [what you saw]
Screenshot attached: Yes / No
```

---

## 8. Pause Procedure

When pausing work, the user says:

> **Pause Reel Seattle work.**

ChatGPT (or Cursor, if asked) produces a **pause handoff** containing:

- Active track and last completed task
- Commit hash(es) on `main` if pushed
- Uncommitted local changes (`git status -sb`)
- Open decisions and blockers
- Recommended next step
- Files/docs to read on resume

Save the handoff in chat or paste into [product-roadmap.md](./product-roadmap.md) changelog if durable.

---

## 9. Resume Procedure

When resuming, the user says:

> **Resume Reel Seattle work from this handoff.**

ChatGPT (or the user) provides the pause handoff. Cursor (or ChatGPT) should:

1. `git fetch origin` and `git status -sb`
2. Confirm branch sync vs daily scrape commits
3. Re-read scope constraints and anti-drift rules
4. Continue from **Recommended next step** unless the user redirects

---

## 10. New Chat Procedure

When starting a fresh ChatGPT thread, the user says:

> **Create a Reel Seattle new-chat handoff.**

The handoff must include:

| Item | Detail |
|------|--------|
| **Project** | Reel Seattle — Seattle showtimes + planner |
| **Public site** | Legacy site maintained on GitHub Pages; no silent redesign during data work |
| **Active tracks** | Which tracks are in flight |
| **Recent shipped work** | Last 3–5 relevant commits or PRs |
| **Current priority** | One sentence |
| **Do not touch** | Leaving Soon UI, unscoped UI redesign, `dist/`, daily data commits unless pipeline task |
| **Key docs** | This file, product-roadmap, [data-foundation-roadmap](./data-foundation-roadmap.md), track-specific roadmaps |
| **Open blockers** | Decisions, CI, data freshness |
| **Next step** | Single concrete task |

---

## 11. GitHub Sync Rules

| Rule | Practice |
|------|----------|
| **Fetch before major work** | `git fetch origin` — daily scrape may advance `main` |
| **Frequent commits** | One coherent task per commit; focused message |
| **Stage specific files only** | Never `git add .` without review |
| **Daily pipeline** | Automated commits may update `public/data/`, `data/daily_logs/`, history CSV — expect `main` ahead after idle days |
| **Before push** | If behind remote, pull/rebase only with user approval when scrape commits present |

**Artifact categories**

| Category | Examples | Commit? |
|----------|----------|---------|
| **Source code** | `src/`, `reel_seattle/`, tests | Yes, when task-complete |
| **Docs** | `docs/` | Yes |
| **Generated public data** | `public/data/` | Only intentional pipeline/data PRs |
| **Build artifacts** | `dist/` | Usually **no** (local build) |
| **Analysis cache** | `data/analysis/` | **No** (gitignored) |
| **Daily logs** | `data/daily_logs/` | Per pipeline workflow only |

Full file-by-file inventory (canonical vs generated vs deployed): [data-artifact-inventory.md](./data-artifact-inventory.md).

**If push rejected:** Stop; report remote-ahead commits; do not auto-rebase without user approval.

---

## 12. Anti-Drift Rules

1. **Do not redesign the public UI** during Data Foundation or Film Identity work unless the track is **Legacy Public Site** or **Next Public Site** and scope says so.
2. **Do not add features** without a stated user problem and track tag.
3. **Do not add new data sources** without source health reporting (`pipeline_report.json`, adapter audit note).
4. **Do not treat fuzzy film matches as perfect** — document uncertainty; preserve `showtime_film_key` and `source_title`.
5. **Do not allow broad refactors** without explicit user approval and a rollback plan.
6. **Do not commit** `dist/`, casual `public/data/` refreshes, or `data/analysis/` unless the task is explicitly a data/pipeline deliverable.
7. **Do not expand Leaving Soon product UI** until model gate in [product-roadmap.md](./product-roadmap.md).

---

## 12b. Data-foundation roadmap hygiene

After meaningful **Data Foundation** (or closely related Film Identity / developer-tooling) tasks:

1. Update [data-foundation-roadmap.md](./data-foundation-roadmap.md).
2. Mark completed work `Complete` with links to the detailed docs.
3. Record newly discovered follow-ups as `Planned` or `Research needed`.
4. Do **not** silently drop `Deferred` items.
5. Use that roadmap as the source for “what should we do next?” discussions (alongside [product-roadmap.md](./product-roadmap.md) for cross-cutting product gates).

Daily AMC catalog wiring is implemented (P-14D); see [amc-source-catalog-daily-integration.md](./amc-source-catalog-daily-integration.md).

---

## 13. Feature Feasibility Gate

Before significant new features, fill this table (in chat or a design doc):

| Field | Question |
|-------|----------|
| **Feature** | What are we building? |
| **User value** | Who benefits and how? |
| **Required data** | Fields, sources, freshness |
| **Data availability** | In prod JSON today? Partial? Missing? |
| **Matching or uncertainty risk** | Identity, theater, time, fuzzy title |
| **Implementation risk** | Engine, UI, pipeline, migration |
| **Maintenance burden** | Scrapers, docs, tests, on-call |
| **Recommendation** | Ship / spike / defer / reject |
| **Reason** | One paragraph |

**Default:** If **Data availability** is weak or **Matching risk** is high → spike or defer, not ship.

---

## Quick reference — exact phrases

| Intent | Phrase |
|--------|--------|
| Pause | **Pause Reel Seattle work.** |
| Resume | **Resume Reel Seattle work from this handoff.** |
| New ChatGPT thread | **Create a Reel Seattle new-chat handoff.** |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-07-17 | Add §2b v2 product design workflow; link [docs/v2/](./v2/README.md) |
| 2026-07-15 | Link [data-foundation-roadmap.md](./data-foundation-roadmap.md); add roadmap hygiene; point to AMC catalog daily-integration design |
| 2026-07-03 | Initial operating model — workflow reset; legacy site maintained; data-first tracks |
