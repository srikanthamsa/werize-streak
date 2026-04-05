import { ImageResponse } from "next/og";

export const runtime = "edge";

// Generates the apple-touch-startup-image PNG for iOS PWA splash screen.
// Called with ?w=<width>&h=<height> matching physical pixel dimensions per device.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const w = Math.max(1, Math.min(2796, Number(searchParams.get("w") || 1290)));
  const h = Math.max(1, Math.min(2796, Number(searchParams.get("h") || 2796)));

  // More reliable origin detection for various environments
  const proto = request.headers.get("x-forwarded-proto") || "http";
  const host = request.headers.get("host");
  const origin = host ? `${proto}://${host}` : new URL(request.url).origin;

  const logoUrl = `${origin}/streak-logo-header-tight.png`;
  const logoWidth = Math.round(w * 0.55); // 55% of screen width

  return new ImageResponse(
    (
      <div
        style={{
          background: "#0B0B0C",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 48,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Large ambient glow */}
        <div
          style={{
            position: "absolute",
            width: "100%",
            height: "100%",
            background: "radial-gradient(circle at center, rgba(57,255,20,0.08) 0%, transparent 70%)",
            display: "flex",
          }}
        />

        {/* Ambient glow behind logo */}
        <div
          style={{
            position: "absolute",
            width: Math.min(w, h) * 0.8,
            height: Math.min(w, h) * 0.8,
            borderRadius: "50%",
            background: "rgba(57,255,20,0.05)",
            filter: "blur(100px)",
            display: "flex",
          }}
        />

        {/* Logo container with fallback text if image fails */}
        <div style={{ display: "flex", position: "relative" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoUrl}
            alt="Streak"
            width={logoWidth}
            style={{ 
              objectFit: "contain",
              opacity: 1,
            }}
          />
        </div>

        {/* Dots */}
        <div style={{ display: "flex", gap: 10, position: "relative" }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "#39FF14",
                opacity: 0.35 + i * 0.2,
              }}
            />
          ))}
        </div>
      </div>
    ),
    { width: w, height: h }
  );
}
