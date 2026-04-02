import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const response = NextResponse.redirect(new URL("/setup", url.origin));

  // Clear the auth cookies
  response.cookies.delete("streak-access-token");
  response.cookies.delete("streak-refresh-token");

  return response;
}
