import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const CATHERINE_USER_ID = "00000000-0000-0000-0000-000000000001";

export async function POST(req: NextRequest) {
  try {
    const { look_id, action } = await req.json() as { look_id: string; action: "wear" | "pass" };

    if (!look_id || !["wear", "pass"].includes(action)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const { error } = await supabase
      .from("look_decisions")
      .insert({ user_id: CATHERINE_USER_ID, look_id, action });

    // Trigger on_look_worn() handles wear_count + last_worn_at automatically
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
