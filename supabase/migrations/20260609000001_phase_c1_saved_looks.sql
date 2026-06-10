-- Phase C1 — Save-an-outfit
--
-- Lets Catherine keep a generated look for later — orthogonal to the
-- wear/pass swipe decision. A saved outfit can also have an optional
-- short note (e.g. "for Sarah's wedding", "for the next sunny Saturday")
-- that she edits from the Saved tab.
--
-- Schema choice (per 2026-06-09 decision): a dedicated saved_looks table
-- rather than adding 'save' to look_decisions.action. Save and
-- wear/pass are semantically different — save = "keep this for
-- reference," wear/pass = "today's decision." Catherine should be able
-- to wear AND save the same look, or save a look she didn't wear.
--
-- The unique(user_id, look_id) constraint makes save idempotent — tapping
-- the heart twice can either no-op or be treated as an unsave by the API.
--
-- Safe to re-run: table + index + comments all use IF NOT EXISTS.

create table if not exists public.saved_looks (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null,
  look_id   uuid not null references public.looks(id) on delete cascade,
  saved_at  timestamptz not null default now(),
  note      text,
  unique (user_id, look_id)
);

comment on table  public.saved_looks               is 'Outfits Catherine has saved for reference. Orthogonal to wear/pass.';
comment on column public.saved_looks.note          is 'Optional context Catherine adds — "for Sarah''s wedding", "for the next sunny Saturday", etc.';
comment on column public.saved_looks.saved_at      is 'When she saved this look. Used to sort the Saved view newest-first.';

create index if not exists saved_looks_user_id_saved_at_idx
  on public.saved_looks (user_id, saved_at desc);
