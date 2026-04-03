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
        <div id="pwa-native-splash" style={{ position: 'fixed', inset: 0, zIndex: 99999, backgroundColor: '#0B0B0C', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', transition: 'opacity 0.4s ease-out' }}>
          <div style={{ position: 'absolute', height: '18rem', width: '18rem', borderRadius: '9999px', backgroundColor: 'rgba(57,255,20,0.06)', filter: 'blur(80px)' }} />
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.75rem' }}>
            <img src="/streak-logo-header-tight.png" alt="Streak" style={{ height: '52px', objectFit: 'contain' }} fetchPriority="high" />
            <div style={{ display: 'flex', gap: '0.375rem' }}>
              <div style={{ height: '0.375rem', width: '0.375rem', borderRadius: '9999px', backgroundColor: '#39FF14', animation: 'dotPulse 1.4s ease-in-out infinite', opacity: 0.35 }} />
              <div style={{ height: '0.375rem', width: '0.375rem', borderRadius: '9999px', backgroundColor: '#39FF14', animation: 'dotPulse 1.4s ease-in-out 0.18s infinite', opacity: 0.35 }} />
              <div style={{ height: '0.375rem', width: '0.375rem', borderRadius: '9999px', backgroundColor: '#39FF14', animation: 'dotPulse 1.4s ease-in-out 0.36s infinite', opacity: 0.35 }} />
            </div>
          </div>
          <style dangerouslySetInnerHTML={{__html: `
            @keyframes dotPulse {
              0%, 80%, 100% { opacity: 0.25; transform: scale(0.85); }
              40% { opacity: 1; transform: scale(1); }
            }
          `}} />
          <Script id="splash-dismiss" strategy="afterInteractive" dangerouslySetInnerHTML={{__html: `
            if (typeof window !== 'undefined') {
               window.addEventListener('load', function() {
                 setTimeout(function() {
                   var splash = document.getElementById('pwa-native-splash');
                   if (splash) {
                     splash.style.opacity = '0';
                     splash.style.pointerEvents = 'none';
                     setTimeout(function() { splash.style.display = 'none'; }, 400);
                   }
                 }, 400); // short buffer to ensure next.js has painted
               });
            }
          `}} />
        </div>
        {children}
      </body>
    </html>
  );
}
