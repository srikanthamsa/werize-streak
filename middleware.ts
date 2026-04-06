import { NextResponse } from "next/server";

// No auth — single-user app. Middleware is a simple passthrough.
export function middleware() {
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|lottie|webmanifest|json)).*)",
  ],
};
