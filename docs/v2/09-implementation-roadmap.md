# 09 — Implementation Roadmap

**Status:** Placeholder  
**Related:** [README](./README.md) · [Product philosophy](./01-product-philosophy.md) · [Data foundation roadmap](../data-foundation-roadmap.md)

## Purpose

Order v2 **implementation** work only after enough of the design specification exists. Design leads; code follows.

## Status

Not yet authored as a full build plan. Screen-specification track: canonical [Home](./specs/home.md) (D-17; reconciled with Design Review v3 in D-22), [Film Detail](./specs/film-detail.md), [Planner](./specs/planner.md), and [Theater](./specs/theater.md) (D-17–D-20). Primary surfaces specified; Opportunity Detail and settings remain open. Do not schedule v2 UI implementation without explicit product gates. Do not treat Home Design Review imagery as implementation authority over [canonical Home](./specs/home.md).

## Placeholder sections

* Design-complete gates before coding (Home, Film Detail, Planner, Theater canonical exist; Home presentation rules updated in D-22)
* Parallelism with data-foundation work (film identity, [theater expansion](../data-foundation-roadmap.md#planned-theater-model-expansion))
* Relationship to the stable production site (no dedicated Theater page today; live Planner preserved)
* Suggested implementation slices (TBD)

## Rules

* Do not schedule UI implementation from incomplete specs.
* Do not couple v2 implementation to silent legacy-site refactors.
* Cursor implements agreed specifications; it does not invent UX to “fill gaps.”

## See also

* [Development operating model — v2 design workflow](../development-operating-model.md#v2-product-design-workflow)
