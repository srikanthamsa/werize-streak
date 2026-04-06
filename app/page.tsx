import { getDashboardData } from "@/lib/dashboard-data";
import { AppShell } from "@/components/app-shell";

export default async function Home() {
  const dashboardData = await getDashboardData();
  return <AppShell {...dashboardData} />;
}
