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
                  var el = document.createElement("div");
                  el.id = "pwa-splash-screen";
                  el.style.cssText = [
                    "position:fixed","inset:0","z-index:99999",
                    "display:flex","flex-direction:column",
                    "align-items:center","justify-content:center","gap:28px",
                    "background:#0B0B0C",
                    "transition:opacity 0.35s ease",
                  ].join(";");
                  el.innerHTML = '<img src="/streak-logo-header-tight.png" alt="Streak" style="width:210px;height:auto;object-fit:contain;" />'
                    + '<div style="display:flex;gap:6px;">'
                    + '<div class="pwa-dot" style="width:6px;height:6px;border-radius:50%;background:#39FF14;animation:pwaDot 1.4s ease-in-out 0s infinite;opacity:0.35;"></div>'
                    + '<div class="pwa-dot" style="width:6px;height:6px;border-radius:50%;background:#39FF14;animation:pwaDot 1.4s ease-in-out 0.18s infinite;opacity:0.35;"></div>'
                    + '<div class="pwa-dot" style="width:6px;height:6px;border-radius:50%;background:#39FF14;animation:pwaDot 1.4s ease-in-out 0.36s infinite;opacity:0.35;"></div>'
                    + '</div>';
                  var style = document.createElement("style");
                  style.textContent = "@keyframes pwaDot{0%,80%,100%{opacity:0.25;transform:scale(0.85)}40%{opacity:1;transform:scale(1)}}";
                  document.head.appendChild(style);
                  document.body.appendChild(el);
                  function removeSplash() {
                    el.style.opacity = "0";
                    setTimeout(function() { el.remove(); }, 380);
                  }
                  if (document.readyState === "complete") {
                    setTimeout(removeSplash, 400);
                  } else {
                    window.addEventListener("load", function() { setTimeout(removeSplash, 400); }, { once: true });
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
