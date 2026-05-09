import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const CATHERINE_USER_ID = "00000000-0000-0000-0000-000000000001";

/**
 * PATCH /api/looks/[id]
 * Body: { item_ids: string[] }
 *
 * Used by the trip detail page to swap a single slot's item without
 * regenerating the whole outfit. Validates that every uuid in item_ids
 * exists in Catherine's wardrobe before persisting.
 *
 * Server-side because the supabase anon role doesn't have UPDATE on
 * the looks table (it has SELECT/DELETE for the trip-events flow but
 * not UPDATE on looks).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: lookId } = await params;
    const body = await req.json();
    const itemIds = body?.item_ids;

    if (!Array.isArray(itemIds) || itemIds.some((v) => typeof v !== "string")) {
      return NextResponse.json({ error: "item_ids must be an array of strings" }, { status: 400 });
    }
    if (itemIds.length < 3 || itemIds.length > 4) {
      return NextResponse.json({ error: "item_ids must have 3 or 4 entries" }, { status: 400 });
    }

    // Confirm the look belongs to Catherine before touching it
    const { data: look, error: lookErr } = await supabase
      .from("looks")
      .select("id,user_id,item_ids")
      .eq("id", lookId)
      .eq("user_id", CATHERINE_USER_ID)
      .single();
    if (lookErr || !look) {
      return NextResponse.json({ error: "Look not found" }, { status: 404 });
    }

    // Validate every uuid is a real wardrobe item for Catherine
    const { data: rows, error: itemsErr } = await supabase
      .from("wardrobe_items")
      .select("id")
      .eq("user_id", CATHERINE_USER_ID)
      .in("id", itemIds);
    if (itemsErr) throw new Error(itemsErr.message);
    const validIds = new Set((rows ?? []).map((r) => r.id));
    const allValid = itemIds.every((id) => validIds.has(id));
    if (!allValid) {
      return NextResponse.json({ error: "One or more items not in wardrobe" }, { status: 400 });
    }

    const { error: updErr } = await supabase
      .from("looks")
      .update({ item_ids: itemIds })
      .eq("id", lookId)
      .eq("user_id", CATHERINE_USER_ID);
    if (updErr) throw new Error(updErr.message);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[looks PATCH]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
