import { OnboardingForm } from "@/components/onboarding-form";
import { getDashboardData } from "@/lib/dashboard-data";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { redirect } from "next/navigation";

export default async function SetupPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const authUser = await getAuthenticatedUser();
  const data = await getDashboardData();
  const params = (await searchParams) ?? {};
  const authError = typeof params.error === "string" ? params.error : undefined;

  const mode = typeof params.mode === "string" ? params.mode : undefined;

  // Existing live users who land here naturally go straight to the dashboard, unless they explicitly click 'Update Preferences'
  if (authUser && data.syncUserId && data.isLive && !authError && mode !== "edit") {
    redirect("/");
  }

  return (
    <OnboardingForm
      isAuthenticated={Boolean(authUser)}
      userEmail={authUser?.email ?? ""}
      profileName={data.profile.fullName}
      team={data.profile.team}
      role={data.profile.role}
      greythrUserId=""
      greythrUsername={data.profile.greythrUsername ?? ""}
      leaderboardOptIn={data.profile.leaderboardOptIn}
      isLive={data.isLive}
      lastSyncedAt={data.lastSyncedAt}
      authError={authError}
    />
  );
}
