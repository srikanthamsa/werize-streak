import { getDashboardData } from "@/lib/dashboard-data";
import { AppShell } from "@/components/app-shell";
import { redirect } from "next/navigation";

export default async function Home() {
  const dashboardData = await getDashboardData();

  if (!dashboardData.syncUserId) {
    redirect("/setup");
  }

  return <AppShell {...dashboardData} />;
}
