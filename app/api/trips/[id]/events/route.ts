import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import type { RealLook, RealLookSlot } from "@/lib/looks";
import {
  DAVID_SYSTEM,
  PREFS_SELECT,
  UserPrefs,
  WardrobeRow,
  buildCandidatePool,
  buildPrefSummary,
  condenseForPrompt,
  getSeasonForDate,
  pickAlts,
  toSlotItem,
} from "@/lib/stylist-core";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase  = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const CATHERINE_USER_ID = "00000000-0000-0000-0000-000000000001";
const OWM_KEY = process.env.OPENWEATHER_API_KEY;

// ── time-of-day → Stylist hints ───────────────────────────────────────────────

const TIME_OF_DAY_HINTS: Record<string, string> = {
  morning: "Morning. Cooler than midday; think layered, easy to shed.",
  day:     "Daytime. Peak temperature; comfort and movement matter.",
  evening: "Evening. Temperature dropping; transition piece often appreciated.",
  night:   "Night. Cooler still; usually more polished/social.",
};

// ── weather fetch ─────────────────────────────────────────────────────────────

type WeatherCtx = {
  source: "forecast" | "climatology";
  summary: string;       // human-readable string passed to David
  temp_f?: number;
  condition?: string;
};

/**
 * Fetch weather context for a specific date+location.
 * - Within OWM's 5-day forecast window AND have lat/lon → use real forecast
 * - Otherwise → fall back to climatology (a typical-for-the-season string)
 */
