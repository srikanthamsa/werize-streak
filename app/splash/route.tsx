import { ImageResponse } from "next/og";

export const runtime = "edge";

// Generates the apple-touch-startup-image PNG for iOS PWA splash screen.
// Called with ?w=<width>&h=<height> matching physical pixel dimensions per device.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const w = Math.max(1, Math.min(2796, Number(searchParams.get("w") || 1290)));
  const h = Math.max(1, Math.min(2796, Number(searchParams.get("h") || 2796)));

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
          gap: 40,
        }}
      >
        {/* Ambient glow */}
        <div
          style={{
            position: "absolute",
            width: 320,
            height: 320,
            borderRadius: "50%",
            background: "rgba(57,255,20,0.07)",
            filter: "blur(80px)",
            display: "flex",
          }}
        />
        {/* Logo */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoUrl}
          alt="Streak"
          width={logoWidth}
          style={{ objectFit: "contain" }}
        />
        {/* Dots */}
        <div style={{ display: "flex", gap: 8 }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#39FF14",
                opacity: 0.4 + i * 0.2,
              }}
            />
          ))}
        </div>
      </div>
    ),
    { width: w, height: h }
  );
}
