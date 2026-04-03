import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendPushNotification } from "@/lib/notifications";

/**
 * POST /api/admin/broadcast
 *
 * Body: { secret: string, title: string, body: string, userIds?: string[] }
 *
 * If userIds omitted → broadcasts to ALL users.
 * Protected by ADMIN_BROADCAST_SECRET env var.
 */
export async function POST(request: Request) {
  try {
    const { secret, title, body, userIds } = await request.json();

    if (!secret || secret !== process.env.ADMIN_BROADCAST_SECRET) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    if (!title || !body) {
      return NextResponse.json({ ok: false, error: "Missing title or body" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. Determine target users
    let targetUserIds: string[] = userIds ?? [];
    if (!targetUserIds.length) {
      const { data: profiles } = await supabase
        .from("user_profiles")
        .select("id");
      targetUserIds = (profiles ?? []).map((p: any) => p.id);
    }

    if (!targetUserIds.length) {
      return NextResponse.json({ ok: false, error: "No users found" }, { status: 404 });
    }

    // 2. Insert notification records for in-app feed
    const notificationRows = targetUserIds.map((userId: string) => ({
      user_id: userId,
      type: "system",
      title,
      body,
    }));

    await supabase.from("notifications").insert(notificationRows);

    // 3. Send push notifications to all targets
    const results = await Promise.allSettled(
      targetUserIds.map((userId: string) =>
        sendPushNotification(userId, title, body)
      )
    );

    const succeeded = results.filter((r) => r.status === "fulfilled").length;

    console.log(`[broadcast] Found ${targetUserIds.length} users. ${succeeded} push attempts successfully fired.`);

    return NextResponse.json({
      ok: true,
      message: `Broadcast processed for ${targetUserIds.length} users. Feed updated. (Push fired to ${succeeded} endpoints).`,
    });
  } catch (error: any) {
    console.error("Broadcast error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
