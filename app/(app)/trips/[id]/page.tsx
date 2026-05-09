"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase, CATHERINE_USER_ID } from "@/lib/supabase";
import { toThumbUrl } from "@/lib/looks";
import { DALogo } from "@/components/DALogo";

// ─── types ────────────────────────────────────────────────────────────────────

type Trip = {
  id: string;
  name: string;
  destination_city: string;
  destination_lat: number | null;
  destination_lon: number | null;
  start_date: string;
  end_date: string;
  occasion: string | null;
};

type WardrobeItem = {
  id: string;
  name: string | null;
  category: string;
  photo_url: string;
  thumbnail_url: string | null;
  colors: string[];
};

type LookRow = {
  id: string;
  name: string;
  theme: string;
  item_ids: string[];
  stylist_raw: { david_note?: string; closing_line?: string; season?: string; time_of_day?: string } | null;
};

type TripEvent = {
  id: string;
  trip_id: string;
  event_date: string;
  time_of_day: "morning" | "day" | "evening" | "night";
  occasion: string;
  notes: string | null;
  look_id: string | null;
  weather_ctx: { source: string; summary: string; temp_f?: number; condition?: string } | null;
  look?: LookRow | null;
};

const TIME_OF_DAY_LABELS: Record<string, string> = {
  morning: "Morning",
  day:     "Day",
  evening: "Evening",
  night:   "Night",
};

// ─── styles ───────────────────────────────────────────────────────────────────

const labelStyle = {
  fontFamily: "var(--font-jost), sans-serif",
  fontSize: 9,
  color: "#8a7a6a",
  letterSpacing: "0.1em",
  fontWeight: 500,
  textTransform: "uppercase" as const,
  marginBottom: 10,
};

const fieldLabelStyle = {
  fontFamily: "var(--font-jost), sans-serif",
  fontSize: 10,
  color: "#8a7a6a",
  letterSpacing: "0.06em",
  fontWeight: 500,
  textTransform: "uppercase" as const,
  marginBottom: 6,
};

