# TMDB Match Review (admin)

Internal admin workspace for reviewing theater-source film identities against TMDB.

This is **not** a consumer destination. It is gated by `profiles.is_admin` in the
database. Client-side hiding is only UX; reads and writes are enforced by RLS.

## Authorization

- Column: `public.profiles.is_admin boolean not null default false`
- Clients cannot set or change `is_admin` (trigger `profiles_guard_is_admin`)
- Helper: `public.is_admin()` (`SECURITY DEFINER`, `auth.uid()` only)
- Table: `public.film_identity_reviews` — SELECT/INSERT/UPDATE for
  `authenticated` **and** `public.is_admin()`; no DELETE; `anon` has no grants
- `reviewed_by` is forced to `auth.uid()` on write

There is no UI to self-promote. Mark the authorized account in the SQL editor
after applying the migration (postgres / service role):

```sql
update public.profiles
   set is_admin = true
 where id = '<auth.users id for the admin account>';
```

## Admin entry

- Profile → **TMDB Match Review** (admin accounts only)
- Deep link: `?admin=tmdb-review` (non-admins see a Not found state; RLS still
  blocks data)
- Nav state: `surface.type === 'admin-tmdb-review'`
- Not listed in primary navigation

## Source identity key

Same durable key as the Python matcher:

- `{source}|id|{source_film_id}` when a source film id exists
- otherwise `{source}|key|{showtime_film_key}`

## Decision states

| Admin decision     | Pipeline overlay | Auto-match |
|--------------------|------------------|------------|
| `matched`          | `confirm`        | skipped; TMDB id is canonical |
| `not_film`         | `non_film`       | paused; source identity preserved |
| `multiple_shorts`  | `multiple_shorts`| paused; not collapsed to one feature |
| `needs_follow_up`  | `defer`          | paused until the admin changes it |

`matched` and “confirm existing match” share the `matched` state. Origin
(manual vs pipeline) is visible in the review UI.

## Pipeline bridge

The Python matcher does not call Supabase at match time.

1. `scripts/export_admin_film_identity_reviews.py` reads
   `film_identity_reviews` with the **service role** key.
2. Writes gitignored `data/film_identity/admin_match_overrides.json`.
3. `scripts/match_tmdb_films.py` loads that overlay. **Admin rows win** over
   authored `data/film_identity/tmdb_match_decisions.json`.
4. Missing overlay file is a no-op (local/CI matching still works).

The film-identity GitHub workflow runs the export before match when
`SUPABASE_URL` / `VITE_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set.

Public `showtimes_current.json` `film_id` updates after the next match + emit
run. The admin UI reflects the Supabase decision immediately.

## Queue coverage (v1)

The admin queue is built from the **current public showtimes feed**
(`homeData.opportunities`) plus any rows already saved in
`film_identity_reviews`.

That means:

- Unmatched identities are visible while they still have current/upcoming
  showtimes in `showtimes_current.json`.
- If a title leaves the current window **before** it is reviewed, it disappears
  from Unmatched. There is no persistent unmatched archive in this UI.
- After a decision is saved, the identity remains in Flagged / Needs Follow-up /
  Review Matched even after showtimes drop, because the review row + snapshot
  are preserved.
- **Review Matched** is currently-playing matched titles plus any previously
  saved manual matches. It is not the full offline `film_identity_catalog.json`.

The matcher still processes the complete catalog during the daily job. This
admin surface is a live-listing review tool, not a historical unmatched archive.

## Profile recovery

Client INSERT always stores `is_admin=false`. Client UPDATE (including
upsert-on-conflict) **preserves** the existing `is_admin` value and ignores any
client-supplied flag.

If the profile **row is deleted** and later re-inserted by client recovery,
`is_admin` is false until it is set again in SQL. Do not grant admin from the
client to work around that.

## TMDB search

Reuses the existing `tmdb-api` Edge Function / Vite `/api/tmdb` proxy.
No TMDB token in the client. No new Edge Function for reviews.

## Snapshot / audit telemetry

Each decision upsert writes:

1. `film_identity_reviews.snapshot` (current decision payload)
2. An append-only row in `film_identity_review_events` (migration
   `20260821000000_film_identity_review_events.sql`)

Snapshot v2 includes selected TMDB title/year/runtime, `selection_method`, and
optional `matcher_context` (ranked candidates / blocked reasons) when available.
Historical reviews from v1 only stored raw/display title, theaters, runtime, and
pre-review `canonical_film_id`.

## Matcher evaluation corpus

Human confirmations feed an offline regression set:

```bash
python scripts/build_admin_confirmed_eval_corpus.py   # after exporting reviews
python scripts/evaluate_tmdb_matcher.py
```

Fixture: `tests/fixtures/film_identity/admin_confirmed_eval_cases.json`.

## Human setup

1. `supabase db push` (apply admin review + review_events migrations).
2. Find your auth user id (SQL editor):

```sql
select id, email, created_at
  from auth.users
 order by created_at;
```

3. Mark only that profile as admin (postgres / service role):

```sql
update public.profiles
   set is_admin = true
 where id = '<your auth.users id>';

select id, display_name, is_admin
  from public.profiles
 where is_admin = true;
```

Expect exactly one row — yours.

4. Optional for automated matching: GitHub secrets `SUPABASE_URL` +
   `SUPABASE_SERVICE_ROLE_KEY` (reuse existing Supabase secrets; no new TMDB
   secret). Apply the migration **before** adding the service-role secret so
   the export step does not 404.
5. No database deploy is performed by the application build.
6. After saving reviews, wait for the next film-identity match + daily emit
   (or dispatch `film_identity_match.yml`) so public `film_id` values update.
