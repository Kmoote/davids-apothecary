-- Phase A1a — Catherine profile expansion + per-item fit notes
--
-- Adds richer self-reported profile fields to user_preferences so David
-- can reason about Catherine's body, color, and style direction.
--
-- Adds fit_note to wardrobe_items so item-specific fit problems
-- (e.g. "white collar shirt doesn't lay nicely") live alongside the item.
--
-- All new columns are nullable / default-empty. Safe to re-run.

-- ─── user_preferences: profile expansion ──────────────────────────────────────

alter table public.user_preferences
  -- the basics
  add column if not exists height          text,
  add column if not exists hair_color      text,
  add column if not exists eye_color       text,
  add column if not exists shoe_size       text,

  -- color story
  add column if not exists skin_tone       text,    -- 'warm' | 'cool' | 'neutral' | freeform
  add column if not exists color_season    text,    -- 'spring' | 'summer' | 'autumn' | 'winter' | null
  add column if not exists favored_colors  text[] not null default '{}',
  add column if not exists avoided_colors  text,

  -- frame & fit
  add column if not exists body_shape              text,
  add column if not exists waist_size              text,
  add column if not exists cup_size                text,
  add column if not exists weight                  text,
  add column if not exists tops_that_fit           text,
  add column if not exists tops_that_almost_fit    text,
  add column if not exists bottoms_that_fit        text,
  add column if not exists bottoms_that_almost_fit text,

  -- style direction
  add column if not exists current_style_words      text[] not null default '{}',
  add column if not exists aspirational_style_words text[] not null default '{}',
  add column if not exists admired_styles           text,
  add column if not exists want_to_try              text,
  add column if not exists not_me                   text,

  -- catch-all
  add column if not exists anything_else text;

-- ─── wardrobe_items: per-item fit note ────────────────────────────────────────

alter table public.wardrobe_items
  add column if not exists fit_note text;
