import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const CATHERINE_USER_ID = "00000000-0000-0000-0000-000000000001";
const OWM_KEY = process.env.OPENWEATHER_API_KEY;

/**
 * Resolve a city name to (lat, lon) via OWM geocoding.
 * Returns null if the city can't be resolved — we still create the trip,
 * just without coordinates. Weather lookups will fall back to city-name search.
 */
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

// ── GET — list trips ──────────────────────────────────────────────────────────

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("trips")
      .select("id,name,destination_city,start_date,end_date,occasion,created_at")
      .eq("user_id", CATHERINE_USER_ID)
      .order("start_date", { ascending: true });

    if (error) throw new Error(error.message);
    return NextResponse.json({ trips: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── POST — create a trip ──────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, destination_city, start_date, end_date, occasion } = body ?? {};

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    if (!destination_city || typeof destination_city !== "string") {
      return NextResponse.json({ error: "destination_city is required" }, { status: 400 });
    }
    if (!start_date || !end_date) {
      return NextResponse.json({ error: "start_date and end_date are required" }, { status: 400 });
    }
    if (new Date(start_date) > new Date(end_date)) {
      return NextResponse.json({ error: "start_date must be on or before end_date" }, { status: 400 });
    }

    // Resolve city to lat/lon (best-effort, don't fail trip creation if geocoding flakes)
    const geo = await geocode(destination_city);

    const { data, error } = await supabase
      .from("trips")
      .insert({
        user_id:          CATHERINE_USER_ID,
        name:             name.trim(),
        destination_city: geo?.resolved_name ?? destination_city.trim(),
        destination_lat:  geo?.lat ?? null,
        destination_lon:  geo?.lon ?? null,
        start_date,
        end_date,
        occasion:         occasion ?? null,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ trip: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[trips POST]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
