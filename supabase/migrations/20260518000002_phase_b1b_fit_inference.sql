-- Phase B1b — VLM fit-inference per wardrobe item
--
-- Adds a single nullable jsonb column to wardrobe_items that holds David's
-- automated fit reasoning for each garment. Populated by a second vision
-- pass (Sonnet 4.6) run on upload or re-tag, in addition to the existing
-- recognition Tagger. Empty until the fit-inference pass runs against an
-- item.
--
-- Shape of the JSON (all fields optional, model fills what it can):
--   {
--     silhouette: string,                    -- "fitted" | "relaxed" | "A-line" | "boxy" | "drapey" | etc
--     ease_1to5: number,                     -- 1=skin-tight, 5=oversized
--     drape_stiffness_1to5: number,          -- 1=fluid, 5=architectural
--     estimated_fabric_weight: string,       -- "light" | "medium" | "heavy"
--     length_category: string | null,        -- "cropped" | "regular" | "long" | "above-knee" | "knee" | "midi" | "maxi" | "ankle"
--     neckline: string | null,               -- for tops/dresses
--     sleeve: string | null,                 -- for tops/dresses
--     body_zones_emphasized: string[],       -- ["shoulders", "waist", "hips", "legs", "bust", "neckline"]
--     confidence: string,                    -- "low" | "medium" | "high"
--     fit_note_for_catherine: string         -- David's voice, 1–2 sentences spoken TO Catherine
--   }
--
-- Safe to re-run (uses if not exists).

alter table public.wardrobe_items
  add column if not exists fit_inference jsonb;

comment on column public.wardrobe_items.fit_inference is
  'David''s automated fit reasoning for this garment — silhouette, ease, drape, length, body zones, confidence, and a one-sentence fit_note_for_catherine. Populated by the fit-inference Tagger (Sonnet 4.6) run alongside the recognition Tagger. Null until that pass runs.';
