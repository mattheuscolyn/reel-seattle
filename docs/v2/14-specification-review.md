# 14 — Specification Review

**Status:** Editorial audit (D-9)  
**Date:** 2026-07-17  
**Scope:** All documents under `docs/v2/` as of `ece2367` / D-8  
**Related:** [README](./README.md) · [Editorial design language](./15-editorial-design-language.md)

This document is an **editorial review** of the Reel Seattle v2 specification as a draft product constitution. It does not critique product direction, rewrite other docs, or design UI.

---

## Overall Assessment

The current specification is **internally coherent**.

Across philosophy, discovery, opportunity, lifecycle, information architecture, experience, navigation, and context, the same product model and principles recur without contradiction:

* Film is identity; Opportunity is the decision unit; Plan is commitment.
* Discovery emphasizes before it hides; urgency lives on opportunities.
* Depth unfolds progressively; context informs judgment rather than replacing it.
* The live public site stays stable while v2 is specified in parallel.

Completeness is **intentionally uneven by design**: the product *constitution* (why and how meaning works) is substantially authored; the *expression* layer (components, visual language, screens, implementation roadmap) remains correctly blank. That split is consistent with the stated rule that implementation follows specification.

Minor editorial unevenness exists (document numbering jumps; [Core concepts](./02-core-concepts.md) is still labeled “high-level seed” while later docs elaborate the same terms). None of that breaks conceptual consistency.

---

## Concept Map

Conceptual flow of the constitution (not a screen hierarchy):

```text
Mission / Promise / Emotional goal
        ↓
Discovery (lenses, signals, funnel)
        ↓
Film (identity; one card; lifecycle presence)
        ↓
Opportunity (decision unit; primary story; categories)
        ↓
Planning (commitment → Plan)
        ↓
Knowledge (reference depth; context & significance; archive)
```

Supporting concepts that cut across the flow:

| Concept | Role in the map |
|---------|-----------------|
| **Lens** | Reframes Discovery emphasis without erasing the city |
| **Lifecycle** | How Film↔Opportunity presence evolves in Seattle over time |
| **Session / Experience** | Why the user opened the product; adaptive emphasis |
| **IA layers** | Overview → Comparison → Reference |
| **Navigation philosophy** | Progressive depth; inline when practical; dedicated destinations when depth requires it |
| **Context & significance** | Explains notability; does not predict taste |

---

## Observed Strengths

* **Consistent terminology** — Film, Opportunity, Plan, Lens, Discovery, and Plan are used with the same meanings from [01](./01-product-philosophy.md) through [13](./13-context-and-significance.md).
* **Recurring design principles** — Discovery before reference; group by film; opportunities drive decisions; highlight without hiding; inline exploration; production site stable; urgency on opportunities — restated where relevant without flipping meaning.
* **Clear philosophy vs implementation boundary** — Explicit non-goals (no schemas, algorithms, wireframes, chrome) appear throughout; placeholders for 06–09 prevent premature UI invention.
* **Layered progressive disclosure** — [04](./04-information-architecture.md), [05](./05-navigation.md), [03](./03-discovery-model.md), and [10](./10-opportunity-model.md) reinforce overview-first depth without prescribing pages.
* **Healthy separation of “story” and “significance”** — Opportunity primary story (why care *now*) pairs with Context & significance (what this *is* / why it may matter) without collapsing into taste recommendation ([13](./13-context-and-significance.md)).
* **Cross-linking** — Documents point to owning homes for overlapping ideas (e.g. lifecycle owned by [11](./11-film-lifecycle.md); navigation chrome deferred to later).

---

## Potential Overlap

Overlap below is **noted, not recommended for removal**. Repetition often reinforces the constitution.

| Topic | Appears in |
|-------|------------|
| Film vs Opportunity (identity vs decision) | 01, 02, 03, 10 |
| Highlight without hiding / supporting context | 03, 10, 05, 13 |
| Overview → Comparison → Reference | 04, 05 (and Discovery funnel compare/commit stages in 03) |
| Film → Opportunity → Plan | 01, 02, 04, 05, 12 |
| Personalization / dismissed films / membership / favorite theaters | 03, 10, 12, 13 |
| Primary story / “why care right now?” | 03, 10, 04 |
| Urgency on opportunities, not films | 03, 11, 13 |
| User questions / session goals | 04 (IA question groups), 12 (session goals) — related but different angles |
| Recommendation transparency vs context-not-taste | 03 (placeholder), 13 (full treatment) |
| Onboarding / notifications / newsletters | Future topics in 04, 05, 11, 12, 13 |

