-- Immutable audit trail for admin film identity reviews.
-- Forward-only. Do not edit prior migrations.
--
-- film_identity_reviews remains the current authoritative decision per
-- source_identity_key. Each insert/update also appends an immutable event row
-- with the full decision payload (including snapshot telemetry).

create table if not exists public.film_identity_review_events (
  id uuid primary key default gen_random_uuid(),
  review_id uuid null references public.film_identity_reviews (id) on delete set null,
  source_identity_key text not null,
  source text not null,
  source_film_id text null,
  showtime_film_key text null,
  decision text not null
    check (decision in (
      'matched',
      'not_film',
      'multiple_shorts',
      'needs_follow_up'
    )),
  tmdb_id integer null check (tmdb_id is null or tmdb_id >= 1),
  admin_note text null,
  snapshot jsonb not null default '{}'::jsonb,
  reviewed_by uuid not null references auth.users (id),
  reviewed_at timestamptz not null,
  created_at timestamptz not null default now(),
  event_kind text not null default 'decision_upsert'
    check (event_kind in ('decision_upsert', 'matcher_context_backfill'))
);

comment on table public.film_identity_review_events is
  'Append-only audit of admin TMDB review decisions and optional matcher-context backfills. Historical rows are never updated or deleted by application code.';

create index if not exists film_identity_review_events_identity_idx
  on public.film_identity_review_events (source_identity_key, reviewed_at desc);

create index if not exists film_identity_review_events_reviewed_at_idx
  on public.film_identity_review_events (reviewed_at desc);

create or replace function public.append_film_identity_review_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.film_identity_review_events (
    review_id,
    source_identity_key,
    source,
    source_film_id,
    showtime_film_key,
    decision,
    tmdb_id,
    admin_note,
    snapshot,
    reviewed_by,
    reviewed_at,
    event_kind
  ) values (
    new.id,
    new.source_identity_key,
    new.source,
    new.source_film_id,
    new.showtime_film_key,
    new.decision,
    new.tmdb_id,
    new.admin_note,
    coalesce(new.snapshot, '{}'::jsonb),
    new.reviewed_by,
    new.reviewed_at,
    'decision_upsert'
  );
  return new;
end;
$$;

drop trigger if exists film_identity_reviews_append_event on public.film_identity_reviews;
create trigger film_identity_reviews_append_event
  after insert or update on public.film_identity_reviews
  for each row
  execute function public.append_film_identity_review_event();

alter table public.film_identity_review_events enable row level security;

drop policy if exists film_identity_review_events_admin_select
  on public.film_identity_review_events;
create policy film_identity_review_events_admin_select
  on public.film_identity_review_events
  for select
  to authenticated
  using (public.is_admin());

-- No client insert/update/delete: events are written only by the trigger / service role.
revoke all on table public.film_identity_review_events from anon;
revoke all on table public.film_identity_review_events from authenticated;
grant select on table public.film_identity_review_events to authenticated;
grant all on table public.film_identity_review_events to service_role;
