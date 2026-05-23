-- Phase B1a — Catherine's tape measurements
--
-- Adds four self-measured body dimensions to user_preferences so David can
-- reason about garment fit numerically (and so future garment-measurement
-- features have something to compare against).
--
-- Units: inches, to match the format Catherine already uses for height
-- ("5'7"") and waist_size ("28 / size 8"). Stored as numeric(5,1) so values
-- like 38.5 are preserved. All nullable — Catherine can fill any subset.
--
-- Safe to re-run (uses if not exists).

alter table public.user_preferences
  add column if not exists shoulder_in numeric(5,1),
  add column if not exists bust_in     numeric(5,1),
  add column if not exists hip_in      numeric(5,1),
  add column if not exists inseam_in   numeric(5,1);

comment on column public.user_preferences.shoulder_in is 'Across-back shoulder width, point-to-point at top of shoulders (inches).';
comment on column public.user_preferences.bust_in     is 'Bust circumference at fullest point, tape level all around (inches).';
comment on column public.user_preferences.hip_in      is 'Hip circumference at fullest point, usually 7-9" below natural waist (inches).';
comment on column public.user_preferences.inseam_in   is 'Inseam from crotch seam to ankle on inside of leg (inches).';
