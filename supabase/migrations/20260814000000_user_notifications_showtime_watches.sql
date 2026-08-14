-- Phase 3: SHOWTIMES_AVAILABLE notifications + watch enrollment
-- Forward-only. Do not edit prior migrations.
--
-- Generation is service-role only (GitHub Action detector).
-- Authenticated clients may SELECT own rows and UPDATE read_at only.
-- Watch enrollment state is never client-writable.

-- ---------------------------------------------------------------------------
-- user_film_showtime_watches (enrollment / episode state for detectors)
-- ---------------------------------------------------------------------------
create table if not exists public.user_film_showtime_watches (
  user_id uuid not null references auth.users (id) on delete cascade,
  film_key text not null,
  film_id text null,
  showtime_film_key text null,
  is_active boolean not null default true,
  -- true = Saved while no qualifying future Seattle showtimes (eligible to notify)
  enrolled_unavailable boolean not null,
  episode_id uuid not null default gen_random_uuid(),
  notified_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_film_showtime_watches_pkey
    primary key (user_id, film_key),
  constraint user_film_showtime_watches_film_key_nonempty
    check (char_length(trim(film_key)) > 0)
);

comment on table public.user_film_showtime_watches is
  'Per-user Saved showtime-watch enrollment. Detector-maintained; not client-writable.';

comment on column public.user_film_showtime_watches.enrolled_unavailable is
  'When true, this watch episode is eligible for one SHOWTIMES_AVAILABLE notification when showtimes appear.';

comment on column public.user_film_showtime_watches.episode_id is
  'Identity for one Save-while-unavailable episode. New UUID on re-enrollment after unsave.';

comment on column public.user_film_showtime_watches.notified_at is
  'Set when SHOWTIMES_AVAILABLE was generated for this episode. Null until then.';

create index if not exists user_film_showtime_watches_eligible_idx
  on public.user_film_showtime_watches (film_key)
  where is_active = true
    and enrolled_unavailable = true
    and notified_at is null;

create or replace function public.set_user_film_showtime_watches_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'user_film_showtime_watches.user_id cannot be reassigned';
  end if;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_film_showtime_watches_set_updated_at
  on public.user_film_showtime_watches;
create trigger user_film_showtime_watches_set_updated_at
  before update on public.user_film_showtime_watches
  for each row
  execute function public.set_user_film_showtime_watches_updated_at();

alter table public.user_film_showtime_watches enable row level security;

-- No policies for authenticated/anon: deny by default. Service role bypasses RLS.
revoke all on table public.user_film_showtime_watches from anon;
revoke all on table public.user_film_showtime_watches from public;
revoke all on table public.user_film_showtime_watches from authenticated;

-- ---------------------------------------------------------------------------
-- user_notifications
-- ---------------------------------------------------------------------------
create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null,
  film_key text not null,
  film_id text null,
  showtime_film_key text null,
  occurrence_key text not null,
  title_snapshot text null,
  body_snapshot text null,
  poster_url_snapshot text null,
  event_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz null,
  constraint user_notifications_type_check
    check (type in ('SHOWTIMES_AVAILABLE')),
  constraint user_notifications_film_key_nonempty
    check (char_length(trim(film_key)) > 0),
  constraint user_notifications_occurrence_key_nonempty
    check (char_length(trim(occurrence_key)) > 0),
  constraint user_notifications_occurrence_key_unique
    unique (occurrence_key)
);

comment on table public.user_notifications is
  'Durable user notifications. System-generated; clients update read_at only.';

comment on column public.user_notifications.occurrence_key is
  'Idempotency key, e.g. showtimes_available:{user_id}:{film_key}:{episode_id}.';

create index if not exists user_notifications_user_created_idx
  on public.user_notifications (user_id, created_at desc);

create index if not exists user_notifications_user_unread_idx
  on public.user_notifications (user_id)
  where read_at is null;

create or replace function public.user_notifications_guard_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'user_notifications.user_id cannot be reassigned';
  end if;
  if new.type is distinct from old.type
     or new.film_key is distinct from old.film_key
     or new.film_id is distinct from old.film_id
     or new.showtime_film_key is distinct from old.showtime_film_key
     or new.occurrence_key is distinct from old.occurrence_key
     or new.title_snapshot is distinct from old.title_snapshot
     or new.body_snapshot is distinct from old.body_snapshot
     or new.poster_url_snapshot is distinct from old.poster_url_snapshot
     or new.event_snapshot is distinct from old.event_snapshot
     or new.created_at is distinct from old.created_at
     or new.id is distinct from old.id then
    raise exception 'user_notifications immutable fields cannot be changed';
  end if;
  -- Preserve first read_at (idempotent re-mark).
  if old.read_at is not null then
    new.read_at = old.read_at;
  end if;
  return new;
end;
$$;

drop trigger if exists user_notifications_guard_update
  on public.user_notifications;
create trigger user_notifications_guard_update
  before update on public.user_notifications
  for each row
  execute function public.user_notifications_guard_update();

alter table public.user_notifications enable row level security;

drop policy if exists "user_notifications_select_own"
  on public.user_notifications;
create policy "user_notifications_select_own"
  on public.user_notifications
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "user_notifications_update_own"
  on public.user_notifications;
create policy "user_notifications_update_own"
  on public.user_notifications
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No INSERT / DELETE for authenticated. Service role generates rows.
revoke all on table public.user_notifications from anon;
revoke all on table public.user_notifications from public;
grant select, update on table public.user_notifications to authenticated;
