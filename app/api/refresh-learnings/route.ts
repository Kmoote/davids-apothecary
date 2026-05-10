/**
 * POST /api/refresh-learnings
 *
 * Phase A1b — Reflection step. Pulls Catherine's last 30 days of
 * look_decisions, summarizes the items she wore vs. passed on, hands
 * the summary to Haiku, and asks for 1-3 specific patterns. Writes the
 * resulting observations to user_preferences.recent_learnings so David
 * surfaces them on subsequent Stylist requests.
 *
 * Triggered manually from the Profile page button. No auto-cadence (yet).
 *
 * Cost guardrail: ~30 decisions × ~50 tokens ≈ 1.5K input + 200 output =
 * approx $0.001 per refresh. Safe to run a handful of times per week.
 */

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase  = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const CATHERINE_USER_ID = "00000000-0000-0000-0000-000000000001";

const REFLECTION_SYSTEM = `You are David, a senior personal stylist reviewing Catherine's recent picks and rejections from her own wardrobe app.

Look at what she wore and what she passed on over the last 30 days. Identify 1 to 3 specific, actionable patterns. Each pattern should be:
- Concrete (name colors, silhouettes, formalities, fabrics — not vague feelings)
- Short (8-15 words, written as one observation)
- Useful for future styling decisions
- Honest, not flattering

You are NOT writing to Catherine. You are writing notes to your future self that you'll read before suggesting tomorrow's outfits. Use third person ("Catherine has been...").

Return ONLY a JSON array of strings — no markdown, no preamble. Example:
["Catherine has been reaching for structured bottoms over flowy ones this month.", "She's passed on three crewneck tops in a row — try V-necks or boatnecks for her next casual day."]

If there isn't enough signal (fewer than 5 decisions), return an empty array: [].`;

type Decision = {
  action: "wear" | "pass";
  decided_at: string;
  look: {
    name: string;
    item_ids: string[];
  } | null;
};

type ItemRow = {
  id: string;
  name: string | null;
  category: string;
  colors: string[];
  formality: number;
  pattern: string | null;
  fabric: string | null;
};

export async function POST() {
  try {
    // 1. Pull last 30 days of decisions, joined with their looks.
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data: decisionRows, error: decErr } = await supabase
      .from("look_decisions")
      .select("action, decided_at, looks(name, item_ids)")
      .eq("user_id", CATHERINE_USER_ID)
      .gte("decided_at", thirtyDaysAgo)
      .order("decided_at", { ascending: false })
      .limit(40);

    if (decErr) throw new Error(`DB decisions: ${decErr.message}`);

    const decisions = (decisionRows ?? []).map((d) => ({
      action: d.action as "wear" | "pass",
      decided_at: d.decided_at as string,
      // supabase returns the joined relation as object, not array, when single FK
      look: (Array.isArray(d.looks) ? d.looks[0] : d.looks) as Decision["look"],
    }));

    if (decisions.length < 5) {
      return NextResponse.json({
        ok: true,
        learnings: [],
        message: `Only ${decisions.length} decisions in the last 30 days — David needs more signal before he can spot patterns. Pick or pass on a few more outfits and try again.`,
      });
    }

    // 2. Collect every item_id mentioned in any look, batch-fetch their metadata.
    const itemIdSet = new Set<string>();
    for (const d of decisions) {
      for (const id of d.look?.item_ids ?? []) itemIdSet.add(id);
    }

    const { data: itemRows, error: itemErr } = await supabase
      .from("wardrobe_items")
      .select("id,name,category,colors,formality,pattern,fabric")
      .in("id", Array.from(itemIdSet));

    if (itemErr) throw new Error(`DB items: ${itemErr.message}`);
    const itemMap = new Map<string, ItemRow>(
      (itemRows ?? []).map((r) => [r.id as string, r as ItemRow])
    );

    // 3. Build a compact text summary of the decision history.
    //    Format: "WORE on 2026-04-22: Cream Wide Leg Linen Trousers, Soft Yellow Long Sleeve Blouse..."
    //    Newer decisions first so the model weights them more.
    const lines: string[] = [];
    for (const d of decisions) {
      const date = d.decided_at.slice(0, 10);
      const tag  = d.action === "wear" ? "WORE" : "PASSED";
      const items = (d.look?.item_ids ?? [])
        .map((id) => itemMap.get(id))
        .filter((i): i is ItemRow => !!i)
        .map((i) => `${i.name ?? i.category} (${i.category}, ${i.pattern ?? "solid"}, formality ${i.formality})`)
        .join(", ");
      if (items) lines.push(`${tag} on ${date}: ${items}`);
    }

    if (lines.length < 5) {
      return NextResponse.json({
        ok: true,
        learnings: [],
        message: "Not enough resolved looks to spot patterns yet.",
      });
    }

    const summary = lines.join("\n");

    // 4. Ask Haiku for 1-3 specific patterns.
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system: REFLECTION_SYSTEM,
      messages: [{
        role: "user",
        content: `Catherine's recent decisions (most recent first):\n\n${summary}\n\nReturn a JSON array of 1-3 short observations.`,
      }],
    });

    const rawText = msg.content[0].type === "text" ? msg.content[0].text : "[]";
    let observations: string[] = [];
    try {
      const parsed = JSON.parse(rawText.trim());
      if (Array.isArray(parsed)) {
        observations = parsed
          .filter((s): s is string => typeof s === "string")
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 3);
      }
    } catch {
      // Fall through: empty observations means nothing got saved.
    }

    if (observations.length === 0) {
      return NextResponse.json({
        ok: true,
        learnings: [],
        message: "David didn't spot a clear pattern this time. Try again after a few more decisions.",
      });
    }

    // 5. Append to recent_learnings (keep last 10), each tagged with today's date.
    const today = new Date().toISOString().slice(0, 10);
    const newEntries = observations.map((text) => ({ text, date: today }));

    const { data: prefsRow } = await supabase
      .from("user_preferences")
      .select("recent_learnings")
      .eq("user_id", CATHERINE_USER_ID)
      .single();

    const existing = (prefsRow?.recent_learnings as Array<{ text: string; date?: string }> | null) ?? [];
    const combined = [...existing, ...newEntries].slice(-10); // keep last 10

    const { error: updErr } = await supabase
      .from("user_preferences")
      .update({ recent_learnings: combined, updated_at: new Date().toISOString() })
      .eq("user_id", CATHERINE_USER_ID);

    if (updErr) throw new Error(`DB update: ${updErr.message}`);

    return NextResponse.json({
      ok: true,
      learnings: newEntries,
      decisions_reviewed: decisions.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[refresh-learnings]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
