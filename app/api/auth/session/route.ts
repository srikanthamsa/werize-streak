import { NextResponse } from "next/server";
import { ACCESS_TOKEN_MAX_AGE, REFRESH_TOKEN_MAX_AGE } from "@/lib/supabase/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      accessToken?: string;
      refreshToken?: string;
      expiresIn?: number;
    };

    if (!body.accessToken || !body.refreshToken) {
      return NextResponse.json(
        { ok: false, message: "Missing session tokens." },
        { status: 400 },
      );
    }

    const response = NextResponse.json({ ok: true });

    response.cookies.set("streak-access-token", body.accessToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: ACCESS_TOKEN_MAX_AGE,
    });

    response.cookies.set("streak-refresh-token", body.refreshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: REFRESH_TOKEN_MAX_AGE,
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Unknown session error.",
      },
      { status: 500 },
    );
  }
}