Future editorial passes may choose a single “canonical home” per idea and shorter cross-references elsewhere; that is optional cleanup, not a blocker.

---

## Open Questions

These remain unanswered **by design**. They belong to later phases — not deficiencies of the current constitution.

| Area | Still open |
|------|------------|
| **Navigation structure** | Tabs, labels, destination count, chrome ([05](./05-navigation.md) philosophy only) |
| **Screen layouts** | Discovery/home, film, opportunity, plan, settings ([08](./08-screen-specifications.md)) |
| **Visual language** | Typography, color, motion, density ([07](./07-visual-language.md)) |
| **Interaction / component details** | Controls, density patterns, film/opportunity units ([06](./06-component-system.md)) |
| **Personalization behavior** | Exact emphasis rules; dismissal permanence; membership effects |
| **Lens catalog & signal taxonomy** | Full inventories; prioritization of primary stories |
| **Ranking / ordering** | Explicitly deferred; no formulas |
| **Channels** | Notifications, newsletters, reminders, calendar integration |
| **Search & deep links** | Entry paths and context restoration |
| **Editorial voice & external metadata** | How context is sourced and spoken ([13](./13-context-and-significance.md)) |
| **Implementation sequencing** | Build gates and slices ([09](./09-implementation-roadmap.md)) |
| **Data foundation coupling** | How v2 concepts map to schemas/enrichment — outside this folder by intent |

---

## Readiness Assessment

**Ready to begin interaction and screen design** — with Product Owner + ChatGPT, still without implementation.

### Why yes

* The product model and principles are stable enough to design *against*.
* Progressive depth, inline-vs-dedicated, and session intents give designers constraints that prevent random page sprawl.
* Discovery, opportunity stories, lifecycle, and context give content meaning for what a “film card” or “opportunity comparison” must communicate.
* Placeholders for 06–08 correctly mark the next authorship zone.

### Why not “ready to build”

* No screen specifications, components, or visual language exist yet.
* No implementation roadmap or design-complete gates are defined.
* Inventing UI from philosophy alone would violate the operating model (Cursor implements agreed specs; it does not invent UX).

### Recommended next phase (editorial only)

Proceed into **interaction and screen design conversations** that fill [08](./08-screen-specifications.md) (and then [06](./06-component-system.md) / [07](./07-visual-language.md)) under explicit Product Owner + ChatGPT agreement — not a Cursor UI build.

---

## Document inventory at review time

| Doc | Completeness (as labeled) |
|-----|---------------------------|
| [README](./README.md) | Index / rules |
| [01 Philosophy](./01-product-philosophy.md) | Seeded |
| [02 Core concepts](./02-core-concepts.md) | High-level seed |
| [03 Discovery](./03-discovery-model.md) | Philosophy expanded |
| [04 IA](./04-information-architecture.md) | Philosophy expanded |
| [05 Navigation](./05-navigation.md) | Philosophy expanded (D-7) + Interaction Model (D-14) |
| [06 Components](./06-component-system.md) | Placeholder |
| [07 Visual](./07-visual-language.md) | Placeholder |
| [08 Screens](./08-screen-specifications.md) | Home / Film Detail / Theater / Planner conceptual (post–D-9); Opportunity Detail & Settings still deferred |
| [09 Implementation](./09-implementation-roadmap.md) | Placeholder |
| [10 Opportunity](./10-opportunity-model.md) | Philosophy documented |
| [11 Lifecycle](./11-film-lifecycle.md) | Philosophy documented |
| [12 Experience](./12-experience-model.md) | Philosophy documented |
| [13 Context](./13-context-and-significance.md) | Philosophy documented |
| **14 Review (this doc)** | Editorial audit |
| [15 Editorial design language](./15-editorial-design-language.md) | Philosophy documented (D-15); systems deferred |

---

## Non-goals of this review

* No rewrites or merges of existing documents
* No UI, navigation structure, or feature implementation
* No change to product direction
