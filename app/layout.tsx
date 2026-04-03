import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import { PwaSplashRemover } from "@/components/pwa-splash-remover";
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
        {/* Static HTML splash — renders before JS loads, eliminates PWA black screen.
            PwaSplashRemover removes it once React hydrates; loading.tsx takes over seamlessly. */}
        <div
          id="pwa-splash"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "#0B0B0C",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
          }}
        >
          <style>{`
            @keyframes pwa-splash-in {
              from { opacity: 0; transform: scale(0.82); }
              to   { opacity: 1; transform: scale(1); }
            }
            @keyframes pwa-dot-pulse {
              0%, 80%, 100% { opacity: 0.25; transform: scale(0.85); }
              40%           { opacity: 1;    transform: scale(1); }
            }
          `}</style>
          <div style={{ position: "absolute", height: 288, width: 288, borderRadius: "50%", background: "rgba(57,255,20,0.06)", filter: "blur(80px)" }} />
          <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 28, animation: "pwa-splash-in 0.55s cubic-bezier(0.34,1.56,0.64,1) both" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/streak-logo-header-tight.png" alt="Streak" style={{ height: 52, width: 210, objectFit: "contain" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {([0, 0.18, 0.36] as const).map((delay, i) => (
                <div key={i} style={{ height: 6, width: 6, borderRadius: "50%", background: "#39FF14", opacity: 0.35, animation: `pwa-dot-pulse 1.4s ease-in-out ${delay}s infinite` }} />
              ))}
            </div>
          </div>
        </div>
        <PwaSplashRemover />
        {children}
      </body>
    </html>
  );
}
