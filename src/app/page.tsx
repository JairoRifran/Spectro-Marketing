import { DashboardShell } from "@/components/dashboard-shell";
import { MarketingHQ } from "@/components/marketing-hq";
import { getHqData } from "@/features/dashboard/data";
import { ContentHqStrip } from "@/components/content-hq-strip";
import { AgentPipeline } from "@/components/agent-pipeline";
import { getOrganizationPipeline } from "@/features/content/pipeline";

export default async function Home() {
  const [data, pipeline] = await Promise.all([getHqData(), getOrganizationPipeline()]);
  return <DashboardShell activePath="/" organizationName={data.organizationName} demo={data.mode==="demo"}><>{pipeline&&!data.needsOnboarding&&<AgentPipeline initial={pipeline}/>}<ContentHqStrip /><MarketingHQ data={data} /></></DashboardShell>;
}
