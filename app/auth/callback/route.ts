import { NextResponse } from "next/server";
import { createClient, type EmailOtpType } from "@supabase/supabase-js";

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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const otpType = url.searchParams.get("type");
  const next = url.searchParams.get("next") ?? "/";

  const supabase = getSupabaseAuthClient();
  let accessToken: string | undefined;
  let refreshToken: string | undefined;
  let expiresIn: number | undefined;

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error || !data.session) {
      return NextResponse.redirect(new URL(`/setup?error=auth_failed`, url.origin));
    }

    accessToken = data.session.access_token;
    refreshToken = data.session.refresh_token;
    expiresIn = data.session.expires_in ?? 3600;
  } else if (tokenHash && otpType) {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType as EmailOtpType,
    });

    if (error || !data.session) {
      return NextResponse.redirect(new URL(`/setup?error=auth_failed`, url.origin));
    }

    accessToken = data.session.access_token;
    refreshToken = data.session.refresh_token;
    expiresIn = data.session.expires_in ?? 3600;
  } else {
    return NextResponse.redirect(new URL(`/setup?error=missing_code`, url.origin));
  }
  const response = NextResponse.redirect(new URL(next, url.origin));

  response.cookies.set("streak-access-token", accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: expiresIn,
  });

  response.cookies.set("streak-refresh-token", refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}
