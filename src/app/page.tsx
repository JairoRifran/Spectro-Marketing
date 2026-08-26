import { DashboardShell } from "@/components/dashboard-shell";
import { MarketingHQ } from "@/components/marketing-hq";
import { getHqData } from "@/features/dashboard/data";

export default async function Home() {
  const data = await getHqData();
  return <DashboardShell activePath="/" organizationName={data.organizationName} demo={data.mode==="demo"}><MarketingHQ data={data} /></DashboardShell>;
}
