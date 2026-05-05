import { NextRequest, NextResponse } from "next/server";

const OWM_KEY = process.env.OPENWEATHER_API_KEY;

const WEATHER_EMOJI: Record<string, string> = {
  Clear:        "☀️",
  Clouds:       "☁️",
  Rain:         "🌧",
  Drizzle:      "🌦",
  Thunderstorm: "⛈",
  Snow:         "🌨",
  Mist:         "🌫",
  Fog:          "🌫",
  Haze:         "🌫",
};

export async function GET(req: NextRequest) {
  if (!OWM_KEY) {
    return NextResponse.json({ error: "Weather API key not configured" }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const lat = searchParams.get("lat");
  const lon = searchParams.get("lon");
  const q   = searchParams.get("q"); // city name — e.g. "Paris" or "Miami, US"

  // Build OWM query — lat/lon takes priority; city name is the fallback
  let owmQuery: string;
  if (lat && lon) {
    owmQuery = `lat=${lat}&lon=${lon}`;
  } else if (q) {
    owmQuery = `q=${encodeURIComponent(q)}`;
  } else {
    return NextResponse.json({ error: "Provide lat+lon or q (city name)" }, { status: 400 });
  }

  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?${owmQuery}&appid=${OWM_KEY}&units=imperial`;
    const res = await fetch(url, { next: { revalidate: 1800 } }); // cache 30 min

    if (!res.ok) {
      // OWM returns 404 for unknown city names — surface a friendlier message
      if (res.status === 404) {
        return NextResponse.json({ error: "City not found" }, { status: 404 });
      }
      throw new Error(`OWM ${res.status}`);
    }

    const data = await res.json();

    const condition = data.weather?.[0]?.main ?? "Clear";
    const emoji     = WEATHER_EMOJI[condition] ?? "🌡";
    const temp      = Math.round(data.main?.temp ?? 0);
    const city      = data.name ?? q ?? "";

    return NextResponse.json({ emoji, condition, temp, city });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
