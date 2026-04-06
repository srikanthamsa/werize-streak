import { OnboardingForm } from "@/components/onboarding-form";
import { getDashboardData } from "@/lib/dashboard-data";
import { redirect } from "next/navigation";

export default async function SetupPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const data = await getDashboardData();
  const params = (await searchParams) ?? {};
  const mode = typeof params.mode === "string" ? params.mode : undefined;

  if (data.syncUserId && data.isLive && mode !== "edit") {
    redirect("/");
  }

  return (
    <OnboardingForm
      profileName={data.profile.fullName}
      team={data.profile.team}
      role={data.profile.role}
      greythrUsername={data.profile.greythrUsername ?? ""}
      isLive={data.isLive}
      lastSyncedAt={data.lastSyncedAt}
    />
  );
}
