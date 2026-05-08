"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase, CATHERINE_USER_ID } from "@/lib/supabase";
import { DALogo } from "@/components/DALogo";
import { DavidAvatar } from "@/components/DavidBubble";

// ─── types ────────────────────────────────────────────────────────────────────

type Prefs = {
  // existing — Style DNA
  boldness: number;
  colour_play: number;
  edge: number;
  classic: number;
  palette: string[];
  corrections: string[];
  recent_learnings: { text: string; date?: string }[];
  style_push: number;
  notes_freetext: string | null;

  // new — Phase A1a profile expansion
  height: string | null;
  hair_color: string | null;
  eye_color: string | null;
  shoe_size: string | null;
  skin_tone: string | null;
  color_season: string | null;
  favored_colors: string[];
  avoided_colors: string | null;
  body_shape: string | null;
  waist_size: string | null;
  cup_size: string | null;
  weight: string | null;
  tops_that_fit: string | null;
  tops_that_almost_fit: string | null;
  bottoms_that_fit: string | null;
  bottoms_that_almost_fit: string | null;
  current_style_words: string[];
  aspirational_style_words: string[];
  admired_styles: string | null;
  want_to_try: string | null;
  not_me: string | null;
  anything_else: string | null;
};

const TRAITS = [
  { key: "boldness",    label: "Color Appetite",  ends: ["Muted",   "Mid",     "Bold"]       },
  { key: "colour_play", label: "Silhouette",       ends: ["Soft",    "Mixed",   "Structured"] },
  { key: "edge",        label: "Trend Exposure",   ends: ["Classic", "Selective","Now"]       },
  { key: "classic",     label: "Risk Tolerance",   ends: ["Safe",    "Low-Mid", "Push"]       },
] as const;

type TraitKey = typeof TRAITS[number]["key"];

const SKIN_TONE_OPTIONS  = ["Warm", "Cool", "Neutral", "Not sure"];
const COLOR_SEASONS      = ["Spring", "Summer", "Autumn", "Winter", "Don't know"];
const BODY_SHAPE_OPTIONS = ["Pear", "Hourglass", "Rectangle", "Inverted Triangle", "Apple", "Other"];

// ─── tiny array parsers (UI uses comma-separated strings) ─────────────────────

const parseList = (s: string): string[] =>
  s.split(",").map((x) => x.trim()).filter(Boolean);

const joinList = (arr: string[] | null | undefined): string =>
  (arr ?? []).join(", ");

// ─── shared visual constants ──────────────────────────────────────────────────

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
  lineHeight: 1.6,
};

const helpTextStyle = {
  fontFamily: "var(--font-jost), sans-serif",
  fontSize: 10.5,
  color: "#8a7a6a",
  lineHeight: 1.4,
  marginTop: 4,
};

// ─── reusable input components ────────────────────────────────────────────────

function Field({ label, helpText, children }: { label: string; helpText?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <span style={fieldLabelStyle}>{label}</span>
      {children}
      {helpText && <span style={helpTextStyle}>{helpText}</span>}
    </div>
  );
}

function TextInput({
  value, onChange, placeholder,
}: { value: string; onChange: (s: string) => void; placeholder?: string }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={inputStyle}
    />
  );
}

function TextArea({
  value, onChange, placeholder, rows = 3,
}: { value: string; onChange: (s: string) => void; placeholder?: string; rows?: number }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      style={{ ...inputStyle, resize: "none" }}
    />
  );
}

