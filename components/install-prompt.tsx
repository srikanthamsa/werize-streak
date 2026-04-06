"use client";

import { useEffect, useState } from "react";

type Platform = "android" | "ios" | null;

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPrompt() {
  const [platform, setPlatform] = useState<Platform>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Don't show if already running as installed PWA
    const isStandalone =
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true ||
      window.matchMedia("(display-mode: standalone)").matches;
    if (isStandalone) return;

    const ua = navigator.userAgent;
    const isIos = /iphone|ipad|ipod/i.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;

    if (isIos) {
      setPlatform("ios");
      setVisible(true);
    } else {
      // Covers Android Chrome and desktop Chrome/Edge — any browser that fires beforeinstallprompt
      const handler = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e as BeforeInstallPromptEvent);
        setPlatform("android");
        setVisible(true);
      };
      window.addEventListener("beforeinstallprompt", handler);
      return () => window.removeEventListener("beforeinstallprompt", handler);
    }
  }, []);

  function dismiss() {
    setVisible(false);
  }

  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted" || outcome === "dismissed") {
      setVisible(false);
    }
    setDeferredPrompt(null);
  }

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 80,
        left: 16,
        right: 16,
        zIndex: 9999,
        background: "#141414",
        border: "1px solid rgba(57,255,20,0.18)",
        borderRadius: 16,
        padding: "16px 18px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        boxShadow: "0 4px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(57,255,20,0.06)",
        animation: "slideUp 0.3s cubic-bezier(0.23,1,0.32,1) both",
      }}
    >
      <style>{`@keyframes slideUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* App icon */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/streak-app-icon.png"
        alt="Streak"
        style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0 }}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: "#fff", fontWeight: 600, fontSize: 14, lineHeight: 1.3 }}>
          Add Streak to Home Screen
        </div>
        {platform === "ios" ? (
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 3, lineHeight: 1.4 }}>
            Tap <ShareIcon /> then &ldquo;Add to Home Screen&rdquo;
          </div>
        ) : (
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 3 }}>
            Get the full app experience
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        {platform === "android" && (
          <button
            onClick={install}
            style={{
              background: "#39FF14",
              color: "#0b0b0c",
              border: "none",
              borderRadius: 8,
              padding: "7px 14px",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Install
          </button>
        )}
        <button
          onClick={dismiss}
          style={{
            background: "rgba(255,255,255,0.08)",
            color: "rgba(255,255,255,0.5)",
            border: "none",
            borderRadius: 8,
            padding: "7px 10px",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function ShareIcon() {
  return (
    <svg
      style={{ display: "inline", verticalAlign: "middle", margin: "0 2px" }}
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}
