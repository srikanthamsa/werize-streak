"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { saveCredentialsAction, type SetupState } from "@/app/setup/actions";

function formatLastSynced(lastSyncedAt: string | null) {
  if (!lastSyncedAt) {
    return "No successful sync yet";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(lastSyncedAt));
}

function mapAuthMessage(message: string) {
  const lower = message.toLowerCase();

  if (lower.includes("rate limit")) {
    return "Too many login links sent. Use the latest email you already received, or wait a few minutes.";
  }

  if (lower.includes("invalid login credentials")) {
    return "That sign-in link is no longer valid. Request a fresh one.";
  }

  if (lower.includes("auth_failed")) {
    return "That sign-in link did not complete cleanly. Try again with a fresh one.";
  }

  if (lower.includes("missing_code")) {
    return "That sign-in link was incomplete. Request a fresh magic link.";
  }

  if (lower.includes("anon_key")) {
    return "Auth is not configured yet. Add the public Supabase anon key before testing self-serve login.";
  }

  return message;
}

const initialSetupState: SetupState = {
  ok: false,
  message: "",
};

export function OnboardingForm({
  isAuthenticated,
  userEmail,
  profileName,
  team,
  role,
  greythrUserId,
  greythrUsername,
  leaderboardOptIn,
  isLive,
  lastSyncedAt,
  authError,
}: {
  isAuthenticated: boolean;
  userEmail: string;
  profileName: string;
  team: string;
  role: string;
  greythrUserId: string;
  greythrUsername: string;
  leaderboardOptIn: boolean;
  isLive: boolean;
  lastSyncedAt: string | null;
  authError?: string;
}) {
  const [authMessage, setAuthMessage] = useState(authError ? mapAuthMessage(authError) : "");
  const [authPending, setAuthPending] = useState(false);
  const [redirectingToGoogle, setRedirectingToGoogle] = useState(false);
  const [hashLoginPending, setHashLoginPending] = useState(false);
  const [setupState, setupAction, setupPending] = useActionState(saveCredentialsAction, initialSetupState);
  const router = useRouter();
  const lastSyncedLabel = formatLastSynced(lastSyncedAt);
  const supabase = useMemo(() => {
    try {
      return getSupabaseBrowser();
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (setupState.ok) {
      router.push("/");
    }
  }, [router, setupState.ok]);

  useEffect(() => {
    setAuthMessage(authError ? mapAuthMessage(authError) : "");
  }, [authError]);

  useEffect(() => {
    if (isAuthenticated || typeof window === "undefined") {
      return;
    }

    const hash = window.location.hash.startsWith("#")
      ? new URLSearchParams(window.location.hash.slice(1))
      : null;

    const accessToken = hash?.get("access_token");
    const refreshToken = hash?.get("refresh_token");
    const expiresIn = hash?.get("expires_in");

    if (!accessToken || !refreshToken) {
      return;
    }

    setHashLoginPending(true);
    setAuthMessage("");

    void fetch("/api/auth/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        accessToken,
        refreshToken,
        expiresIn: expiresIn ? Number(expiresIn) : 3600,
      }),
    }).then(async (response) => {
      if (!response.ok) {
        setAuthMessage("We could not finish signing you in. Request a fresh magic link.");
        setHashLoginPending(false);
        return;
      }

      window.history.replaceState({}, "", "/setup");
      router.refresh();
      // Keep hashLoginPending true while we wait for router redirect
    }).catch(() => {
      setAuthMessage("We could not finish signing you in. Request a fresh magic link.");
      setHashLoginPending(false);
    });
  }, [isAuthenticated, router]);

  async function handleGoogleSignIn() {
    if (!supabase) {
      setAuthMessage("Supabase client is missing.");
      return;
    }

    setAuthPending(true);
    setAuthMessage("");

    const redirectTo = `${window.location.origin}/auth/callback?next=/`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
      },
    });

    if (error) {
      setAuthMessage(error.message);
      setAuthPending(false);
    } else {
      // OAuth redirect is in progress — show a clear 'Redirecting' message
      setRedirectingToGoogle(true);
    }
  }

  return (
    <main className="min-h-screen bg-[#0B0B0C] px-4 py-6 text-white sm:px-6 lg:px-10">
      <div className="magic-grid" />
      <div className="relative z-10 flex min-h-[calc(100vh-3rem)] items-center justify-center">
        <div className="magic-panel mx-auto w-full max-w-3xl rounded-[32px] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="magic-tech-label text-xs uppercase tracking-[0.24em] text-[#A1A1AA]">
                {isLive ? "Settings" : "Streak Setup"}
              </p>
              {isLive ? (
                <Link href="/" className="text-sm font-semibold text-[#A1A1AA] hover:text-white transition">
                  Back to Dashboard
                </Link>
              ) : null}
            </div>
            <h1
              className={`text-white text-[38px] font-semibold leading-[1.02] tracking-[-0.035em] sm:text-[52px]`}
            >
              {isAuthenticated ? (
                isLive ? "Update your settings." : "Turn on the magic once."
              ) : (
                <>
                  Who said 9 hours can&apos;t be fun? Sign in to{" "}
                  <span className="inline-block bg-gradient-to-r from-[#B9FF31] to-[#67FF39] bg-clip-text font-black italic uppercase tracking-[-0.05em] text-transparent">
                    Streak
                  </span>
                  .
                </>
              )}
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-[#A1A1AA]">
              {isAuthenticated
                ? (isLive ? "Update your greytHR password, display name, or leaderboard preferences below." 
                          : "Connect your work account once and let Streak quietly handle the rest.")
                : "Sign in with your work Google account. We'll keep the rest simple."}
            </p>
          </div>

          <div className="mt-8">
            {!isAuthenticated ? (
              <div className="max-w-xl space-y-4">
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={authPending || hashLoginPending}
                  className="inline-flex w-full sm:w-auto items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-[#0B0B0C] transition hover:bg-gray-200 disabled:opacity-60 gap-3"
                >
                  {redirectingToGoogle ? (
                    <>
                      <svg className="h-5 w-5 animate-spin text-[#0B0B0C]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    </>
                  ) : authPending || hashLoginPending ? (
                    <svg className="h-5 w-5 animate-spin text-[#0B0B0C]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M17.64 9.20455C17.64 8.56636 17.5827 7.95273 17.4764 7.36364H9V10.845H13.8436C13.635 11.97 13.0009 12.9232 12.0477 13.5614V15.8195H14.9564C16.6582 14.2527 17.64 11.9455 17.64 9.20455Z" fill="#4285F4"/>
                      <path d="M9 18C11.43 18 13.4673 17.1941 14.9564 15.8195L12.0477 13.5614C11.2418 14.1014 10.2109 14.4205 9 14.4205C6.65591 14.4205 4.67182 12.8373 3.96409 10.71H0.957275V13.0418C2.43818 15.9832 5.48182 18 9 18Z" fill="#34A853"/>
                      <path d="M3.96409 10.71C3.78409 10.17 3.68182 9.59318 3.68182 9C3.68182 8.40682 3.78409 7.83 3.96409 7.29V4.95818H0.957275C0.347727 6.17318 0 7.54773 0 9C0 10.4523 0.347727 11.8268 0.957275 13.0418L3.96409 10.71Z" fill="#FBBC05"/>
                      <path d="M9 3.57955C10.3214 3.57955 11.5077 4.03364 12.4405 4.92545L15.0218 2.34409C13.4632 0.891818 11.4259 0 9 0C5.48182 0 2.43818 2.01682 0.957275 4.95818L3.96409 7.29C4.67182 5.16273 6.65591 3.57955 9 3.57955Z" fill="#EA4335"/>
                    </svg>
                  )}
                  {redirectingToGoogle ? "Redirecting to Google..." : hashLoginPending ? "Signing you in..." : authPending ? "Connecting..." : "Sign in with Google"}
                </button>

                {authMessage ? (
                  <div
                    className={`rounded-[20px] px-4 py-3 text-sm leading-6 bg-[rgba(248,113,113,0.1)] text-[#FCA5A5]`}
                  >
                    {authMessage}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                <form className="space-y-4" action={setupAction}>
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-white">Work email</span>
                    <input
                      type="email"
                      name="email"
                      defaultValue={userEmail}
                      placeholder="name@werize.com"
                      className="w-full rounded-2xl bg-[#17171A] px-4 py-3 text-sm text-white outline-none transition placeholder:text-[#71717A] focus:ring-1 focus:ring-[#7DFF31]"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-white">Your name</span>
                    <input
                      type="text"
                      name="fullName"
                      required
                      defaultValue={profileName}
                      placeholder="Enter your name"
                      className="w-full rounded-2xl bg-[#17171A] px-4 py-3 text-sm text-white outline-none transition placeholder:text-[#71717A] focus:ring-1 focus:ring-[#7DFF31]"
                    />
                  </label>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-2 block text-sm font-semibold text-white">Team</span>
                      <input
                        type="text"
                        name="team"
                        required
                        defaultValue={team}
                        placeholder="e.g. Product Team"
                        className="w-full rounded-2xl bg-[#17171A] px-4 py-3 text-sm text-white outline-none transition placeholder:text-[#71717A] focus:ring-1 focus:ring-[#7DFF31]"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm font-semibold text-white">Role</span>
                      <input
                        type="text"
                        name="role"
                        defaultValue={role}
                        placeholder="e.g. Product Analyst"
                        className="w-full rounded-2xl bg-[#17171A] px-4 py-3 text-sm text-white outline-none transition placeholder:text-[#71717A] focus:ring-1 focus:ring-[#7DFF31]"
                      />
                    </label>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-2 block text-sm font-semibold text-white">greytHR Employee ID</span>
                      <input
                        type="text"
                        name="greythrUsername"
                        required
                        defaultValue={greythrUsername}
                        placeholder="e.g. 03420"
                        className="w-full rounded-2xl bg-[#17171A] px-4 py-3 text-sm text-white outline-none transition placeholder:text-[#71717A] focus:ring-1 focus:ring-[#7DFF31]"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm font-semibold text-white">greytHR password</span>
                      <div className="relative">
                        <input
                          type="password"
                          name="greythrPassword"
                          required={!isLive}
                          placeholder={isLive ? "••••••••" : "Your password"}
                          className="w-full rounded-2xl bg-[#17171A] px-4 py-3 text-sm text-white outline-none transition placeholder:text-[#71717A] focus:ring-1 focus:ring-[#7DFF31]"
                        />
                        {isLive ? (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 px-3 py-1 rounded-full bg-[rgba(57,255,20,0.1)] border border-[rgba(57,255,20,0.2)]">
                            <svg xmlns="http://www.w3.org/2000/svg" className="size-3 text-[#39FF14]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                            <span className="text-[10px] font-bold text-[#39FF14] uppercase tracking-wider">Secure</span>
                          </div>
                        ) : null}
                      </div>
                    </label>
                  </div>

                  <div className="rounded-[24px] bg-[#17171A] p-4">
                    <p className="text-sm font-semibold text-[#7DFF31]">Typed once. Encrypted immediately.</p>
                    <p className="mt-2 text-sm leading-6 text-[#A1A1AA]">
                      We secure it server-side, run your first sync automatically, and then keep the math out of your life.
                    </p>
                  </div>

                  <label className="flex items-start gap-3 rounded-[24px] bg-[#17171A] px-4 py-4">
                    <input
                      type="checkbox"
                      name="leaderboardOptIn"
                      defaultChecked={leaderboardOptIn}
                      className="mt-1 size-4 rounded border-[#2A2A30] text-[#7DFF31] focus:ring-[#7DFF31]"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-white">Appear on the company board</span>
                      <span className="mt-1 block text-sm leading-6 text-[#A1A1AA]">
                        On by default. Your hours and streak will show up in company-wide rankings. Uncheck if you'd rather keep your stats private.
                      </span>
                    </span>
                  </label>

                  <button
                    type="submit"
                    disabled={setupPending}
                    className="inline-flex rounded-full bg-gradient-to-r from-[#B9FF31] to-[#67FF39] px-5 py-3 text-sm font-semibold text-[#0B0B0C] transition hover:translate-y-[-1px] disabled:opacity-60 gap-2 items-center"
                  >
                    {setupPending ? (
                      <>
                        <svg className="h-4 w-4 animate-spin text-[#0B0B0C]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        {isLive ? "Updating details..." : "Saving and running first sync..."}
                      </>
                    ) : (
                      isLive ? "Save Settings" : "Turn on the magic"
                    )}
                  </button>

                  {setupState.message ? (
                    <p className={`text-sm ${setupState.ok ? "text-[#7DFF31]" : "text-[#F87171]"}`}>
                      {setupState.message}
                    </p>
                  ) : null}
                </form>

                <div className="rounded-[28px] bg-[#141416] p-5 text-white">
                  <p className="magic-tech-label text-xs uppercase tracking-[0.24em] text-[#A1A1AA]">Connection</p>
                  <div className="mt-5 grid gap-3">
                    <div className="rounded-[22px] bg-[#17171A] px-4 py-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-[#A1A1AA]">Profile</p>
                      <p className="mt-2 text-base font-semibold text-white">{profileName || "Waiting for you"}</p>
                      <p className="mt-1 text-sm text-[#A1A1AA]">{team || "Finish setup"}</p>
                    </div>
                    <div className="rounded-[22px] bg-[#17171A] px-4 py-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-[#A1A1AA]">Sync state</p>
                      <p className="mt-2 text-base font-semibold text-white">
                        {isLive ? "Magic is live" : "Ready for first sync"}
                      </p>
                      <p className="mt-1 text-sm text-[#A1A1AA]">Last successful sync: {lastSyncedLabel}</p>
                    </div>
                  </div>

                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