async function fetchWeatherCtx(
  destinationCity: string,
  lat: number | null,
  lon: number | null,
  eventDate: string,
  timeOfDay: string
): Promise<WeatherCtx> {
  const date = new Date(eventDate);
  const now = new Date();
  const daysOut = Math.floor((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const inForecastWindow = daysOut >= 0 && daysOut <= 5;

  if (inForecastWindow && lat != null && lon != null && OWM_KEY) {
    try {
      const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${OWM_KEY}&units=imperial`;
      const res = await fetch(url, { next: { revalidate: 1800 } });
      if (res.ok) {
        const data = await res.json();
        // Find the forecast slot closest to noon on the event date.
        // OWM returns 3-hour slots; we pick the one whose hour is closest to our target.
        const targetHour = timeOfDay === "morning" ? 9
                          : timeOfDay === "day"     ? 13
                          : timeOfDay === "evening" ? 18
                          : /* night */               21;
        const isoDate = eventDate; // YYYY-MM-DD
        type Slot = { dt_txt: string; main: { temp: number }; weather: Array<{ main: string }> };
        const slots: Slot[] = (data.list ?? []).filter((s: Slot) => s.dt_txt.startsWith(isoDate));
        if (slots.length > 0) {
          const closest = slots.reduce<Slot>((best, s) => {
            const h = parseInt(s.dt_txt.slice(11, 13), 10);
            const bH = parseInt(best.dt_txt.slice(11, 13), 10);
            return Math.abs(h - targetHour) < Math.abs(bH - targetHour) ? s : best;
          }, slots[0]);
          const temp = Math.round(closest.main?.temp ?? 0);
          const condition = closest.weather?.[0]?.main ?? "Clear";
          return {
            source: "forecast",
            summary: `${destinationCity} on ${eventDate} (${timeOfDay}): ${temp}°F, ${condition.toLowerCase()}.`,
            temp_f: temp,
            condition,
          };
        }
      }
    } catch {
      // fall through to climatology
    }
  }

  // Climatology fallback — coarse but useful for the Stylist
  const season = getSeasonForDate(date);
  const climSummary = `${destinationCity}, expected ${season} conditions on ${eventDate} (${timeOfDay}). Forecast not yet available; David should plan for typical ${season} weather at this destination.`;
  return { source: "climatology", summary: climSummary };
}

// ── per-event prompt: ONE outfit, event-driven ────────────────────────────────

const buildEventPrompt = (
  items: object[],
  season: string,
  ctx: { destinationCity: string; eventDate: string; timeOfDay: string; occasion: string; notes: string | null; weatherSummary: string; tripOccasion: string | null }
) => `You are dressing Catherine for a SPECIFIC event. Let the event drive every decision.

THE EVENT — this is the loudest signal in this prompt:
Event:  ${ctx.occasion}${ctx.notes ? `\nCatherine's note: ${ctx.notes}` : ""}${ctx.tripOccasion ? `\nTrip vibe: ${ctx.tripOccasion}` : ""}

CONTEXT — refines the answer, doesn't override it:
Where:   ${ctx.destinationCity}
When:    ${ctx.eventDate}, ${ctx.timeOfDay} — ${TIME_OF_DAY_HINTS[ctx.timeOfDay] ?? ""}
Weather: ${ctx.weatherSummary}
Season:  ${season}

Before picking anything, picture Catherine actually at this event:
  - What's underfoot — concrete, gravel, hardwood, marble?
  - Is she sitting still, walking, or standing for hours?
  - Indoor air conditioning or outdoor sun and wind?
  - Is everyone else dressed up or down?
  - Is comfort or polish doing more of the work?

Worked examples of how the event should change the pick:
  • "Cubs game" / outdoor sports → outdoor stadium, hours of walking + standing, sun and wind, casual vibe. Pick: comfortable closed-toe shoes she can stand in, layer for late-innings cool-down, casual fabrics. NOT: heels, suede, dry-clean only, fragile jewelry.
  • "Dinner at Michelin steakhouse" → polished evening, indoor, low-light, deliberate. Pick: refined silhouette, considered jewelry, leather shoes, evening-appropriate fabric. NOT: athleisure, casual sneakers, wrinkled fabric, anything athleisure-adjacent.
  • "Museum walk" → midweight, hours of standing on hard floors, layered for changing gallery climate. Pick: comfortable shoes, structured-but-soft layers, nothing restrictive. NOT: heels, statement loud jewelry, anything that screams.
  • "Friend's wedding" (guest) → polished, joyful, weather-appropriate, NEVER white if the bride might be in white. Pick: dress or polished separates, dressy shoes, considered layer.
  • "Casual day exploring [city]" → walking shoes, layers for café-to-street temp swings, nothing fussy. Pick: comfortable, easy, looks-like-she-belongs.

The event name and notes outweigh season, weather, and time-of-day. Those refine — they don't override what kind of event you're dressing for.

Catherine's available pieces (${items.length} items, pre-filtered by season + recency):
${JSON.stringify(items)}

Return ONE outfit as a JSON array containing exactly one object — no markdown, no extra prose.

The outfit MUST have EXACTLY 4 slots:
  Standard: Top, Bottom, Shoes, Layer (outerwear OR accessory)
  Dress:    Dress, Shoes, Layer (outerwear), Accessory

For EACH slot, provide:
  - "item_id": your primary recommendation
  - "alt_item_ids": exactly 2 alternative item_ids from the same category that would ALSO work for THIS event if Catherine wanted a different vibe in that slot. Alts are real picks you'd stand behind, not filler.

[
  {
    "name": "short evocative name (2-3 words)",
    "tag": "one occasion tag matching the event's energy",
    "david_note": "8-15 words. Reference the EVENT specifically — the place, the type of evening, the activity. Not generic.",
    "closing_line": "one sentence, personal to Catherine, oriented toward this event",
    "slots": [
      { "label": "Top",    "item_id": "<uuid>", "alt_item_ids": ["<uuid>", "<uuid>"] },
      { "label": "Bottom", "item_id": "<uuid>", "alt_item_ids": ["<uuid>", "<uuid>"] },
      { "label": "Shoes",  "item_id": "<uuid>", "alt_item_ids": ["<uuid>", "<uuid>"] },
      { "label": "Layer",  "item_id": "<uuid>", "alt_item_ids": ["<uuid>", "<uuid>"] }
    ]
  }
]

Rules:
- Every item_id and every alt_item_ids entry must be a real uuid from the list above
- Each alt_item_ids entry must be the SAME CATEGORY as that slot's primary (a Top's alts must also be tops)
- No uuid may appear twice in this outfit (no primary equals its own alt; no alt repeats across slots)
- Exactly 4 slots — pad with best available items if needed
- Shoes (category: shoes) must appear in every outfit
- Pick weather-appropriate fabrics and layers
- The david_note must specifically reference this event, not be generic`;

// ── handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: tripId } = await params;
    const body = await req.json();
    const { event_date, time_of_day, occasion, notes } = body ?? {};

    // Validate
    if (!event_date) return NextResponse.json({ error: "event_date is required" }, { status: 400 });
    if (!time_of_day || !["morning", "day", "evening", "night"].includes(time_of_day)) {
      return NextResponse.json({ error: "time_of_day must be one of: morning, day, evening, night" }, { status: 400 });
    }
    if (!occasion || typeof occasion !== "string") {
      return NextResponse.json({ error: "occasion is required" }, { status: 400 });
    }

    // 1. Load the trip
    const { data: trip, error: tripErr } = await supabase
      .from("trips")
      .select("id,destination_city,destination_lat,destination_lon,occasion,start_date,end_date")
      .eq("id", tripId)
      .eq("user_id", CATHERINE_USER_ID)
      .single();

    if (tripErr || !trip) {
      return NextResponse.json({ error: "Trip not found" }, { status: 404 });
    }

    // 2. Fetch weather context
    const weatherCtx = await fetchWeatherCtx(
      trip.destination_city,
      trip.destination_lat,
      trip.destination_lon,
      event_date,
      time_of_day
    );

    // 3. Fetch wardrobe (active items only)
    const { data: rows, error: dbErr } = await supabase
      .from("wardrobe_items")
      .select("id,name,category,subcategory,photo_url,thumbnail_url,colors,occasion_tags,formality,season_fit,pattern,fabric,last_worn_at,fit_note")
      .eq("user_id", CATHERINE_USER_ID)
      .eq("is_active", true)
      .order("last_worn_at", { ascending: true, nullsFirst: true });

    if (dbErr) throw new Error(`DB: ${dbErr.message}`);
    const allItems = (rows ?? []) as WardrobeRow[];
    if (allItems.length < 8) {
      return NextResponse.json({ error: "Not enough wardrobe items yet" }, { status: 422 });
    }

    // 4. Fetch prefs + build summary
    const { data: prefsRow } = await supabase
      .from("user_preferences")
      .select(PREFS_SELECT)
      .eq("user_id", CATHERINE_USER_ID)
      .single();

    const prefSummary = buildPrefSummary((prefsRow ?? null) as UserPrefs | null);
    const systemPrompt = prefSummary
      ? `${DAVID_SYSTEM}\n\nCatherine's current style settings: ${prefSummary}`
      : DAVID_SYSTEM;

    // 5. Build candidate pool (using event-date season)
    const season = getSeasonForDate(new Date(event_date));
    const candidates = buildCandidatePool(allItems, season);
    const condensed  = candidates.map(condenseForPrompt);

    // 6. Call Claude — one outfit, with David-curated alts per slot
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{
        role: "user",
        content: buildEventPrompt(condensed, season, {
          destinationCity: trip.destination_city,
          eventDate:       event_date,
          timeOfDay:       time_of_day,
          occasion,
          notes:           notes ?? null,
          weatherSummary:  weatherCtx.summary,
          tripOccasion:    trip.occasion ?? null,
        }),
      }],
    });

    const rawText = msg.content[0].type === "text" ? msg.content[0].text : "[]";
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("Claude returned no JSON array");

    const claudeLooks = JSON.parse(jsonMatch[0]) as Array<{
      name: string; tag: string; david_note: string; closing_line: string;
      slots: Array<{ label: string; item_id: string; alt_item_ids?: string[] }>;
    }>;
    const cl = claudeLooks[0];
    if (!cl) throw new Error("Claude returned no look");

    // 7. Resolve items + David-curated alts (with rule-based padding if David undershoots)
    const candidateMap = new Map(candidates.map((r) => [r.id, r]));
    const usedIds      = new Set<string>();
    const slots: RealLookSlot[] = [];

    function resolveAlts(primary: WardrobeRow, claudeAltIds: string[] | undefined): WardrobeRow[] {
      const alts: WardrobeRow[] = [];
      // David's curated picks first — validated for category + uniqueness
      for (const altId of (claudeAltIds ?? []).slice(0, 3)) {
        const altRow = candidateMap.get(altId);
        if (!altRow) continue;                              // hallucinated id
        if (altRow.category !== primary.category) continue; // wrong category
        if (altRow.id === primary.id) continue;             // same as primary
        if (alts.some((a) => a.id === altRow.id)) continue; // dup alt
        if (usedIds.has(altRow.id)) continue;               // used elsewhere
        alts.push(altRow);
        if (alts.length === 2) break;
      }
      // Pad with rule-based alts if David gave fewer than 2
      if (alts.length < 2) {
        const exclude = new Set([...usedIds, primary.id, ...alts.map((a) => a.id)]);
        const ruleBased = pickAlts(primary.category, exclude, allItems, 2 - alts.length);
        alts.push(...ruleBased);
      }
      return alts;
    }

    for (const s of (cl.slots ?? []).slice(0, 4)) {
      const row = candidateMap.get(s.item_id);
      if (!row || usedIds.has(row.id)) continue;
      usedIds.add(row.id);
      const alts = resolveAlts(row, s.alt_item_ids);
      alts.forEach((a) => usedIds.add(a.id));
      slots.push({
        slot: s.label,
        items: [toSlotItem(row, s.label), ...alts.map((a) => toSlotItem(a, s.label))],
      });
    }

    // Pad to 4 slots if needed
    const FALLBACK_LABELS = ["Top", "Bottom", "Shoes", "Layer"];
    if (slots.length > 0 && slots.length < 4) {
      const usedLabels = new Set(slots.map((s) => s.slot));
      const missingLabels = FALLBACK_LABELS.filter((l) => !usedLabels.has(l));
      const catMap: Record<string, string> = {
        Top: "tops", Bottom: "bottoms", Shoes: "shoes", Layer: "outerwear",
        Dress: "dresses", Accessory: "accessories",
      };
      for (const label of missingLabels) {
        const cat = catMap[label];
        if (!cat) continue;
        const fallback = allItems.find((r) => r.category === cat && !usedIds.has(r.id));
        if (!fallback) continue;
        usedIds.add(fallback.id);
        const alts = resolveAlts(fallback, undefined);
        alts.forEach((a) => usedIds.add(a.id));
        slots.push({
          slot: label,
          items: [toSlotItem(fallback, label), ...alts.map((a) => toSlotItem(a, label))],
        });
        if (slots.length === 4) break;
      }
    }

    if (slots.length < 3) throw new Error("Could not resolve enough slots");

    // 8. Persist look (with trip_id) and event (with look_id).
    //    slot_alts in stylist_raw is index-aligned with item_ids — frontend
    //    uses it to populate the per-slot swap modal with curated picks.
    const itemIds = slots.map((s) => s.items[0].item_id);
    const slotAlts = slots.map((s) => s.items.slice(1).map((it) => it.item_id));
    const { data: insertedLook, error: lookErr } = await supabase
      .from("looks")
      .insert({
        user_id:     CATHERINE_USER_ID,
        trip_id:     tripId,
        name:        cl.name ?? "The Edit",
        theme:       cl.tag  ?? "Casual Cool",
        item_ids:    itemIds,
        occasion:    occasion,
        date:        event_date,
        weather_ctx: weatherCtx,
        stylist_raw: {
          david_note:   cl.david_note,
          closing_line: cl.closing_line,
          season,
          time_of_day,
          slot_alts:    slotAlts,
        },
      })
      .select("id")
      .single();

    if (lookErr) throw new Error(`looks insert: ${lookErr.message}`);

    const { data: insertedEvent, error: eventErr } = await supabase
      .from("trip_events")
      .insert({
        trip_id:     tripId,
        user_id:     CATHERINE_USER_ID,
        event_date,
        time_of_day,
        occasion,
        notes:       notes ?? null,
        look_id:     insertedLook.id,
        weather_ctx: weatherCtx,
      })
      .select()
      .single();

    if (eventErr) throw new Error(`trip_events insert: ${eventErr.message}`);

    const resolvedLook: RealLook = {
      look_id:      insertedLook.id,
      name:         cl.name ?? "The Edit",
      tag:          cl.tag  ?? "Casual Cool",
      david_note:   cl.david_note   ?? "",
      closing_line: cl.closing_line ?? "",
      slots,
    };

    return NextResponse.json({ event: insertedEvent, look: resolvedLook });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[trips/events POST]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
