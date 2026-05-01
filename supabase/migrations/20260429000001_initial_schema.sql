-- David's Apothecary — v1 initial schema
-- Catherine's hard-coded UUID: 00000000-0000-0000-0000-000000000001
-- RLS is gated through current_user_id() so the v2 auth swap is a one-function change.

-- Helper: returns Catherine's UUID in v1; swap to auth.uid() for multi-user v2
create or replace function public.current_user_id()
returns uuid
language sql stable
as $$
  select coalesce(
    nullif(current_setting('app.current_user_id', true), '')::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid
  );
$$;

-- ─── wardrobe_items ────────────────────────────────────────────────────────────
create table public.wardrobe_items (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default public.current_user_id(),
  created_at     timestamptz not null default now(),

  -- photo
  photo_url      text not null,
  thumbnail_url  text,

  -- tagger output
  category       text not null,          -- e.g. 'tops', 'bottoms', 'shoes', 'outerwear', 'accessories'
  subcategory    text,
  colors         text[] not null default '{}',
  occasion_tags  text[] not null default '{}',   -- e.g. 'casual', 'work', 'evening', 'weekend'
  season_fit     text[] not null default '{}',   -- e.g. 'spring', 'summer', 'fall', 'winter'
  formality      int  not null default 2,        -- 1=casual … 5=formal
  pattern        text,
  fabric         text,
  tagger_raw     jsonb,                          -- full tagger JSON for debugging

  -- display / editorial
  name           text,                           -- e.g. "Navy Blazer"
  brand          text,
  size           text,
  david_note     text,                           -- David's one-line comment shown in wardrobe

  -- wear tracking
  wear_count     int not null default 0,
  last_worn_at   timestamptz,

  is_active      boolean not null default true   -- soft-delete
);

create index on public.wardrobe_items (user_id, category);
create index on public.wardrobe_items (user_id, last_worn_at);
create index on public.wardrobe_items using gin (occasion_tags);
create index on public.wardrobe_items using gin (season_fit);

alter table public.wardrobe_items enable row level security;
create policy "owner access" on public.wardrobe_items
  using (user_id = public.current_user_id());

-- ─── user_preferences ─────────────────────────────────────────────────────────
create table public.user_preferences (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null unique default public.current_user_id(),
  updated_at      timestamptz not null default now(),

  -- 4 trait sliders (0=low, 1=mid, 2=high)
  boldness        int not null default 1 check (boldness between 0 and 2),
  colour_play     int not null default 1 check (colour_play between 0 and 2),
  edge            int not null default 1 check (edge between 0 and 2),
  classic         int not null default 1 check (classic between 0 and 2),

  -- 6-slot colour palette (hex strings)
  palette         text[] not null default '{}',

  -- correction chips and learnings
  corrections     text[] not null default '{}',
  recent_learnings jsonb[] not null default '{}',

  -- stylist intensity dial (1=gentle, 5=push me)
  style_push      int not null default 3 check (style_push between 1 and 5),

  -- free-text scratchpad visible only to David
  notes_freetext  text
);

alter table public.user_preferences enable row level security;
create policy "owner access" on public.user_preferences
  using (user_id = public.current_user_id());

-- seed Catherine's default preferences row
insert into public.user_preferences (user_id)
values ('00000000-0000-0000-0000-000000000001')
on conflict (user_id) do nothing;

-- ─── looks ────────────────────────────────────────────────────────────────────
create table public.looks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default public.current_user_id(),
  created_at   timestamptz not null default now(),
  date         date not null default current_date,

  name         text,                  -- e.g. "Tuesday Morning"
  theme        text,                  -- David's one-line theme description
  item_ids     uuid[] not null,       -- ordered list of wardrobe_items
  occasion     text,
  weather_ctx  jsonb,                 -- snapshot of weather at generation time
  stylist_raw  jsonb                  -- full Stylist response for debugging
);

create index on public.looks (user_id, date);

alter table public.looks enable row level security;
create policy "owner access" on public.looks
  using (user_id = public.current_user_id());

-- ─── look_decisions ───────────────────────────────────────────────────────────
create table public.look_decisions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default public.current_user_id(),
  look_id    uuid not null references public.looks (id) on delete cascade,
  decided_at timestamptz not null default now(),
  action     text not null check (action in ('pass', 'wear', 'loved'))
);

create index on public.look_decisions (user_id, decided_at);

alter table public.look_decisions enable row level security;
create policy "owner access" on public.look_decisions
  using (user_id = public.current_user_id());

-- trigger: bump wear_count on the contained items when action = 'wear'
create or replace function public.on_look_worn()
returns trigger language plpgsql as $$
begin
  if new.action = 'wear' then
    update public.wardrobe_items
    set wear_count   = wear_count + 1,
        last_worn_at = new.decided_at
    where id = any(
      select unnest(item_ids) from public.looks where id = new.look_id
    );
  end if;
  return new;
end;
$$;

create trigger look_worn_trigger
after insert on public.look_decisions
for each row execute function public.on_look_worn();

-- ─── chat_sessions ────────────────────────────────────────────────────────────
create table public.chat_sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default public.current_user_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  messages   jsonb[] not null default '{}',   -- [{role, content, ts}]
  context    jsonb                            -- weather + occasion snapshot for this session
);

create index on public.chat_sessions (user_id, updated_at);

alter table public.chat_sessions enable row level security;
create policy "owner access" on public.chat_sessions
  using (user_id = public.current_user_id());
