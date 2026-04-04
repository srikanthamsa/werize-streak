import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ACCESS_TOKEN_MAX_AGE, REFRESH_TOKEN_MAX_AGE } from "@/lib/supabase/auth";

// Middleware runs on the Edge and can write Set-Cookie headers onto the
// response — the only safe place to refresh tokens in Next.js App Router.

export const config = {
  matcher: [
    // Run on all routes except static files and Next.js internals
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|lottie|webmanifest|json)).*)",
  ],
};

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();

  const accessToken  = request.cookies.get("streak-access-token")?.value;
  const refreshToken = request.cookies.get("streak-refresh-token")?.value;

  // Nothing to do if there are no auth cookies at all
  if (!refreshToken) return response;

  // If access token exists, validate it quickly without a network call
  // by checking the JWT expiry claim (no round-trip needed).
  if (accessToken) {
    try {
      const [, payloadB64] = accessToken.split(".");
      const payload = JSON.parse(
        Buffer.from(payloadB64 ?? "", "base64url").toString("utf8"),
      ) as { exp?: number };
      const expiresAt = (payload.exp ?? 0) * 1000;
      // Still valid for more than 60 seconds — nothing to do
      if (Date.now() < expiresAt - 60_000) return response;
    } catch {
      // Malformed JWT — fall through to refresh
    }
  }

  // Token is missing or expiring soon — refresh it
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return response;

  const supabase = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: refreshToken,
  });

  if (error || !data.session) return response;

  const isSecure = process.env.NODE_ENV === "production";
  const cookieOpts = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isSecure,
    path: "/",
  };

  response.cookies.set("streak-access-token", data.session.access_token, {
    ...cookieOpts,
    maxAge: ACCESS_TOKEN_MAX_AGE,
  });
  response.cookies.set("streak-refresh-token", data.session.refresh_token, {
    ...cookieOpts,
    maxAge: REFRESH_TOKEN_MAX_AGE,
  });

  return response;
}
