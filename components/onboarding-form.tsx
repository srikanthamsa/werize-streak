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
  const [email, setEmail] = useState(userEmail);
  const [authMessage, setAuthMessage] = useState(authError ? mapAuthMessage(authError) : "");
  const [authPending, setAuthPending] = useState(false);
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
      setHashLoginPending(false);
    }).catch(() => {
      setAuthMessage("We could not finish signing you in. Request a fresh magic link.");
      setHashLoginPending(false);
    });
  }, [isAuthenticated, router]);

  async function handleMagicLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      setAuthMessage(mapAuthMessage("anon_key"));
      return;
    }

    setAuthPending(true);
    setAuthMessage("");

    const redirectTo = `${window.location.origin}/auth/callback?next=/setup`;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
      },
    });

    setAuthPending(false);
    setAuthMessage(
      error
        ? mapAuthMessage(error.message)
        : "Magic link sent. Open it on this device and finish setup.",
    );
  }

  return (
    <main className="min-h-screen bg-[#0B0B0C] px-4 py-6 text-white sm:px-6 lg:px-10">
      <div className="magic-grid" />
      <div className="relative z-10 flex min-h-[calc(100vh-3rem)] items-center justify-center">
        <div className="magic-panel mx-auto w-full max-w-3xl rounded-[32px] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
          <div className="flex flex-col gap-2">
            <p className="magic-tech-label text-xs uppercase tracking-[0.24em] text-[#A1A1AA]">
              Streak Setup
            </p>
            <h1
              className={`text-white ${isAuthenticated
                ? "magic-display text-[44px] leading-[0.98] tracking-[-0.025em] sm:text-[56px]"
                : "text-[38px] font-semibold leading-[1.02] tracking-[-0.035em] sm:text-[52px]"
                }`}
            >
              {isAuthenticated ? (
                "Turn on the magic once."
              ) : (
                <>
                  Sign in, and see the magic inside{" "}
                  <span className="inline-block bg-gradient-to-r from-[#B9FF31] to-[#67FF39] bg-clip-text font-black italic uppercase tracking-[-0.05em] text-transparent">
                    Streak
                  </span>
                  .
                </>
              )}
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-[#A1A1AA]">
              {isAuthenticated
                ? "Connect your work account once and let Streak quietly handle the rest."
                : "Use your work email once. We will send a magic link and keep the rest simple."}
            </p>
          </div>

          <div className="mt-8">
            {!isAuthenticated ? (
              <form className="max-w-xl space-y-4" onSubmit={handleMagicLink}>
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-white">Work email</span>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="name@werize.com"
                    className="w-full rounded-2xl bg-[#17171A] px-4 py-3 text-sm text-white outline-none transition placeholder:text-[#71717A] focus:ring-1 focus:ring-[#7DFF31]"
                  />
                </label>

                <button
                  type="submit"
                  disabled={authPending || hashLoginPending}
                  className="inline-flex rounded-full bg-gradient-to-r from-[#B9FF31] to-[#67FF39] px-5 py-3 text-sm font-semibold text-[#0B0B0C] transition hover:translate-y-[-1px] disabled:opacity-60"
                >
                  {hashLoginPending ? "Signing you in..." : authPending ? "Sending magic link..." : "Send magic link"}
                </button>

                {authMessage ? (
                  <div
                    className={`rounded-[20px] px-4 py-3 text-sm leading-6 ${authMessage.includes("Magic link sent")
                      ? "bg-[rgba(57,255,20,0.08)] text-[#C9FFB8]"
                      : "bg-[rgba(248,113,113,0.1)] text-[#FCA5A5]"
                      }`}
                  >
                    {authMessage}
                  </div>
                ) : null}
              </form>
            ) : (
              <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                <form className="space-y-4" action={setupAction}>
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-white">Work email</span>
                    <input
                      type="email"
                      value={userEmail}
                      readOnly
                      className="w-full rounded-2xl bg-[#17171A] px-4 py-3 text-sm text-[#A1A1AA] outline-none"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-white">Your name</span>
                    <input
                      type="text"
                      name="fullName"
                      required
                      defaultValue={profileName}
                      placeholder="Srikant Hamsa"
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
                        placeholder="Product Team"
                        className="w-full rounded-2xl bg-[#17171A] px-4 py-3 text-sm text-white outline-none transition placeholder:text-[#71717A] focus:ring-1 focus:ring-[#7DFF31]"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm font-semibold text-white">Role</span>
                      <input
                        type="text"
                        name="role"
                        defaultValue={role}
                        placeholder="Product Analyst"
                        className="w-full rounded-2xl bg-[#17171A] px-4 py-3 text-sm text-white outline-none transition placeholder:text-[#71717A] focus:ring-1 focus:ring-[#7DFF31]"
                      />
                    </label>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-2 block text-sm font-semibold text-white">greytHR user ID</span>
                      <input
                        type="text"
                        name="greythrUserId"
                        required
                        defaultValue={greythrUserId}
                        placeholder="3527"
                        className="w-full rounded-2xl bg-[#17171A] px-4 py-3 text-sm text-white outline-none transition placeholder:text-[#71717A] focus:ring-1 focus:ring-[#7DFF31]"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm font-semibold text-white">greytHR username</span>
                      <input
                        type="text"
                        name="greythrUsername"
                        required
                        defaultValue={greythrUsername}
                        placeholder="Employee ID or greytHR username"
                        className="w-full rounded-2xl bg-[#17171A] px-4 py-3 text-sm text-white outline-none transition placeholder:text-[#71717A] focus:ring-1 focus:ring-[#7DFF31]"
                      />
                    </label>
                  </div>

                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-white">greytHR password</span>
                    <input
                      type="password"
                      name="greythrPassword"
                      required
                      placeholder="••••••••"
                      className="w-full rounded-2xl bg-[#17171A] px-4 py-3 text-sm text-white outline-none transition placeholder:text-[#71717A] focus:ring-1 focus:ring-[#7DFF31]"
                    />
                  </label>

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
                        Private by default. Switch this on only if you want to show up in company-wide comparisons.
                      </span>
                    </span>
                  </label>

                  <button
                    type="submit"
                    disabled={setupPending}
                    className="inline-flex rounded-full bg-gradient-to-r from-[#B9FF31] to-[#67FF39] px-5 py-3 text-sm font-semibold text-[#0B0B0C] transition hover:translate-y-[-1px] disabled:opacity-60"
                  >
                    {setupPending ? "Saving and running first sync..." : "Turn on the magic"}
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

                  <Link
                    href="/"
                    className="mt-6 inline-flex rounded-full bg-[#17171A] px-4 py-2 text-sm font-semibold text-white"
                  >
                    Return to dashboard
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
