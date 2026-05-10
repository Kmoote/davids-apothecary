-- Phase A1b — per-item pass_count tracking
--
-- Adds pass_count to wardrobe_items so the candidate-pool builder can
-- deprioritize items Catherine consistently passes on. Sister column
-- to the existing wear_count.
--
-- Extends the existing on_look_worn() trigger to also increment
-- pass_count when action = 'pass'. (Function name kept for backward
-- compat — it now handles both branches.)
--
-- Safe to re-run.

-- ─── wardrobe_items: pass_count column ────────────────────────────────────────

alter table public.wardrobe_items
  add column if not exists pass_count int not null default 0;

-- ─── trigger: handle both wear and pass actions ───────────────────────────────

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
  elsif new.action = 'pass' then
    update public.wardrobe_items
    set pass_count = pass_count + 1
    where id = any(
      select unnest(item_ids) from public.looks where id = new.look_id
    );
  end if;
  return new;
end;
$$;
