import { DashboardShell } from "@/components/dashboard-shell";
import { WorkspacePage } from "@/components/workspace-page";
import { CampaignCreateForm } from "@/components/campaign-create-form";
import { getCampaignObjectives } from "@/features/campaigns/data";

export default async function NewCampaignPage(){const data=await getCampaignObjectives();return <DashboardShell activePath="/campaigns" organizationName={data.orgName} demo={data.mode==="demo"}><WorkspacePage eyebrow="NUEVA CAMPAÑA" title="Partí de un objetivo" description="Spectro desarrollará audiencia, research, mensaje, canales y dirección editorial."><CampaignCreateForm objectives={data.items} demo={data.mode==="demo"}/></WorkspacePage></DashboardShell>}
