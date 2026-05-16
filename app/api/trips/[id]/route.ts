import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const CATHERINE_USER_ID = "00000000-0000-0000-0000-000000000001";
const OWM_KEY = process.env.OPENWEATHER_API_KEY;

async function geocode(city: string): Promise<{ lat: number; lon: number; resolved_name: string } | null> {
  if (!OWM_KEY) return null;
  try {
    const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(city)}&limit=1&appid=${OWM_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const arr = await res.json();
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const top = arr[0];
    return { lat: top.lat, lon: top.lon, resolved_name: top.name };
  } catch {
    return null;
  }
}

// ── PATCH — edit a trip ───────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Missing trip id" }, { status: 400 });

    const body = await req.json();
    const update: Record<string, unknown> = {};

    if (typeof body.name === "string" && body.name.trim()) {
      update.name = body.name.trim();
    }
    if (typeof body.occasion === "string" || body.occasion === null) {
      update.occasion = body.occasion || null;
    }
    if (typeof body.start_date === "string") update.start_date = body.start_date;
    if (typeof body.end_date === "string")   update.end_date   = body.end_date;

    if (
      update.start_date && update.end_date &&
      new Date(update.start_date as string) > new Date(update.end_date as string)
    ) {
      return NextResponse.json(
        { error: "start_date must be on or before end_date" },
        { status: 400 }
      );
    }

    // If destination_city changed, re-geocode (best-effort)
    if (typeof body.destination_city === "string" && body.destination_city.trim()) {
      const city = body.destination_city.trim();
      const geo = await geocode(city);
      update.destination_city = geo?.resolved_name ?? city;
      update.destination_lat  = geo?.lat ?? null;
      update.destination_lon  = geo?.lon ?? null;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("trips")
      .update(update)
      .eq("id", id)
      .eq("user_id", CATHERINE_USER_ID)
      .select()
      .single();

    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

    return NextResponse.json({ trip: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[trips PATCH]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── DELETE — remove a trip ────────────────────────────────────────────────────
// trip_events are cascade-deleted via the FK. Looks generated for those events
// stay in the looks table but are no longer referenced (look.trip_id is set
// null on cascade) — fine for v1.1; can be GC'd later if needed.

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Missing trip id" }, { status: 400 });

    const { error } = await supabase
      .from("trips")
      .delete()
      .eq("id", id)
      .eq("user_id", CATHERINE_USER_ID);

    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[trips DELETE]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
