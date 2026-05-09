"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DALogo } from "@/components/DALogo";

const TRIP_OCCASIONS = [
  { value: "vacation", label: "Vacation" },
  { value: "business", label: "Business" },
  { value: "wedding",  label: "Wedding" },
  { value: "family",   label: "Family" },
];

const labelStyle = {
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
  fontSize: 14,
  color: "#2a2520",
  background: "#f5f0e8",
  border: "1px solid rgba(42,37,32,0.14)",
  borderRadius: 12,
  padding: "10px 14px",
  outline: "none",
  lineHeight: 1.5,
};

export default function NewTripPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [destinationCity, setDestinationCity] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [occasion, setOccasion] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid = name.trim() && destinationCity.trim() && startDate && endDate;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          destination_city: destinationCity.trim(),
          start_date: startDate,
          end_date: endDate,
          occasion,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create trip");
      router.push(`/trips/${data.trip.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
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
        <div>
          <p style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 9, color: "#c4a882", letterSpacing: "0.12em", fontWeight: 500, textTransform: "uppercase" }}>New Trip</p>
          <p style={{ fontFamily: "var(--font-playfair), serif", fontStyle: "italic", fontWeight: 700, fontSize: 20, color: "#faf7f2" }}>
            Where to?
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto no-scrollbar" style={{ padding: "18px 16px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          <p style={labelStyle}>Trip name</p>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Madrid · Sarah's wedding"
            style={inputStyle}
            autoFocus
          />
        </div>

        <div>
          <p style={labelStyle}>Destination city</p>
          <input
            type="text"
            value={destinationCity}
            onChange={(e) => setDestinationCity(e.target.value)}
            placeholder="Madrid"
            style={inputStyle}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <p style={labelStyle}>Start date</p>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <p style={labelStyle}>End date</p>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>

        <div>
          <p style={labelStyle}>Vibe (optional)</p>
          <div className="flex flex-wrap gap-2">
            {TRIP_OCCASIONS.map((o) => {
              const active = occasion === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setOccasion(active ? null : o.value)}
                  style={{
                    fontFamily: "var(--font-jost), sans-serif",
                    fontSize: 11,
                    fontWeight: active ? 600 : 500,
                    padding: "6px 12px",
                    borderRadius: 20,
                    background: active ? "#2a2520" : "#f5f0e8",
                    color: active ? "#c4a882" : "#2a2520",
                    border: active ? "1px solid #2a2520" : "1px solid rgba(42,37,32,0.14)",
                    cursor: "pointer",
                  }}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <div style={{
            background: "#f7e6e6",
            border: "1px solid rgba(170,60,60,0.3)",
            borderRadius: 12,
            padding: "10px 14px",
            fontFamily: "var(--font-jost), sans-serif",
            fontSize: 12,
            color: "#7a2a2a",
          }}>
            {error}
          </div>
        )}

        <div style={{ marginTop: "auto", paddingTop: 16 }}>
          <button
            type="submit"
            disabled={!isValid || submitting}
            style={{
              width: "100%",
              padding: "13px 0",
              borderRadius: 14,
              background: !isValid ? "rgba(42,37,32,0.4)" : "#2a2520",
              color: "#c4a882",
              fontFamily: "var(--font-jost), sans-serif",
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "0.06em",
              border: "none",
              cursor: !isValid || submitting ? "not-allowed" : "pointer",
              transition: "background 0.2s",
            }}
          >
            {submitting ? "Creating…" : "Create Trip"}
          </button>
        </div>
      </form>
    </div>
  );
}
