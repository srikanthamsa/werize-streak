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

  // Existing live users who land here (e.g. right after Google OAuth redirect) go straight to the dashboard
  if (authUser && data.syncUserId && data.isLive && !authError) {
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
      greythrUsername=""
      leaderboardOptIn={data.profile.leaderboardOptIn}
      isLive={data.isLive}
      lastSyncedAt={data.lastSyncedAt}
      authError={authError}
    />
  );
}
