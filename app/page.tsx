import { getDashboardData } from "@/lib/dashboard-data";
import { AppShell } from "@/components/app-shell";
import { redirect } from "next/navigation";

export default async function Home() {
  // Ensure the splash animation gets a split second to shine during fast PWA boots
  await new Promise((resolve) => setTimeout(resolve, 600));

  const dashboardData = await getDashboardData();

  if (!dashboardData.syncUserId) {
    redirect("/setup");
  }

  return <AppShell {...dashboardData} />;
}
