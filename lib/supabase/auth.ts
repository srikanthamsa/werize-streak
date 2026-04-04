import { cookies } from "next/headers";
import { createClient, type User } from "@supabase/supabase-js";

// Access tokens expire in 1 hour. We store them for 7 days and silently
// refresh via the refresh token when they're expired. Refresh tokens are
// valid for 30 days (Supabase default) so this keeps the user signed in
// across the full refresh token lifetime.
const ACCESS_TOKEN_MAX_AGE  = 60 * 60 * 24 * 7;   // 7 days (cookie lifetime)
const REFRESH_TOKEN_MAX_AGE = 60 * 60 * 24 * 30;  // 30 days

function getSupabaseAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY for Supabase Auth.",
    );
  }

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export { ACCESS_TOKEN_MAX_AGE, REFRESH_TOKEN_MAX_AGE };

export async function getAuthenticatedUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const accessToken  = cookieStore.get("streak-access-token")?.value;
  const refreshToken = cookieStore.get("streak-refresh-token")?.value;

  if (!accessToken && !refreshToken) {
    return null;
  }

  const supabase = getSupabaseAuthClient();

  // Try the access token first (fast path)
  if (accessToken) {
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (!error && data.user) {
      return data.user;
    }
  }

  // Access token missing or expired — try to refresh silently
  if (refreshToken) {
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
    if (!error && data.session && data.user) {
      // Write the new tokens back into cookies so subsequent requests work
      const cookieMutable = await cookies();
      cookieMutable.set("streak-access-token", data.session.access_token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: ACCESS_TOKEN_MAX_AGE,
      });
      cookieMutable.set("streak-refresh-token", data.session.refresh_token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: REFRESH_TOKEN_MAX_AGE,
      });
      return data.user;
    }
  }

  return null;
}
