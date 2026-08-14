-- Phase 3 detector: restore minimum service_role table grants
-- Forward-only. Do not edit prior migrations.
--
-- Earlier migrations REVOKE ALL ... FROM PUBLIC then GRANT only to
-- authenticated. That removed default service_role privileges even though
-- service_role bypasses RLS. The SHOWTIMES_AVAILABLE detector needs
-- ordinary Postgres grants to read Saved prefs and write watches/notifications.
--
-- Does not change anon/authenticated grants or RLS policies.

-- Detector: SELECT active saved rows from user_film_preferences.
grant select on table public.user_film_preferences to service_role;

-- Detector: SELECT existing watches; upsert (INSERT + UPDATE) enrollment state.
grant select, insert, update on table public.user_film_showtime_watches to service_role;

-- Detector: INSERT SHOWTIMES_AVAILABLE rows only (no UPDATE; read_at is client-owned).
grant insert on table public.user_notifications to service_role;
