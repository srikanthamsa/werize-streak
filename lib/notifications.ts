import webpush from "web-push";
import { getSupabaseAdmin } from "./supabase/admin";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "BCPWnqvTqJJImzH5FuQIqyUGNUN5_qW2xweZ263_swBdQh1X3IbAMHC9ohGglpvd5DdB7w4TUBfSY5DRwwvDDDk";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "IEngMeA9T8d6z2liodI6sN7yumkdGnOvQtMYQYp_qNc";

webpush.setVapidDetails(
  "mailto:support@streak.app",
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

export async function sendPushNotification(userId: string, title: string, body: string, data = {}) {
  const supabase = getSupabaseAdmin();

  // Get all subscriptions for this user
  const { data: subscriptions } = await supabase
    .from("push_subscriptions")
    .select("subscription")
    .eq("user_id", userId);

  if (!subscriptions || subscriptions.length === 0) {
    console.log(`[push] No subscriptions found for user ${userId}`);
    return;
  }

  const payload = JSON.stringify({ title, body, data });

  const results = await Promise.allSettled(
    subscriptions.map((s) =>
      webpush.sendNotification(s.subscription as any, payload)
    )
  );

  // Clean up failed subscriptions
  for (let i = 0; i < results.length; i++) {
    if (results[i].status === "rejected") {
      const error = (results[i] as PromiseRejectedResult).reason;
      if (error.statusCode === 410 || error.statusCode === 404) {
        console.log(`[push] Subscription expired for user ${userId}, cleaning up...`);
        await supabase
          .from("push_subscriptions")
          .delete()
          .eq("user_id", userId)
          .eq("subscription", subscriptions[i].subscription);
      }
    }
  }
}

function toISTDateKey() {
  const istDate = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const year = istDate.getUTCFullYear();
  const month = `${istDate.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${istDate.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isWeekendDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, (month ?? 1) - 1, day ?? 1);
  const weekday = date.getDay();
  return weekday === 0 || weekday === 6;
}

export async function checkAndTrigger9hNotification(userId: string, workedMinutes: number) {
  if (workedMinutes < 540) return;

  // Don't fire completion notifications on weekends
  const today = toISTDateKey();
  if (isWeekendDateKey(today)) return;

  const supabase = getSupabaseAdmin();

  // 1. Check if already notified today (using IST midnight as the boundary)
  const { data: existing } = await supabase
    .from("notifications")
    .select("id")
    .eq("user_id", userId)
    .eq("type", "9h_clear")
    .gte("created_at", `${today}T00:00:00+05:30`)
    .limit(1)
    .maybeSingle();

  if (existing) return;

  // 2. Insert notification
  const { error } = await supabase.from("notifications").insert({
    user_id: userId,
    type: "9h_clear",
    title: "9 Hours Cleared! 🎉",
    body: `You've just completed your 9-hour goal for today. You're clear to go!`,
  });

  if (error) {
    console.error("[notifications] Failed to insert 9h_clear:", error);
    return;
  }

  // 3. Fire Push
  await sendPushNotification(
    userId,
    "9 Hours Cleared! 🎉",
    "You've completed your goal. See you tomorrow!"
  );
}
