"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { runAttendanceSync, type SyncState } from "@/app/actions";

export type SetupState = {
  ok: boolean;
  message: string;
};

export async function saveCredentialsAction(
  _previousState: SetupState,
  formData: FormData,
): Promise<SetupState> {
  try {
    const authUser = await getAuthenticatedUser();

    if (!authUser) {
      return {
        ok: false,
        message: "Sign in first before saving your work account.",
      };
    }

    const encryptionKey = process.env.GREYTHR_PASSWORD_ENCRYPTION_KEY;
    if (!encryptionKey) {
      return {
        ok: false,
        message: "Missing GREYTHR_PASSWORD_ENCRYPTION_KEY.",
      };
    }

    const fullName = String(formData.get("fullName") ?? "").trim();
    const team = String(formData.get("team") ?? "").trim();
    const role = String(formData.get("role") ?? "").trim();
    const greythrUsername = String(formData.get("greythrUsername") ?? "").trim();
    const greythrPassword = String(formData.get("greythrPassword") ?? "");
    const leaderboardOptIn = formData.get("leaderboardOptIn") === "on";

    if (!fullName || !team || !greythrUsername || !greythrPassword) {
      return {
        ok: false,
        message: "Fill in your name, team, greytHR employee ID, and password.",
      };
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("upsert_user_profile_credentials", {
      p_auth_user_id: authUser.id,
      p_email: authUser.email ?? "",
      p_full_name: fullName,
      p_team: team,
      p_role: role || null,
      p_greythr_user_id: null,
      p_greythr_username: greythrUsername,
      p_greythr_password: greythrPassword,
      p_encryption_key: encryptionKey,
      p_leaderboard_opt_in: leaderboardOptIn,
    });

    if (error || typeof data !== "string") {
      return {
        ok: false,
        message: error?.message ?? "Failed to save your setup.",
      };
    }

    const syncResult: SyncState = await runAttendanceSync(data);

    revalidatePath("/");
    revalidatePath("/setup");

    return {
      ok: syncResult.ok,
      message: syncResult.ok
        ? "Magic is live. Your first sync is done."
        : `Saved your setup, but first sync failed: ${syncResult.message}`,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Unknown setup error.",
    };
  }
}
