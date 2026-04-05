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
    icon: "/streak-app-icon.png",
    shortcut: "/streak-app-icon.png",
    apple: "/streak-app-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Streak",
  },
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
        {/* apple-touch-startup-image: native iOS splash shown BEFORE the WebView starts.
            Covers all common iPhone sizes (portrait). Physical px = CSS px × DPR. */}
        {/* iPhone SE 2nd/3rd gen — 375×667 @2x */}
        <link rel="apple-touch-startup-image" href="/splash?w=750&h=1334"
          media="screen and (device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        {/* iPhone 13 mini / 12 mini — 375×812 @3x */}
        <link rel="apple-touch-startup-image" href="/splash?w=1125&h=2436"
          media="screen and (device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        {/* iPhone 12 / 13 / 14 — 390×844 @3x */}
        <link rel="apple-touch-startup-image" href="/splash?w=1170&h=2532"
          media="screen and (device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        {/* iPhone 14 Pro / 15 / 15 Pro — 393×852 @3x */}
        <link rel="apple-touch-startup-image" href="/splash?w=1179&h=2556"
          media="screen and (device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        {/* iPhone 14 Plus — 428×926 @3x */}
        <link rel="apple-touch-startup-image" href="/splash?w=1284&h=2778"
          media="screen and (device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        {/* iPhone 14 Pro Max / 15 Plus / 15 Pro Max — 430×932 @3x */}
        <link rel="apple-touch-startup-image" href="/splash?w=1290&h=2796"
          media="screen and (device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        {/* iPhone 16 / 16 Pro — 393×852 @3x (same as 14 Pro, covered above) */}
        {/* iPhone 16 Plus — 430×932 @3x (same as 15 Pro Max, covered above) */}
        {/* iPhone 16 Pro Max — 440×956 @3x */}
        <link rel="apple-touch-startup-image" href="/splash?w=1320&h=2868"
          media="screen and (device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
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
        <Script
          id="pwa-splash"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var isStandalone =
                  window.navigator.standalone === true ||
                  window.matchMedia("(display-mode: standalone)").matches;
                if (isStandalone) {
                  // Immediately hide body content so the page never flashes
                   // through before the splash is painted.
                   document.documentElement.style.background = "#0B0B0C";
 
                   var style = document.createElement("style");
                   style.id = "pwa-splash-style";
                   style.textContent = [
                     "@keyframes pwaDot{0%,80%,100%{opacity:0.25;transform:scale(0.85)}40%{opacity:1;transform:scale(1)}}",
                     "@keyframes pwaSplashIn{from{opacity:0;transform:translateY(10px);scale:0.96}to{opacity:1;transform:translateY(0);scale:1}}",
                     "#pwa-splash-screen{position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:32px;background:#0B0B0C;transition:opacity 0.4s ease;}",
                     "#pwa-splash-glow{position:absolute;width:100%;height:100%;background:radial-gradient(circle at center, rgba(57,255,20,0.08) 0%, transparent 70%);}",
                   ].join("");
                   document.head.appendChild(style);
 
                   var el = document.createElement("div");
                   el.id = "pwa-splash-screen";
                   el.innerHTML = [
                     '<div id="pwa-splash-glow"></div>',
                     '<div style="position:relative;display:flex;flex-direction:column;align-items:center;gap:32px;animation:pwaSplashIn 0.6s cubic-bezier(0.23, 1, 0.32, 1) both;">',
                     '  <img src="/streak-app-icon.png" alt="Streak" style="width:120px;height:120px;opacity:0.95;border-radius:24px;" />',
                     '  <div style="display:flex;gap:8px;">',
                     '    <div style="width:7px;height:7px;border-radius:50%;background:#39FF14;animation:pwaDot 1.4s ease-in-out 0s infinite;opacity:0.35;"></div>',
                     '    <div style="width:7px;height:7px;border-radius:50%;background:#39FF14;animation:pwaDot 1.4s ease-in-out 0.18s infinite;opacity:0.35;"></div>',
                     '    <div style="width:7px;height:7px;border-radius:50%;background:#39FF14;animation:pwaDot 1.4s ease-in-out 0.36s infinite;opacity:0.35;"></div>',
                     '  </div>',
                     '</div>'
                   ].join("");
 
                   // Append before body content loads
                   if (document.body) {
                     document.body.style.background = "#0B0B0C";
                     document.body.prepend(el);
                   } else {
                     var observer = new MutationObserver(function(mutations, obs) {
                       if (document.body) {
                         document.body.style.background = "#0B0B0C";
                         document.body.prepend(el);
                         obs.disconnect();
                       }
                     });
                     observer.observe(document.documentElement, { childList: true });
                   }

                  var shownAt = Date.now();
                  var MIN_MS = 1600;
                  function removeSplash() {
                    var wait = Math.max(0, MIN_MS - (Date.now() - shownAt));
                    setTimeout(function() {
                      el.style.opacity = "0";
                      setTimeout(function() { if (el.parentNode) el.remove(); }, 420);
                    }, wait);
                  }
                  if (document.readyState === "complete") {
                    removeSplash();
                  } else {
                    window.addEventListener("load", removeSplash, { once: true });
                  }
                }
              } catch(e) {}
            `,
          }}
        />
      </head>
      <body className={inter.variable} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
