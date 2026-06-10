import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { RealLook } from "@/lib/looks";

/**
 * Phase C1 — Saved Looks API.
 *
 *   POST   /api/saved-looks   body: { look_id, note? }  → upsert a save
 *   GET    /api/saved-looks                              → list, newest-first, hydrated like RealLook
 *   DELETE /api/saved-looks?look_id=…                    → unsave
 *
 * The GET hydration mirrors how generate-looks resolves slots so the Saved
 * page can render look cards using the same component (LookCard, swipe-card,
 * etc.) without a new shape on the client.
 *
 * Auth: hardcoded Catherine for v1 (same as every other route). When auth
 * lands in Step 7, swap CATHERINE_USER_ID for a session-derived user_id.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CATHERINE_USER_ID = "00000000-0000-0000-0000-000000000001";

// ── POST: save a look (idempotent, upsert by user+look) ───────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const lookId: unknown = body?.look_id;
    const noteRaw: unknown = body?.note;

    if (typeof lookId !== "string" || !lookId) {
      return NextResponse.json({ error: "look_id required" }, { status: 400 });
    }
    const note = typeof noteRaw === "string" ? noteRaw.trim() || null : null;

    const { data, error } = await supabase
      .from("saved_looks")
      .upsert(
        { user_id: CATHERINE_USER_ID, look_id: lookId, note },
        { onConflict: "user_id,look_id" }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: `DB: ${error.message}` }, { status: 500 });
    }
    return NextResponse.json({ saved: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[saved-looks POST]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── DELETE: unsave (idempotent — no error if nothing to remove) ───────────────

export async function DELETE(req: NextRequest) {
  try {
    const lookId = req.nextUrl.searchParams.get("look_id");
    if (!lookId) {
      return NextResponse.json({ error: "look_id query param required" }, { status: 400 });
    }
    const { error } = await supabase
      .from("saved_looks")
      .delete()
      .eq("user_id", CATHERINE_USER_ID)
      .eq("look_id", lookId);
    if (error) {
      return NextResponse.json({ error: `DB: ${error.message}` }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[saved-looks DELETE]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── GET: list saved looks, newest-first, hydrated with full item details ──────

type LookRow = {
  id: string;
  name: string | null;
  theme: string | null;
  item_ids: string[];
  occasion: string | null;
  stylist_raw: Record<string, unknown> | null;
};

type WardrobeRow = {
  id: string; name: string | null; category: string;
  subcategory: string | null; photo_url: string;
  thumbnail_url: string | null; colors: string[];
  occasion_tags: string[];
};

export async function GET() {
  try {
    // 1. Get all saved rows for Catherine, newest first.
    const { data: savedRows, error: savedErr } = await supabase
      .from("saved_looks")
      .select("id, look_id, saved_at, note")
      .eq("user_id", CATHERINE_USER_ID)
      .order("saved_at", { ascending: false });

    if (savedErr) {
      return NextResponse.json({ error: `DB: ${savedErr.message}` }, { status: 500 });
    }
    if (!savedRows || savedRows.length === 0) {
      return NextResponse.json({ saved: [] });
    }

    const lookIds = savedRows.map((r) => r.look_id);

    // 2. Hydrate the looks themselves.
    const { data: lookRows, error: lookErr } = await supabase
      .from("looks")
      .select("id, name, theme, item_ids, occasion, stylist_raw")
      .in("id", lookIds);

    if (lookErr) {
      return NextResponse.json({ error: `DB: ${lookErr.message}` }, { status: 500 });
    }
    const lookMap = new Map<string, LookRow>((lookRows ?? []).map((r) => [r.id, r as LookRow]));

    // 3. Hydrate the items used in those looks.
    const allItemIds = Array.from(
      new Set(
        (lookRows ?? []).flatMap((l) => (l.item_ids as string[]) ?? [])
      )
    );
    const { data: itemRows, error: itemErr } = await supabase
      .from("wardrobe_items")
      .select("id, name, category, subcategory, photo_url, thumbnail_url, colors, occasion_tags")
      .in("id", allItemIds.length ? allItemIds : ["00000000-0000-0000-0000-000000000000"]);

    if (itemErr) {
      return NextResponse.json({ error: `DB: ${itemErr.message}` }, { status: 500 });
    }
    const itemMap = new Map<string, WardrobeRow>(
      (itemRows ?? []).map((r) => [r.id, r as WardrobeRow])
    );

    // 4. Build the response — same shape as RealLook so the Saved page can
    //    reuse the home-page LookCard rendering.
    const saved = savedRows.map((s) => {
      const look = lookMap.get(s.look_id);
      if (!look) {
        return { saved_id: s.id, look_id: s.look_id, saved_at: s.saved_at, note: s.note, missing: true };
      }
      const stylistRaw = (look.stylist_raw ?? {}) as {
        slot_labels?: string[]; closing_line?: string; david_note?: string; season?: string;
      };
      const labels = stylistRaw.slot_labels ?? ["Top", "Bottom", "Shoes", "Layer"];
      const realLook: RealLook = {
        look_id:      look.id,
        name:         look.name ?? "Untitled",
        tag:          look.theme ?? look.occasion ?? "Saved",
        david_note:   stylistRaw.david_note ?? "",
        closing_line: stylistRaw.closing_line ?? "",
        slots: (look.item_ids ?? []).map((id, i) => {
          const slotLabel = labels[i] ?? `Slot ${i + 1}`;
          const item = itemMap.get(id);
          return {
            slot:  slotLabel,
            items: item
              ? [{
                  slot:          slotLabel,
                  item_id:       item.id,
                  name:          item.name ?? item.category,
                  category:      item.category,
                  photo_url:     item.photo_url,
                  thumbnail_url: item.thumbnail_url,
                  colors:        item.colors,
                }]
              : [],
          };
        }),
      };
      return {
        saved_id: s.id,
        saved_at: s.saved_at,
        note:     s.note,
        look:     realLook,
      };
    });

    return NextResponse.json({ saved });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[saved-looks GET]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
