-- Phase D — Trip Planner
--
-- Catherine plans outfits for upcoming trips by adding events
-- (date + time-of-day + occasion). David generates one outfit per event,
-- weather-aware. Packing list is derived from the union of items used.
--
-- Tables:
--   trips         — one row per trip. Single destination (v1).
--   trip_events   — events within a trip. Each gets a Stylist-generated look.
--
-- Existing `looks` table gets a nullable trip_id so trip outfits can be
-- excluded from the home feed (which shows trip_id IS NULL only).

-- ─── trips ────────────────────────────────────────────────────────────────────

create table if not exists public.trips (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default public.current_user_id(),
  created_at        timestamptz not null default now(),

  name              text not null,           -- "Madrid", "Mom's wedding"
  destination_city  text not null,           -- for weather lookup + display
  destination_lat   numeric,                 -- resolved at create time via OWM geocoding
  destination_lon   numeric,
  start_date        date not null,
  end_date          date not null,
  occasion          text                     -- whole-trip vibe: 'vacation'|'business'|'wedding'|'family'|null
);

create index if not exists trips_user_start_idx on public.trips (user_id, start_date);

alter table public.trips enable row level security;

drop policy if exists "owner access" on public.trips;
create policy "owner access" on public.trips
  using (user_id = public.current_user_id());

-- ─── trip_events ──────────────────────────────────────────────────────────────

create table if not exists public.trip_events (
  id                uuid primary key default gen_random_uuid(),
  trip_id           uuid not null references public.trips (id) on delete cascade,
  user_id           uuid not null default public.current_user_id(),
  created_at        timestamptz not null default now(),

  event_date        date not null,
  time_of_day       text not null check (time_of_day in ('morning','day','evening','night')),
  occasion          text not null,           -- "museum visit", "dinner reservation"
  notes             text,                    -- optional extra context for David

  -- Outfit linkage. Set after Stylist generates. Null while pending or after regenerate clears it.
  look_id           uuid references public.looks (id) on delete set null,

  -- Snapshot of weather context used at generation time (forecast or climatology).
  weather_ctx       jsonb
);

create index if not exists trip_events_trip_date_idx on public.trip_events (trip_id, event_date);

alter table public.trip_events enable row level security;

drop policy if exists "owner access" on public.trip_events;
create policy "owner access" on public.trip_events
  using (user_id = public.current_user_id());

-- ─── looks: trip linkage ──────────────────────────────────────────────────────

-- Existing home-feed query filters trip_id IS NULL, so trip outfits stay out of
-- the daily feed. When a trip is deleted, its associated looks cascade away.

alter table public.looks
  add column if not exists trip_id uuid references public.trips (id) on delete cascade;

create index if not exists looks_trip_id_idx on public.looks (trip_id);
