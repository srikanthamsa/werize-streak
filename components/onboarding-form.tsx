"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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

const initialSetupState: SetupState = {
  ok: false,
  message: "",
};

export function OnboardingForm({
  profileName,
  team,
  role,
  greythrUsername,
  isLive,
  lastSyncedAt,
}: {
  profileName: string;
  team: string;
  role: string;
  greythrUsername: string;
  isLive: boolean;
  lastSyncedAt: string | null;
}) {
  const [setupState, setupAction, setupPending] = useActionState(saveCredentialsAction, initialSetupState);
  const router = useRouter();
  const lastSyncedLabel = formatLastSynced(lastSyncedAt);

  useEffect(() => {
    if (setupState.ok) {
      router.push("/");
    }
  }, [router, setupState.ok]);

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
            <h1 className="text-white text-[38px] font-semibold leading-[1.02] tracking-[-0.035em] sm:text-[52px]">
              {isLive ? "Update your settings." : "Turn on the magic once."}
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-[#A1A1AA]">
              {isLive
                ? "Update your greytHR password, display name, or team below."
                : "Connect your greytHR account once and let Streak quietly handle the rest."}
            </p>
          </div>

          <div className="mt-8">
            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <form className="space-y-4" action={setupAction}>
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
                          <svg xmlns="http://www.w3.org/2000/svg" className="size-3 text-[#39FF14]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                          <span className="text-[10px] font-bold text-[#39FF14] uppercase tracking-wider">Secure</span>
                        </div>
                      ) : null}
                    </div>
                  </label>
                </div>

                <div className="rounded-[24px] bg-[#17171A] p-4">
                  <p className="text-sm font-semibold text-[#7DFF31]">Typed once. Encrypted immediately.</p>
                  <p className="mt-2 text-sm leading-6 text-[#A1A1AA]">
                    Secured server-side, first sync runs automatically, then Streak handles everything quietly.
                  </p>
                </div>

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
          </div>
        </div>
      </div>
    </main>
  );
}
