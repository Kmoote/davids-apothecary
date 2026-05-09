"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, CATHERINE_USER_ID } from "@/lib/supabase";
import { DALogo } from "@/components/DALogo";

type TripRow = {
  id: string;
  name: string;
  destination_city: string;
  start_date: string;
  end_date: string;
  occasion: string | null;
};

const labelStyle = {
  fontFamily: "var(--font-jost), sans-serif",
  fontSize: 9,
  color: "#8a7a6a",
  letterSpacing: "0.1em",
  fontWeight: 500,
  textTransform: "uppercase" as const,
  marginBottom: 10,
};

function fmtDateRange(start: string, end: string): string {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const sameMonth = s.getMonth() === e.getMonth();
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return sameMonth
    ? `${s.toLocaleDateString("en-US", opts)} – ${e.getDate()}`
    : `${s.toLocaleDateString("en-US", opts)} – ${e.toLocaleDateString("en-US", opts)}`;
}

function categorize(t: TripRow, today: Date): "upcoming" | "current" | "past" {
  const start = new Date(t.start_date + "T00:00:00");
  const end   = new Date(t.end_date   + "T00:00:00");
  if (today < start) return "upcoming";
  if (today > end)   return "past";
  return "current";
}

export default function TripsPage() {
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("trips")
        .select("id,name,destination_city,start_date,end_date,occasion")
        .eq("user_id", CATHERINE_USER_ID)
        .order("start_date", { ascending: true });
      setTrips((data ?? []) as TripRow[]);
      setLoading(false);
    }
    load();
  }, []);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = trips.filter((t) => categorize(t, today) === "upcoming");
  const current  = trips.filter((t) => categorize(t, today) === "current");
  const past     = trips.filter((t) => categorize(t, today) === "past").reverse();

  return (
    <div className="flex flex-col h-full bg-cream overflow-hidden">
      {/* header */}
      <div
        className="relative texture shrink-0 flex items-center gap-3"
        style={{ background: "#2a2520", padding: "14px 18px" }}
      >
        <DALogo size={44} dark />
        <div style={{ flex: 1 }}>
          <p style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 9, color: "#c4a882", letterSpacing: "0.12em", fontWeight: 500, textTransform: "uppercase" }}>Trips</p>
          <p style={{ fontFamily: "var(--font-playfair), serif", fontStyle: "italic", fontWeight: 700, fontSize: 20, color: "#faf7f2" }}>
            On the road
          </p>
        </div>
        <Link
          href="/trips/new"
          style={{
            color: "#c4a882",
            fontFamily: "var(--font-jost), sans-serif",
            fontSize: 11,
            fontWeight: 600,
            textDecoration: "none",
            border: "1px solid #c4a882",
            borderRadius: 12,
            padding: "6px 10px",
          }}
        >
          + New
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar" style={{ padding: "16px 16px 24px", display: "flex", flexDirection: "column", gap: 22 }}>
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <span key={i} className={`dot-${i + 1}`} style={{ width: 6, height: 6, borderRadius: "50%", background: "#c4a882", display: "inline-block" }} />
              ))}
            </div>
          </div>
        ) : trips.length === 0 ? (
          <div style={{
            textAlign: "center",
            padding: "40px 20px",
          }}>
            <p style={{
              fontFamily: "var(--font-playfair), serif",
              fontStyle: "italic",
              fontSize: 17,
              color: "#2a2520",
              marginBottom: 8,
            }}>
              Where are you going?
            </p>
            <p style={{
              fontFamily: "var(--font-jost), sans-serif",
              fontSize: 12.5,
              color: "#8a7a6a",
              lineHeight: 1.5,
              marginBottom: 18,
            }}>
              Plan your outfits before you pack. David picks each one based on weather, time of day, and the event.
            </p>
            <Link
              href="/trips/new"
              style={{
                display: "inline-block",
                padding: "11px 22px",
                borderRadius: 14,
                background: "#2a2520",
                color: "#c4a882",
                fontFamily: "var(--font-jost), sans-serif",
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.06em",
                textDecoration: "none",
              }}
            >
              Plan a trip
            </Link>
          </div>
        ) : (
          <>
            {current.length > 0 && (
              <TripGroup title="Now" trips={current} />
            )}
            {upcoming.length > 0 && (
              <TripGroup title="Upcoming" trips={upcoming} />
            )}
            {past.length > 0 && (
              <TripGroup title="Past" trips={past} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TripGroup({ title, trips }: { title: string; trips: TripRow[] }) {
  return (
    <section>
      <p style={labelStyle}>{title}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {trips.map((t) => (
          <Link
            key={t.id}
            href={`/trips/${t.id}`}
            style={{
              display: "block",
              padding: "12px 14px",
              background: "#faf7f2",
              borderRadius: 14,
              border: "1px solid rgba(42,37,32,0.10)",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <div className="flex justify-between items-baseline gap-2">
              <p style={{
                fontFamily: "var(--font-playfair), serif",
                fontStyle: "italic",
                fontSize: 16,
                color: "#2a2520",
                fontWeight: 600,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {t.name}
              </p>
              <p style={{
                fontFamily: "var(--font-jost), sans-serif",
                fontSize: 10.5,
                color: "#8a7a6a",
                whiteSpace: "nowrap",
              }}>
                {fmtDateRange(t.start_date, t.end_date)}
              </p>
            </div>
            <p style={{
              fontFamily: "var(--font-jost), sans-serif",
              fontSize: 11,
              color: "#c4a882",
              marginTop: 3,
              letterSpacing: "0.04em",
            }}>
              {t.destination_city}{t.occasion ? ` · ${t.occasion}` : ""}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
