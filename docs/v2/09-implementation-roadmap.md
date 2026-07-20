# 09 — Implementation Roadmap

**Status:** Placeholder  
**Related:** [README](./README.md) · [Product philosophy](./01-product-philosophy.md) · [Data foundation roadmap](../data-foundation-roadmap.md)

## Purpose

Order v2 **implementation** work only after enough of the design specification exists. Design leads; code follows.

## Status

Not yet authored as a full build plan. Screen-specification track: canonical [Home](./specs/home.md) (D-17) and [Film Detail](./specs/film-detail.md) (D-18). Do not schedule UI implementation from incomplete surface specs (Planner / Theater canonical TBD). Identity resolution and Best Opportunity ranking remain data/design dependencies — not implementation-complete.

## Placeholder sections

* Design-complete gates before coding (Home + Film Detail canonical exist; Planner / Theater canonical TBD)
* Parallelism with data-foundation work (esp. [film identity](../data-foundation-roadmap.md#planned-film-identity-and-enrichment))
* Relationship to the stable production site
* Suggested implementation slices (TBD)

## Rules

* Do not schedule UI implementation from incomplete specs.
* Do not couple v2 implementation to silent legacy-site refactors.
* Cursor implements agreed specifications; it does not invent UX to “fill gaps.”

## See also

* [Development operating model — v2 design workflow](../development-operating-model.md#v2-product-design-workflow)
