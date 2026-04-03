import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  try {
    const { userId, subscription } = await request.json();

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Save subscription to the database
    const { error } = await supabase
      .from("push_subscriptions")
      .upsert(
        { user_id: userId, subscription: subscription, updated_at: new Date().toISOString() },
        { onConflict: "user_id, subscription" }
      );

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Save subscription error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
