import { ImageResponse } from "next/og";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

// Generates the apple-touch-startup-image PNG for iOS PWA splash screen.
// Called with ?w=<width>&h=<height> matching physical pixel dimensions per device.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const w = Math.max(1, Math.min(2796, Number(searchParams.get("w") || 1290)));
  const h = Math.max(1, Math.min(2796, Number(searchParams.get("h") || 2796)));

  // Read icon directly from the filesystem — no self-referencing HTTP fetch needed.
  const iconPath = path.join(process.cwd(), "public", "streak-app-icon.png");
  const iconData = fs.readFileSync(iconPath);
  const iconSrc = `data:image/png;base64,${iconData.toString("base64")}`;

  const logoWidth = Math.round(w * 0.45); // 45% of screen width

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
        {/* Large ambient glow fallback */}
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

        {/* Logo container */}
        <div style={{ display: "flex", position: "relative" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={iconSrc}
            alt="Streak"
            width={logoWidth}
            height={logoWidth}
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
    {
      width: w,
      height: h,
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    }
  );
}