const inputStyle = {
  width: "100%",
  fontFamily: "var(--font-jost), sans-serif",
  fontSize: 13,
  color: "#2a2520",
  background: "#f5f0e8",
  border: "1px solid rgba(42,37,32,0.14)",
  borderRadius: 12,
  padding: "10px 14px",
  outline: "none",
  lineHeight: 1.5,
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  // "2026-05-17" → "Sun, May 17"
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function fmtDateRange(start: string, end: string): string {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const sameMonth = s.getMonth() === e.getMonth();
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return sameMonth
    ? `${s.toLocaleDateString("en-US", opts)} – ${e.getDate()}, ${s.getFullYear()}`
    : `${s.toLocaleDateString("en-US", opts)} – ${e.toLocaleDateString("en-US", opts)}, ${s.getFullYear()}`;
}

// ─── Add-event form ───────────────────────────────────────────────────────────

function AddEventForm({
  tripId,
  startDate,
  endDate,
  onCreated,
}: {
  tripId: string;
  startDate: string;
  endDate: string;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [eventDate, setEventDate] = useState(startDate);
  const [timeOfDay, setTimeOfDay] = useState<"morning" | "day" | "evening" | "night">("day");
  const [occasion, setOccasion] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          width: "100%",
          padding: "12px 0",
          borderRadius: 14,
          background: "transparent",
          color: "#2a2520",
          fontFamily: "var(--font-jost), sans-serif",
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.06em",
          border: "1.5px dashed rgba(42,37,32,0.3)",
          cursor: "pointer",
        }}
      >
        + Add event
      </button>
    );
  }

  async function handleSubmit() {
    if (!occasion.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/trips/${tripId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_date: eventDate,
          time_of_day: timeOfDay,
          occasion: occasion.trim(),
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add event");
      // Reset and close
      setOccasion("");
      setNotes("");
      setOpen(false);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{
      padding: "14px",
      background: "#f5f0e8",
      borderRadius: 14,
      border: "1px solid rgba(42,37,32,0.14)",
      display: "flex",
      flexDirection: "column",
      gap: 12,
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <p style={fieldLabelStyle}>Date</p>
          <input
            type="date"
            value={eventDate}
            min={startDate}
            max={endDate}
            onChange={(e) => setEventDate(e.target.value)}
            style={{ ...inputStyle, background: "#fff" }}
          />
        </div>
        <div>
          <p style={fieldLabelStyle}>Time of day</p>
          <select
            value={timeOfDay}
            onChange={(e) => setTimeOfDay(e.target.value as typeof timeOfDay)}
            style={{ ...inputStyle, background: "#fff" }}
          >
            <option value="morning">Morning</option>
            <option value="day">Day</option>
            <option value="evening">Evening</option>
            <option value="night">Night</option>
          </select>
        </div>
      </div>

      <div>
        <p style={fieldLabelStyle}>Event</p>
        <input
          type="text"
          value={occasion}
          onChange={(e) => setOccasion(e.target.value)}
          placeholder="dinner reservation, museum, casual day…"
          style={{ ...inputStyle, background: "#fff" }}
          autoFocus
        />
      </div>

      <div>
        <p style={fieldLabelStyle}>Notes (optional)</p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="anything specific David should know"
          rows={2}
          style={{ ...inputStyle, background: "#fff", resize: "none" }}
        />
      </div>

      {error && (
        <div style={{
          fontFamily: "var(--font-jost), sans-serif",
          fontSize: 11,
          color: "#7a2a2a",
        }}>{error}</div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => { setOpen(false); setError(null); }}
          disabled={submitting}
          style={{
            flex: 1,
            padding: "10px 0",
            borderRadius: 12,
            background: "transparent",
            color: "#2a2520",
            fontFamily: "var(--font-jost), sans-serif",
            fontSize: 12,
            fontWeight: 500,
            border: "1px solid rgba(42,37,32,0.2)",
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={!occasion.trim() || submitting}
          style={{
            flex: 2,
            padding: "10px 0",
            borderRadius: 12,
            background: !occasion.trim() ? "rgba(42,37,32,0.4)" : "#2a2520",
            color: "#c4a882",
            fontFamily: "var(--font-jost), sans-serif",
            fontSize: 12,
            fontWeight: 600,
            border: "none",
            cursor: !occasion.trim() || submitting ? "not-allowed" : "pointer",
          }}
        >
          {submitting ? "David's thinking…" : "Save & generate outfit"}
        </button>
      </div>
    </div>
  );
}

// ─── Event card ───────────────────────────────────────────────────────────────

function EventCard({
  event,
  itemMap,
  onDelete,
}: {
  event: TripEvent;
  itemMap: Map<string, WardrobeItem>;
  onDelete: (eventId: string) => void;
}) {
  const items = (event.look?.item_ids ?? []).map((id) => itemMap.get(id)).filter(Boolean) as WardrobeItem[];
  const davidNote = event.look?.stylist_raw?.david_note ?? "";

  return (
    <div style={{
      background: "#faf7f2",
      borderRadius: 14,
      border: "1px solid rgba(42,37,32,0.10)",
      padding: 14,
      display: "flex",
      flexDirection: "column",
      gap: 10,
    }}>
      {/* Date + time + occasion */}
      <div className="flex justify-between items-start gap-2">
        <div>
          <p style={{
            fontFamily: "var(--font-jost), sans-serif",
            fontSize: 10,
            color: "#c4a882",
            letterSpacing: "0.08em",
            fontWeight: 600,
            textTransform: "uppercase",
          }}>
            {fmtDate(event.event_date)} · {TIME_OF_DAY_LABELS[event.time_of_day]}
          </p>
          <p style={{
            fontFamily: "var(--font-playfair), serif",
            fontStyle: "italic",
            fontSize: 17,
            color: "#2a2520",
            fontWeight: 600,
            marginTop: 2,
          }}>
            {event.occasion}
          </p>
        </div>
        <button
          onClick={() => onDelete(event.id)}
          aria-label="Delete event"
          style={{
            background: "transparent",
            border: "none",
            color: "#8a7a6a",
            fontSize: 16,
            cursor: "pointer",
            padding: "2px 6px",
          }}
        >
          ×
        </button>
      </div>

      {/* Weather chip */}
      {event.weather_ctx?.summary && (
        <p style={{
          fontFamily: "var(--font-jost), sans-serif",
          fontSize: 10.5,
          color: "#8a7a6a",
          fontStyle: "italic",
          lineHeight: 1.4,
        }}>
          {event.weather_ctx.summary}
        </p>
      )}

      {/* Outfit thumbnails */}
      {items.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
          {items.slice(0, 4).map((item) => (
            <div
              key={item.id}
              style={{
                aspectRatio: "1",
                borderRadius: 8,
                overflow: "hidden",
                background: "#f5f0e8",
                border: "1px solid rgba(42,37,32,0.08)",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={toThumbUrl(item.thumbnail_url ?? item.photo_url) ?? item.photo_url}
                alt={item.name ?? item.category}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </div>
          ))}
        </div>
      ) : (
        <p style={{
          fontFamily: "var(--font-jost), sans-serif",
          fontSize: 12,
          color: "#8a7a6a",
          fontStyle: "italic",
          textAlign: "center",
          padding: "12px 0",
        }}>
          No outfit yet — David is thinking…
        </p>
      )}

      {/* David's note */}
      {davidNote && (
        <p style={{
          fontFamily: "var(--font-jost), sans-serif",
          fontSize: 12.5,
          color: "#2a2520",
          fontStyle: "italic",
          lineHeight: 1.5,
          paddingTop: 4,
          borderTop: "1px solid rgba(42,37,32,0.08)",
        }}>
          “{davidNote}”
        </p>
      )}
    </div>
  );
}

// ─── Packing list ─────────────────────────────────────────────────────────────

function PackingList({
  events,
  itemMap,
}: {
  events: TripEvent[];
  itemMap: Map<string, WardrobeItem>;
}) {
  // Aggregate unique items used across all events with looks
  const usedItems = useMemo(() => {
    const seen = new Set<string>();
    const items: WardrobeItem[] = [];
    for (const ev of events) {
      for (const id of ev.look?.item_ids ?? []) {
        if (!seen.has(id)) {
          const item = itemMap.get(id);
          if (item) {
            seen.add(id);
            items.push(item);
          }
        }
      }
    }
    return items;
  }, [events, itemMap]);

  // Group by category
  const byCategory = useMemo(() => {
    const order = ["tops", "bottoms", "dresses", "outerwear", "shoes", "accessories"];
    const groups: Record<string, WardrobeItem[]> = {};
    for (const it of usedItems) {
      if (!groups[it.category]) groups[it.category] = [];
      groups[it.category].push(it);
    }
    return order
      .filter((cat) => groups[cat]?.length)
      .map((cat) => ({ category: cat, items: groups[cat] }));
  }, [usedItems]);

  if (usedItems.length === 0) return null;

  return (
    <section>
      <p style={labelStyle}>Packing List · {usedItems.length} pieces</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {byCategory.map(({ category, items }) => (
          <div key={category}>
            <p style={{
              fontFamily: "var(--font-jost), sans-serif",
              fontSize: 10,
              color: "#8a7a6a",
              letterSpacing: "0.06em",
              fontWeight: 500,
              textTransform: "capitalize",
              marginBottom: 6,
            }}>
              {category}
            </p>
            <div className="flex gap-2 overflow-x-auto no-scrollbar" style={{ paddingBottom: 4 }}>
              {items.map((item) => (
                <div
                  key={item.id}
                  style={{
                    flexShrink: 0,
                    width: 64,
                    height: 64,
                    borderRadius: 8,
                    overflow: "hidden",
                    background: "#f5f0e8",
                    border: "1px solid rgba(42,37,32,0.10)",
                  }}
                  title={item.name ?? item.category}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={toThumbUrl(item.thumbnail_url ?? item.photo_url) ?? item.photo_url}
                    alt={item.name ?? item.category}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TripDetailPage() {
  const params = useParams();
  const tripId = params.id as string;

  const [trip, setTrip] = useState<Trip | null>(null);
  const [events, setEvents] = useState<TripEvent[]>([]);
  const [items, setItems] = useState<WardrobeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [tripRes, itemsRes] = await Promise.all([
        supabase
          .from("trips")
          .select(`
            id, name, destination_city, destination_lat, destination_lon, start_date, end_date, occasion,
            trip_events (
              id, trip_id, event_date, time_of_day, occasion, notes, look_id, weather_ctx,
              look:looks!look_id (id, name, theme, item_ids, stylist_raw)
            )
          `)
          .eq("id", tripId)
          .eq("user_id", CATHERINE_USER_ID)
          .single(),
        supabase
          .from("wardrobe_items")
          .select("id,name,category,photo_url,thumbnail_url,colors")
          .eq("user_id", CATHERINE_USER_ID)
          .eq("is_active", true),
      ]);

      if (tripRes.error || !tripRes.data) {
        throw new Error(tripRes.error?.message ?? "Trip not found");
      }

      const t = tripRes.data as unknown as Trip & { trip_events: TripEvent[] };
      setTrip({
        id: t.id, name: t.name,
        destination_city: t.destination_city,
        destination_lat: t.destination_lat,
        destination_lon: t.destination_lon,
        start_date: t.start_date, end_date: t.end_date,
        occasion: t.occasion,
      });

      // Sort events chronologically (date asc, then morning < day < evening < night)
      const todOrder = { morning: 0, day: 1, evening: 2, night: 3 };
      const sorted = [...(t.trip_events ?? [])].sort((a, b) => {
        if (a.event_date !== b.event_date) return a.event_date.localeCompare(b.event_date);
        return todOrder[a.time_of_day] - todOrder[b.time_of_day];
      });
      setEvents(sorted);
      setItems((itemsRes.data ?? []) as WardrobeItem[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load trip");
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => { reload(); }, [reload]);

  const itemMap = useMemo(() => new Map(items.map((it) => [it.id, it])), [items]);

  async function handleDeleteEvent(eventId: string) {
    if (!confirm("Remove this event?")) return;
    try {
      const { error } = await supabase
        .from("trip_events")
        .delete()
        .eq("id", eventId)
        .eq("user_id", CATHERINE_USER_ID);
      if (error) throw new Error(error.message);
      reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  return (
    <div className="flex flex-col h-full bg-cream overflow-hidden">
      {/* header */}
      <div
        className="relative texture shrink-0 flex items-center gap-3"
        style={{ background: "#2a2520", padding: "14px 18px" }}
      >
        <DALogo size={44} dark />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 9, color: "#c4a882", letterSpacing: "0.12em", fontWeight: 500, textTransform: "uppercase" }}>
            {trip?.destination_city ?? "Trip"}
          </p>
          <p style={{
            fontFamily: "var(--font-playfair), serif",
            fontStyle: "italic",
            fontWeight: 700,
            fontSize: 20,
            color: "#faf7f2",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {trip?.name ?? "Loading…"}
          </p>
          {trip && (
            <p style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 10, color: "#c4a882", marginTop: 1 }}>
              {fmtDateRange(trip.start_date, trip.end_date)}
            </p>
          )}
        </div>
        <Link
          href="/trips"
          style={{ color: "#c4a882", fontFamily: "var(--font-jost), sans-serif", fontSize: 11, textDecoration: "none" }}
        >
          ← All trips
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar" style={{ padding: "16px 16px 24px", display: "flex", flexDirection: "column", gap: 24 }}>
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <span key={i} className={`dot-${i + 1}`} style={{ width: 6, height: 6, borderRadius: "50%", background: "#c4a882", display: "inline-block" }} />
              ))}
            </div>
          </div>
        ) : error ? (
          <div style={{
            background: "#f7e6e6",
            borderRadius: 12,
            padding: 14,
            fontFamily: "var(--font-jost), sans-serif",
            fontSize: 12.5,
            color: "#7a2a2a",
          }}>
            {error}
          </div>
        ) : trip ? (
          <>
            {/* Packing list */}
            <PackingList events={events} itemMap={itemMap} />

            {/* Events */}
            <section>
              <p style={labelStyle}>Events · {events.length}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {events.map((ev) => (
                  <EventCard
                    key={ev.id}
                    event={ev}
                    itemMap={itemMap}
                    onDelete={handleDeleteEvent}
                  />
                ))}
                <AddEventForm
                  tripId={trip.id}
                  startDate={trip.start_date}
                  endDate={trip.end_date}
                  onCreated={reload}
                />
              </div>
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
