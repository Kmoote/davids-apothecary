# Session 13 Handoff — Phase C1: Vibe-prompt + Save-an-outfit

**Date:** 2026-06-09
**What shipped:** The last two of Catherine's five v1.2 asks, in one bundled feature push:
1. **Vibe-prompt for the day** — a text input on home: *"Today I want to feel…"* Submits → fresh look generation with the vibe folded into David's prompt.
2. **Save-an-outfit** — heart icon on each swipe card → look lands in a new **Saved** tab (replaces the Inspo stub in the bottom nav).

After this push, the entire v1.2 ask list is shipped: body-fit, regenerate, anchor-item, vibe, save. The Catherine design session can now reimagine the layout around a stable feature set.

## Files this session

```
A supabase/migrations/20260609000001_phase_c1_saved_looks.sql     (saved_looks table + index)
A app/api/saved-looks/route.ts                                    (POST/GET/DELETE for saved looks; GET hydrates as RealLook)
A app/(app)/saved/page.tsx                                        (new Saved tab — 2×2 grid of saved looks + empty state)
M app/api/generate-looks/route.ts                                 (?vibe= query param, cache-bypass when set, persisted on stylist_raw.vibe)
M app/(app)/page.tsx                                              (Today's Vibe input above the carousel; calls /api/generate-looks?vibe=)
M app/swipe/page.tsx                                              (heart icon + savedLookIds state + toggleSave optimistic UI)
M components/BottomNav.tsx                                        (Inspo → Saved; Inspo stub still reachable at /inspo)
A HANDOFF-session-13.md                                           (this file)
```

`npx tsc --noEmit` clean.

## Deploy steps (in order)

### 1. Apply the migration in Supabase Studio

SQL Editor → New Query → paste:

```sql
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
```

Verify:

```sql
select count(*) from saved_looks;
-- expect 0
```

### 2. Commit + push from your terminal

```bash
cd ~/Desktop/FieldWorks/clients/David\'s\ Apothecary/davids-apothecary
git add -A
git commit -m "feat(c1): vibe-prompt for the day + save-an-outfit (closes v1.2 asks)"
git push origin main
```

GitHub Actions deploys in ~2 minutes.

### 3. Smoke test

Once Netlify reports Published:

- **Vibe-prompt:** open `/`, type "sharp and confident" in the Today's Vibe field, hit Set → loading skeleton appears → 3 fresh looks load. Open the Stylist log (Netlify Function logs) and confirm the line `[generate-looks] claude=… weather=… refresh=… vibe=yes` appears. (If logs say `vibe=no` something didn't wire.)
- **Save flow:** open `/swipe`, tap the ♡ in the bottom-right of the look name strip → it fills + turns coral. Switch to the Saved tab in the bottom nav — that outfit should be there. Tap **♥ Remove** → it disappears.
- **Empty state:** go to Saved before saving anything → expect the *"Nothing saved yet"* placeholder.
- **Bottom nav:** confirm Inspo is gone, Saved is in its place with a ♡ icon. (Inspo page still reachable directly at `/inspo` — left intact for now.)

## What changed in David's mouth

When Catherine sets a vibe, the Stylist's prompt now includes:

> *Catherine's vibe for today: "sharp and confident". Use this as a soft influence on mood, color confidence, and silhouette — but still respect occasion, weather, and her preferences. Don't quote the vibe in your david_note; let it show in the picks.*

Hopefully this produces noticeably different look selection without David ever saying "based on your vibe…" Watch the first few outputs — if he keeps quoting the vibe verbatim, tighten the prompt language.

## Architecture notes

- **Vibe storage:** persisted on `looks.stylist_raw.vibe` so any look generated with a vibe carries it forward in the cache (next read of the same day with the same vibe still hits the DB cache via `loadTodaysLooks`). Setting a *different* vibe still bypasses the cache and writes a new set of looks.
- **Save semantics:** `saved_looks` is orthogonal to `look_decisions`. Catherine can save and pass the same outfit. She can save and wear the same outfit. The unique (user_id, look_id) constraint makes the heart toggle idempotent.
- **No new env vars.** Reuses everything already in place.
- **No RLS changes.** `saved_looks` is anon-readable for now per the existing project posture (same as other Catherine tables). Tighten when Step 7 (auth + RLS) lands.

## What this does NOT do yet

- **Notes on save** — Catherine can't add a "for Sarah's wedding" note from the swipe page in this version. The `note` column is in the schema; a future enhancement adds an edit UI on the Saved tab card. Half-day add.
- **Vibe history** — there's no view of "what vibes have I tried." Could log to a `user_preferences.vibe_history` array later if she finds it useful.
- **Vibe chip presets** — text input only for v1, per our decision. Learn what she actually types before suggesting words.
- **Anchor-mode + save** — saving works on anchor-mode looks too (same look_id, same heart). No special handling needed.

## After this is live, every Catherine v1.2 ask is shipped

| Ask | Status |
|---|---|
| Body-fit awareness | ✅ B1a + B1b |
| Reject-all-3 → regenerate | ✅ c58d842 |
| Anchor-item Stylist | ✅ 202b5c9 |
| **Vibe-prompt for the day** | ✅ **This session** |
| **Save-an-outfit** | ✅ **This session** |

Time for the Claude Design + Catherine reimagining session you outlined. The product surface is now feature-complete relative to v1.2; the only thing missing is the IA pass to make it feel cohesive.
