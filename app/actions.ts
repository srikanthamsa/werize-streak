"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type SyncState = {
  ok: boolean;
  message: string;
  syncedDays?: number;
};

type EdgeFunctionResponse = {
  success: boolean;
  swipeResponse?: {
    swipe?: Array<{
      attendanceDate?: string;
      punchDateTime?: string;
    }>;
    employeeSwipes?: Array<{
      attendanceDate?: string;
      date?: string;
      swipes?: string[];
      swipeTimes?: string[];
      systemSwipes?: string[];
    }>;
    swipes?: Array<{
      attendanceDate?: string;
      date?: string;
      swipes?: string[];
      swipeTimes?: string[];
      systemSwipes?: string[];
    }>;
  };
  discoveredUserId?: string;
  error?: string;
};

function toIsoList(source: unknown) {
  if (!Array.isArray(source)) {
    return [];
  }

  return source
    .filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
}

function extractAttendanceRows(payload: any) {
  if (Array.isArray(payload?.swipe)) {
    const grouped = new Map<string, string[]>();

    for (const entry of payload.swipe) {
      const punchDateTime = entry.punchDateTime;
      if (!punchDateTime) continue;

      // Use attendanceDate if populated, otherwise derive from punchDateTime
      const attendanceDate = entry.attendanceDate ?? punchDateTime.split("T")[0];

      const existing = grouped.get(attendanceDate) ?? [];
      existing.push(punchDateTime);
      grouped.set(attendanceDate, existing);
    }

    return [...grouped.entries()].map(([attendanceDate, swipeTimes]) => ({
      attendance_date: attendanceDate,
      swipe_times: toIsoList(swipeTimes),
    })).filter((row) => row.swipe_times.length > 0);
  }

  const candidates = Array.isArray(payload) ? payload : (payload?.employeeSwipes ?? payload?.swipes ?? []);

  return candidates.flatMap((row: any) => {
    const attendanceDate = row.attendanceDate ?? row.date;
    const swipeTimes = toIsoList(row.swipes ?? row.swipeTimes ?? row.systemSwipes ?? []);

    if (!attendanceDate || swipeTimes.length === 0) {
      return [];
    }

    return [{
      attendance_date: attendanceDate,
      swipe_times: swipeTimes,
    }];
  });
}

export async function runAttendanceSync(profileId: string): Promise<SyncState> {
  try {
    if (!profileId) {
      return { ok: false, message: "Missing profileId for sync." };
    }

    const supabase = getSupabaseAdmin();
    const encryptionKey = process.env.GREYTHR_PASSWORD_ENCRYPTION_KEY;
    const edgeFunctionUrl = process.env.GREYTHR_EDGE_FUNCTION_URL;
    const edgeFunctionKey = process.env.GREYTHR_EDGE_FUNCTION_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!encryptionKey || !edgeFunctionUrl || !edgeFunctionKey) {
      return {
        ok: false,
        message:
          "Missing GREYTHR_PASSWORD_ENCRYPTION_KEY, GREYTHR_EDGE_FUNCTION_URL, or GREYTHR_EDGE_FUNCTION_KEY.",
      };
    }

    const { data: profileRow, error: profileError } = await supabase
      .from("user_profiles")
      .select("id, greythr_user_id, greythr_username")
      .eq("id", profileId)
      .single();

    if (profileError || !profileRow) {
      return { ok: false, message: profileError?.message ?? "Profile not found." };
    }

    const { data: decryptedPassword, error: decryptError } = await supabase.rpc(
      "decrypt_greythr_password",
      {
        p_user_id: profileId,
        p_encryption_key: encryptionKey,
      },
    );

    if (decryptError || typeof decryptedPassword !== "string") {
      return {
        ok: false,
        message: decryptError?.message ?? "Failed to decrypt greytHR password.",
      };
    }

    const edgeResponse = await fetch(edgeFunctionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: edgeFunctionKey,
        Authorization: `Bearer ${edgeFunctionKey}`,
      },
      body: JSON.stringify({
        userName: profileRow.greythr_username,
        password: decryptedPassword,
        greythrUserId: profileRow.greythr_user_id,
      }),
      cache: "no-store",
    });

    const edgePayload = await edgeResponse.json() as EdgeFunctionResponse;
    if (!edgeResponse.ok || !edgePayload.success) {
      return {
        ok: false,
        message: edgePayload.error ?? `Edge Function sync failed with status ${edgeResponse.status}.`,
      };
    }

    if (edgePayload.discoveredUserId && !profileRow.greythr_user_id) {
      await supabase
        .from("user_profiles")
        .update({ greythr_user_id: edgePayload.discoveredUserId })
        .eq("id", profileId);
    }

    const attendanceRows = extractAttendanceRows(edgePayload.swipeResponse);
    if (!attendanceRows.length) {
      return { ok: false, message: "Sync succeeded but returned no swipe rows. Re-check credentials or wait for swipes." };
    }

    const upsertPayload = attendanceRows.map((row: { attendance_date: string; swipe_times: string[] }) => ({
      user_id: profileId,
      attendance_date: row.attendance_date,
      swipe_times: row.swipe_times,
      sync_source: "greythr_web_scrape",
      synced_at: new Date().toISOString(),
    }));

    // Clean up stale data from previous months before upserting
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    await supabase
      .from("attendance_logs")
      .delete()
      .eq("user_id", profileId)
      .lt("attendance_date", monthStart);

    const { error: upsertError } = await supabase

      .from("attendance_logs")
      .upsert(upsertPayload, {
        onConflict: "user_id,attendance_date",
      });

    if (upsertError) {
      return { ok: false, message: `Upsert failed: ${upsertError.message}` };
    }

    revalidatePath("/");
    return {
      ok: true,
      message: `Synced ${attendanceRows.length} day(s) from greytHR.`,
      syncedDays: attendanceRows.length,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Unknown sync error.",
    };
  }
}

export async function syncAttendanceAction(
  _previousState: SyncState,
  formData: FormData,
): Promise<SyncState> {
  const profileId = formData.get("profileId");
  if (typeof profileId !== "string" || !profileId) {
    return { ok: false, message: "Missing profileId for sync." };
  }

  return runAttendanceSync(profileId);
}
