# 09 — Implementation Roadmap

**Status:** Placeholder  
**Related:** [README](./README.md) · [Product philosophy](./01-product-philosophy.md) · [Data foundation roadmap](../data-foundation-roadmap.md)

## Purpose

Order v2 **implementation** work only after enough of the design specification exists. Design leads; code follows.

## Status

Not yet authored as a full build plan. Screen-specification track: canonical [Home](./specs/home.md) (D-17; Design Review v3 in D-22), [Film Detail](./specs/film-detail.md), [Planner](./specs/planner.md), [Theater](./specs/theater.md), [Explore / Search](./specs/explore-search.md) (D-23), [Opportunity expression](./specs/opportunity-expression.md) (D-24), [Profile / Settings](./specs/profile-settings.md) (D-25), and [Global navigation](./specs/global-navigation.md) (D-26 — **Home · Explore · Planner · Profile**). Primary product surfaces and global navigation destinations are specified. Do not schedule v2 UI implementation without explicit product gates. Do not treat design-review imagery as implementation authority over written canonical specs. Do not mark navigation implementation, Profile persistence, or accounts as complete.

## Placeholder sections

* Design-complete gates before coding (canonical surfaces + Opportunity expression + Profile/Settings + global navigation destinations exist; chrome/icons/routes TBD)
* Suggested implementation slices (TBD)
* Parallelism with data-foundation work (film identity, [theater expansion](../data-foundation-roadmap.md#planned-theater-model-expansion))
* Relationship to the stable production site (no dedicated Theater page today; live Planner preserved)
* Suggested implementation slices (TBD)

## Rules

* Do not schedule UI implementation from incomplete specs.
* Do not couple v2 implementation to silent legacy-site refactors.
* Cursor implements agreed specifications; it does not invent UX to “fill gaps.”

## See also

* [Development operating model — v2 design workflow](../development-operating-model.md#v2-product-design-workflow)
