import { OnboardingForm } from "@/components/onboarding-form";
import { getDashboardData } from "@/lib/dashboard-data";
import { getAuthenticatedUser } from "@/lib/supabase/auth";

export default async function SetupPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const authUser = await getAuthenticatedUser();
  const data = await getDashboardData();
  const params = (await searchParams) ?? {};
  const authError = typeof params.error === "string" ? params.error : undefined;

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
