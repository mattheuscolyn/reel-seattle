# 02 — Core Concepts

**Status:** High-level seed only  
**Related:** [README](./README.md) · [Product philosophy](./01-product-philosophy.md) · [Discovery model](./03-discovery-model.md) · [Opportunity model](./10-opportunity-model.md) · [Screen specifications](./08-screen-specifications.md)

Definitions below are conceptual. They are **not** data schemas, API contracts, or UI specs.

---

## Film

A **Film** is the canonical identity presented to users — the title-level entity people recognize and talk about.

Films group and summarize related opportunities. They are how users browse and remember cinema, even when decision-making is driven by opportunities.

---

## Opportunity

An **Opportunity** is a specific way to experience a film (for example, a particular screening context, presentation, venue, or time-bound chance).

**Opportunities are the primary unit of decision-making.** Users decide whether to act on an opportunity; films remain the identity layer those opportunities attach to.

---

## Plan

A **Plan** represents commitment — the user’s intent to act on one or more opportunities (attendance intent, saved commitment, or equivalent).

Plans sit downstream of discovery and opportunity evaluation. Behavior and persistence are unspecified here.

---

## Lens

A **Lens** is a discovery perspective — a way of looking at the opportunity landscape (for example, urgency, venue affinity, or membership relevance).

Lenses shape what is emphasized in discovery. Concrete lens inventory and behavior belong in [Discovery model](./03-discovery-model.md) and are not defined yet.

---

## Relationship note

```text
Film (identity)
  ← summarized from —
Opportunity (decision unit)
  → may become →
Plan (commitment)
```

Opportunities drive decisions; films remain the canonical identity presented to users.

---

## Deferred detail

Do not add field lists, matching rules, or screen layouts here until Product Owner and ChatGPT agree them in later design sessions.
