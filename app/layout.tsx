import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Streak",
  description: "Attendance insights and hour bank dashboard for greytHR swipe data.",
  icons: {
    icon: "/streak-logo-clean.png",
    shortcut: "/streak-logo-clean.png",
    apple: "/streak-logo-clean.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Streak",
  },
  manifest: "/manifest.json",
};

export const viewport = {
  themeColor: "#0B0B0C",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var saved = localStorage.getItem("streak-theme");
                var resolved = saved === "light" || saved === "dark"
                  ? saved
                  : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
                document.documentElement.dataset.theme = resolved;
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body className={inter.variable} suppressHydrationWarning>
        {/*
          PWA NATIVE-LAUNCH SPLASH SCREEN
          ─────────────────────────────────────────────────────────────────────
          This div is injected into the raw HTML shell so it is parsed and
          painted at the very first byte — before ANY JavaScript executes.
          It eliminates the black-screen gap caused by the network round-trip
          to Vercel while the OS is waiting for the first render.

          The inline <script> below attaches two listeners:
            1. window 'load'  → React bundle is parsed, dismiss after 200ms
            2. 'appReady' event → fired by the React app when UI is mounted
          Plus a 5 s safety timeout so the splash never gets stuck.

          React never "owns" this node — it is removed from the DOM before
          hydration completes, so there are zero hydration mismatches.
          ─────────────────────────────────────────────────────────────────────
        */}
        <div
          id="html-splash"
          suppressHydrationWarning
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "#0B0B0C",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          {/* Ambient glow */}
          <div
            suppressHydrationWarning
            style={{
              position: "absolute",
              height: "288px",
              width: "288px",
              borderRadius: "9999px",
              background: "rgba(57,255,20,0.06)",
              filter: "blur(80px)",
            }}
          />

          {/* Logo + dots */}
          <div
            suppressHydrationWarning
            style={{
              position: "relative",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "28px",
              animation: "splashIn 0.55s cubic-bezier(0.34,1.56,0.64,1) both",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/streak-logo-header-tight.png"
              alt="Streak"
              style={{ height: "52px", width: "210px", objectFit: "contain" }}
            />

            <div
              suppressHydrationWarning
              style={{ display: "flex", alignItems: "center", gap: "6px" }}
            >
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  suppressHydrationWarning
                  style={{
                    height: "6px",
                    width: "6px",
                    borderRadius: "9999px",
                    background: "#39FF14",
                    animation: `dotPulse 1.4s ease-in-out ${i * 0.18}s infinite`,
                    opacity: 0.35,
                  }}
                />
              ))}
            </div>
          </div>

          {/* Keyframe CSS — scoped to this splash only */}
          <style
            suppressHydrationWarning
            dangerouslySetInnerHTML={{
              __html: `
                @keyframes splashIn {
                  from { opacity: 0; transform: scale(0.82); }
                  to   { opacity: 1; transform: scale(1); }
                }
                @keyframes dotPulse {
                  0%, 80%, 100% { opacity: 0.25; transform: scale(0.85); }
                  40%           { opacity: 1;    transform: scale(1); }
                }
              `,
            }}
          />

          {/*
            Dismiss logic — pure vanilla JS, zero framework dependencies.

            Runs synchronously as the parser reaches this tag, capturing a
            reference to the splash div.  Dismissal is triggered by whichever
            comes first:
              • window 'load'    — all resources fetched, React bundle ready
              • 'appReady' event — dispatched by React when the UI mounts
              • 5 000 ms timeout — absolute safety net
          */}
          <script
            suppressHydrationWarning
            dangerouslySetInnerHTML={{
              __html: `
                (function () {
                  var el = document.getElementById('html-splash');
                  var done = false;

                  function dismiss() {
                    if (done || !el) return;
                    done = true;
                    el.style.transition = 'opacity 0.45s ease';
                    el.style.opacity = '0';
                    setTimeout(function () {
                      if (el && el.parentNode) el.parentNode.removeChild(el);
                    }, 460);
                  }

                  // Primary: React bundle has loaded → brief pause then dismiss
                  window.addEventListener('load', function () {
                    setTimeout(dismiss, 200);
                  });

                  // Optional: React app can fire new CustomEvent('appReady')
                  // from a useEffect to dismiss the splash the instant the UI mounts
                  window.addEventListener('appReady', dismiss);

                  // Safety: never block the user for more than 5 s
                  setTimeout(dismiss, 5000);
                })();
              `,
            }}
          />
        </div>

        {children}
      </body>
    </html>
  );
}