function ChoiceChips({
  value, options, onChange,
}: { value: string | null; options: string[]; onChange: (s: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = value === opt;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            style={{
              fontFamily: "var(--font-jost), sans-serif",
              fontSize: 11,
              fontWeight: active ? 600 : 500,
              padding: "6px 12px",
              borderRadius: 20,
              background: active ? "#2a2520" : "#f5f0e8",
              color: active ? "#c4a882" : "#2a2520",
              border: active
                ? "1px solid #2a2520"
                : "1px solid rgba(42,37,32,0.14)",
              cursor: "pointer",
              transition: "background 0.15s, color 0.15s",
            }}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

// ─── existing trait slider ────────────────────────────────────────────────────

function TraitSlider({
  label,
  value,
  ends,
  onChange,
}: {
  label: string;
  value: number;
  ends: readonly [string, string, string];
  onChange?: (v: number) => void;
}) {
  const interactive = !!onChange;
  return (
    <div
      style={{
        padding: "10px 14px",
        background: "#f5f0e8",
        borderRadius: 12,
        border: "1px solid rgba(42,37,32,0.10)",
        cursor: interactive ? "pointer" : "default",
      }}
    >
      <div className="flex justify-between items-center mb-2">
        <span style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 11, fontWeight: 600, color: "#2a2520", letterSpacing: "0.04em" }}>{label}</span>
        <span style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 11, color: "#c4a882", fontWeight: 600 }}>{ends[value]}</span>
      </div>
      <div className="flex gap-1">
        {[0, 1, 2].map((seg) => (
          <div
            key={seg}
            onClick={() => onChange?.(seg)}
            style={{
              flex: 1,
              height: 6,
              borderRadius: 3,
              background: seg <= value ? "#c4a882" : "rgba(42,37,32,0.12)",
              cursor: interactive ? "pointer" : "default",
              margin: "4px 0",
            }}
          />
        ))}
      </div>
      <div className="flex justify-between mt-1">
        {ends.map((e, i) => (
          <span
            key={i}
            onClick={() => onChange?.(i)}
            style={{
              fontFamily: "var(--font-jost), sans-serif",
              fontSize: 8.5,
              color: i === value ? "#2a2520" : "#8a7a6a",
              fontWeight: i === value ? 600 : 400,
              cursor: interactive ? "pointer" : "default",
            }}
          >
            {e}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── columns selected from supabase ───────────────────────────────────────────

const PREFS_COLUMNS = [
  "boldness", "colour_play", "edge", "classic",
  "palette", "corrections", "recent_learnings", "style_push", "notes_freetext",
  "height", "hair_color", "eye_color", "shoe_size",
  "skin_tone", "color_season", "favored_colors", "avoided_colors",
  "body_shape", "waist_size", "cup_size", "weight",
  "tops_that_fit", "tops_that_almost_fit",
  "bottoms_that_fit", "bottoms_that_almost_fit",
  "current_style_words", "aspirational_style_words",
  "admired_styles", "want_to_try", "not_me", "anything_else",
].join(",");

// ─── page ─────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [draft, setDraft] = useState<Prefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("user_preferences")
        .select(PREFS_COLUMNS)
        .eq("user_id", CATHERINE_USER_ID)
        .single();
      const row = data as Partial<Prefs> | null;
      const normalized: Prefs | null = row ? {
        ...row,
        favored_colors:           row.favored_colors           ?? [],
        current_style_words:      row.current_style_words      ?? [],
        aspirational_style_words: row.aspirational_style_words ?? [],
      } as Prefs : null;
      setPrefs(normalized);
      setDraft(normalized);
      setLoading(false);
    }
    load();
  }, []);

  // Dirty check — compare every editable field
  const isDirty = !!(draft && prefs && (
    draft.boldness !== prefs.boldness ||
    draft.colour_play !== prefs.colour_play ||
    draft.edge !== prefs.edge ||
    draft.classic !== prefs.classic ||
    (draft.notes_freetext ?? "") !== (prefs.notes_freetext ?? "") ||
    (draft.height ?? "") !== (prefs.height ?? "") ||
    (draft.hair_color ?? "") !== (prefs.hair_color ?? "") ||
    (draft.eye_color ?? "") !== (prefs.eye_color ?? "") ||
    (draft.shoe_size ?? "") !== (prefs.shoe_size ?? "") ||
    (draft.skin_tone ?? "") !== (prefs.skin_tone ?? "") ||
    (draft.color_season ?? "") !== (prefs.color_season ?? "") ||
    joinList(draft.favored_colors) !== joinList(prefs.favored_colors) ||
    (draft.avoided_colors ?? "") !== (prefs.avoided_colors ?? "") ||
    (draft.body_shape ?? "") !== (prefs.body_shape ?? "") ||
    (draft.waist_size ?? "") !== (prefs.waist_size ?? "") ||
    (draft.cup_size ?? "") !== (prefs.cup_size ?? "") ||
    (draft.weight ?? "") !== (prefs.weight ?? "") ||
    (draft.tops_that_fit ?? "") !== (prefs.tops_that_fit ?? "") ||
    (draft.tops_that_almost_fit ?? "") !== (prefs.tops_that_almost_fit ?? "") ||
    (draft.bottoms_that_fit ?? "") !== (prefs.bottoms_that_fit ?? "") ||
    (draft.bottoms_that_almost_fit ?? "") !== (prefs.bottoms_that_almost_fit ?? "") ||
    joinList(draft.current_style_words) !== joinList(prefs.current_style_words) ||
    joinList(draft.aspirational_style_words) !== joinList(prefs.aspirational_style_words) ||
    (draft.admired_styles ?? "") !== (prefs.admired_styles ?? "") ||
    (draft.want_to_try ?? "") !== (prefs.want_to_try ?? "") ||
    (draft.not_me ?? "") !== (prefs.not_me ?? "") ||
    (draft.anything_else ?? "") !== (prefs.anything_else ?? "")
  ));

  const setTrait = useCallback((key: TraitKey, value: number) => {
    setDraft((d) => d ? { ...d, [key]: value } : d);
  }, []);

  const setField = useCallback(<K extends keyof Prefs>(key: K, value: Prefs[K]) => {
    setDraft((d) => d ? { ...d, [key]: value } : d);
  }, []);

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    const { error } = await supabase
      .from("user_preferences")
      .upsert({
        user_id: CATHERINE_USER_ID,
        // existing
        boldness: draft.boldness,
        colour_play: draft.colour_play,
        edge: draft.edge,
        classic: draft.classic,
        notes_freetext: draft.notes_freetext,
        // new — all nullable / array
        height: draft.height || null,
        hair_color: draft.hair_color || null,
        eye_color: draft.eye_color || null,
        shoe_size: draft.shoe_size || null,
        skin_tone: draft.skin_tone || null,
        color_season: draft.color_season || null,
        favored_colors: draft.favored_colors,
        avoided_colors: draft.avoided_colors || null,
        body_shape: draft.body_shape || null,
        waist_size: draft.waist_size || null,
        cup_size: draft.cup_size || null,
        weight: draft.weight || null,
        tops_that_fit: draft.tops_that_fit || null,
        tops_that_almost_fit: draft.tops_that_almost_fit || null,
        bottoms_that_fit: draft.bottoms_that_fit || null,
        bottoms_that_almost_fit: draft.bottoms_that_almost_fit || null,
        current_style_words: draft.current_style_words,
        aspirational_style_words: draft.aspirational_style_words,
        admired_styles: draft.admired_styles || null,
        want_to_try: draft.want_to_try || null,
        not_me: draft.not_me || null,
        anything_else: draft.anything_else || null,
      }, { onConflict: "user_id" });

    setSaving(false);
    if (!error) {
      setPrefs(draft);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  };

  return (
    <div className="flex flex-col h-full bg-cream overflow-hidden">
      {/* header */}
      <div
        className="relative texture shrink-0 flex items-center gap-3"
        style={{ background: "#2a2520", padding: "14px 18px" }}
      >
        <DALogo size={44} dark />
        <div>
          <p style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 9, color: "#c4a882", letterSpacing: "0.12em", fontWeight: 500, textTransform: "uppercase" }}>Style DNA</p>
          <p style={{ fontFamily: "var(--font-playfair), serif", fontStyle: "italic", fontWeight: 700, fontSize: 20, color: "#faf7f2" }}>
            Catherine
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar" style={{ padding: "14px 16px 24px", display: "flex", flexDirection: "column", gap: 24 }}>
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <span key={i} className={`dot-${i + 1}`} style={{ width: 6, height: 6, borderRadius: "50%", background: "#c4a882", display: "inline-block" }} />
              ))}
            </div>
          </div>
        ) : draft ? (
          <>
            {/* How David sees you */}
            <section>
              <p style={labelStyle}>How David Sees You</p>
              <div className="flex gap-2.5 items-start">
                <DavidAvatar />
                <div style={{ flex: 1, background: "#f5f0e8", border: "1px solid rgba(42,37,32,0.14)", borderRadius: "3px 14px 14px 14px", padding: "10px 14px" }}>
                  <p style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 13, color: "#2a2520", lineHeight: 1.6, fontStyle: "italic" }}>
                    {draft.notes_freetext ?? "Quietly confident. You know what works — sometimes you just need a nudge to actually wear it."}
                  </p>
                </div>
              </div>
            </section>

            {/* Traits */}
            <section>
              <p style={labelStyle}>Your Traits · Tap to Adjust</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {TRAITS.map((t) => (
                  <TraitSlider
                    key={t.key}
                    label={t.label}
                    value={draft[t.key]}
                    ends={t.ends}
                    onChange={(v) => setTrait(t.key, v)}
                  />
                ))}
              </div>
            </section>

            {/* Note to David */}
            <section>
              <p style={labelStyle}>Note to David</p>
              <TextArea
                value={draft.notes_freetext ?? ""}
                onChange={(s) => setField("notes_freetext", s)}
                placeholder="Tell David anything — a mood, an occasion coming up, something you want to wear more…"
                rows={3}
              />
            </section>

            {/* The Basics */}
            <section>
              <p style={labelStyle}>The Basics</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="Height">
                  <TextInput
                    value={draft.height ?? ""}
                    onChange={(s) => setField("height", s)}
                    placeholder={`5'7"`}
                  />
                </Field>
                <Field label="Shoe size">
                  <TextInput
                    value={draft.shoe_size ?? ""}
                    onChange={(s) => setField("shoe_size", s)}
                    placeholder="8"
                  />
                </Field>
                <Field label="Hair color">
                  <TextInput
                    value={draft.hair_color ?? ""}
                    onChange={(s) => setField("hair_color", s)}
                    placeholder="brunette"
                  />
                </Field>
                <Field label="Eye color">
                  <TextInput
                    value={draft.eye_color ?? ""}
                    onChange={(s) => setField("eye_color", s)}
                    placeholder="hazel"
                  />
                </Field>
              </div>
            </section>

            {/* Your Colors */}
            <section>
              <p style={labelStyle}>Your Colors</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Field
                  label="Skin tone"
                  helpText="Gold jewelry tends to flatter warm tones; silver flatters cool. Both = neutral."
                >
                  <ChoiceChips
                    value={draft.skin_tone}
                    options={SKIN_TONE_OPTIONS}
                    onChange={(s) => setField("skin_tone", s)}
                  />
                </Field>
                <Field label="Color season" helpText="If you've ever done a color analysis.">
                  <ChoiceChips
                    value={draft.color_season}
                    options={COLOR_SEASONS}
                    onChange={(s) => setField("color_season", s)}
                  />
                </Field>
                <Field label="Colors you feel best in" helpText="Comma-separated, 3–5.">
                  <TextInput
                    value={joinList(draft.favored_colors)}
                    onChange={(s) => setField("favored_colors", parseList(s))}
                    placeholder="cream, navy, olive"
                  />
                </Field>
                <Field label="Colors you don't reach for">
                  <TextArea
                    value={draft.avoided_colors ?? ""}
                    onChange={(s) => setField("avoided_colors", s)}
                    placeholder="and why, if you know"
                    rows={2}
                  />
                </Field>
              </div>
            </section>

            {/* Your Frame */}
            <section>
              <p style={labelStyle}>Your Frame & Fit</p>
              <p style={{ ...helpTextStyle, marginTop: -4, marginBottom: 12 }}>
                Optional. Anything skipped, David doesn't use. Nothing here is ever displayed back to you.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Field label="Body shape">
                  <ChoiceChips
                    value={draft.body_shape}
                    options={BODY_SHAPE_OPTIONS}
                    onChange={(s) => setField("body_shape", s)}
                  />
                </Field>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Field label="Waist size">
                    <TextInput
                      value={draft.waist_size ?? ""}
                      onChange={(s) => setField("waist_size", s)}
                      placeholder="28 / size 8"
                    />
                  </Field>
                  <Field label="Cup size">
                    <TextInput
                      value={draft.cup_size ?? ""}
                      onChange={(s) => setField("cup_size", s)}
                      placeholder="34B"
                    />
                  </Field>
                </div>
                <Field label="Weight" helpText="Optional. Used only for fabric drape & silhouette reasoning. Never displayed.">
                  <TextInput
                    value={draft.weight ?? ""}
                    onChange={(s) => setField("weight", s)}
                    placeholder=""
                  />
                </Field>
                <Field label="Tops that fit you well — what works?">
                  <TextArea
                    value={draft.tops_that_fit ?? ""}
                    onChange={(s) => setField("tops_that_fit", s)}
                    placeholder="cut, length, shoulder, sleeve, fabric…"
                    rows={2}
                  />
                </Field>
                <Field label="Tops that almost-but-not-quite work">
                  <TextArea
                    value={draft.tops_that_almost_fit ?? ""}
                    onChange={(s) => setField("tops_that_almost_fit", s)}
                    placeholder="what's off"
                    rows={2}
                  />
                </Field>
                <Field label="Bottoms that fit well — what works?">
                  <TextArea
                    value={draft.bottoms_that_fit ?? ""}
                    onChange={(s) => setField("bottoms_that_fit", s)}
                    placeholder=""
                    rows={2}
                  />
                </Field>
                <Field label="Bottoms that almost work">
                  <TextArea
                    value={draft.bottoms_that_almost_fit ?? ""}
                    onChange={(s) => setField("bottoms_that_almost_fit", s)}
                    placeholder="what's off"
                    rows={2}
                  />
                </Field>
              </div>
            </section>

            {/* Your Style */}
            <section>
              <p style={labelStyle}>Your Style — Now &amp; Aspirational</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Field label="Three words for your current style" helpText="Comma-separated.">
                  <TextInput
                    value={joinList(draft.current_style_words)}
                    onChange={(s) => setField("current_style_words", parseList(s))}
                    placeholder="quiet, layered, considered"
                  />
                </Field>
                <Field label="Three words for the style you're growing into" helpText="Comma-separated.">
                  <TextInput
                    value={joinList(draft.aspirational_style_words)}
                    onChange={(s) => setField("aspirational_style_words", parseList(s))}
                    placeholder="bolder, sharper, playful"
                  />
                </Field>
                <Field label="People whose style you admire" helpText="Anyone — famous, friends, fictional, a vibe.">
                  <TextArea
                    value={draft.admired_styles ?? ""}
                    onChange={(s) => setField("admired_styles", s)}
                    rows={2}
                  />
                </Field>
                <Field label="A look you'd love to try but haven't">
                  <TextArea
                    value={draft.want_to_try ?? ""}
                    onChange={(s) => setField("want_to_try", s)}
                    rows={2}
                  />
                </Field>
                <Field label='A look that feels "not you"'>
                  <TextArea
                    value={draft.not_me ?? ""}
                    onChange={(s) => setField("not_me", s)}
                    rows={2}
                  />
                </Field>
              </div>
            </section>

            {/* Anything Else */}
            <section>
              <p style={labelStyle}>Anything Else</p>
              <TextArea
                value={draft.anything_else ?? ""}
                onChange={(s) => setField("anything_else", s)}
                placeholder="Fabric sensitivities, occasions you dress for, climate, anything David should know."
                rows={3}
              />
            </section>

            {/* Palette */}
            {draft.palette?.length > 0 && (
              <section>
                <p style={labelStyle}>Your Palette</p>
                <div className="flex gap-2">
                  {draft.palette.map((hex, i) => (
                    <div
                      key={i}
                      className="flex-1 relative texture"
                      style={{ height: 40, borderRadius: 8, background: hex, border: "1px solid rgba(42,37,32,0.10)" }}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Corrections */}
            {draft.corrections?.length > 0 && (
              <section>
                <p style={labelStyle}>Correct David</p>
                <div className="flex flex-wrap gap-2">
                  {draft.corrections.map((c, i) => (
                    <span
                      key={i}
                      style={{ fontSize: 11, fontFamily: "var(--font-jost), sans-serif", fontWeight: 500, padding: "5px 12px", borderRadius: 20, background: "#f5f0e8", border: "1px solid rgba(42,37,32,0.14)", color: "#2a2520" }}
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {/* Learnings */}
            {draft.recent_learnings?.length > 0 && (
              <section>
                <p style={labelStyle}>Recent Learnings</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {draft.recent_learnings.map((l, i) => (
                    <div
                      key={i}
                      style={{ borderLeft: "2.5px solid #c4a882", paddingLeft: 10 }}
                    >
                      <p style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 13, color: "#2a2520", lineHeight: 1.5 }}>
                        {typeof l === "string" ? l : l.text}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Save button — only visible when dirty */}
            {isDirty && (
              <div style={{ position: "sticky", bottom: 0, paddingBottom: 8 }}>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={{
                    width: "100%",
                    padding: "13px 0",
                    borderRadius: 14,
                    background: saved ? "#7a9e7e" : "#2a2520",
                    color: saved ? "#fff" : "#c4a882",
                    fontFamily: "var(--font-jost), sans-serif",
                    fontSize: 13,
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    border: "none",
                    cursor: saving ? "wait" : "pointer",
                    transition: "background 0.3s",
                  }}
                >
                  {saving ? "Saving…" : saved ? "Saved ✓" : "Save Changes"}
                </button>
              </div>
            )}
          </>
        ) : (
          <p style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 13, color: "#8a7a6a", textAlign: "center", marginTop: 40 }}>
            No style profile yet.
          </p>
        )}
      </div>
    </div>
  );
}
