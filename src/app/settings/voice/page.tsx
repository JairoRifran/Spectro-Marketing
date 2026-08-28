import { DashboardShell } from "@/components/dashboard-shell";
import { WorkspacePage } from "@/components/workspace-page";
import { VoiceSettings } from "@/components/voice-settings";
import { getVoiceSettings } from "@/features/media/voice-settings";

export const dynamic = "force-dynamic";

export default async function VoiceSettingsPage() {
  const data = await getVoiceSettings();
  if (!data) {
    return (
      <DashboardShell activePath="/settings/voice" organizationName="Sin organización" demo={false}>
        <WorkspacePage eyebrow="CONFIGURACIÓN" title="Voz" description="Necesitás una organización para configurar la voz.">
          <p className="panel-empty">Completá el onboarding primero.</p>
        </WorkspacePage>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell activePath="/settings/voice" organizationName={data.orgName} demo={data.mode === "demo"}>
      <WorkspacePage
        eyebrow="CONFIGURACIÓN"
        title="Voz"
        description="Cómo suena tu marca cuando Spectro genera una voz en off. Elegir una voz no publica ni gasta nada."
      >
        <VoiceSettings data={data} />
      </WorkspacePage>
    </DashboardShell>
  );
}
