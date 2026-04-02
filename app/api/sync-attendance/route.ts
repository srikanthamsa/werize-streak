import { NextResponse } from "next/server";
import { runAttendanceSync } from "@/app/actions";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { profileId?: string };

    if (!body.profileId) {
      return NextResponse.json(
        { ok: false, message: "Missing profileId for sync." },
        { status: 400 },
      );
    }

    const result = await runAttendanceSync(body.profileId);
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Unknown sync error.",
      },
      { status: 500 },
    );
  }
}
