import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { FilterBar, StatusPill, WorkspacePage } from "@/components/workspace-page";
import { FORMAT_LABEL, PLATFORM_LABEL } from "@/components/content-preview";
import { CONTENT_PAGE_SIZE, getContentGallery, type ContentFilters } from "@/features/content/data";
import { PlatformMockup } from "@/components/platform-mockup";
import { accountFor } from "@/features/content/account";
import { composeFrames } from "@/server/media/compose";
import { SPECTRO_IDENTITY } from "@/server/media/identity";
import { AssembledPreview } from "@/components/assembled-preview";
import { intendedTimings } from "@/server/media/timing";
import { buildNarration } from "@/server/media/narration";
import { VoiceoverAction } from "@/components/voiceover-action";
import { estimateCost, ratesFromEnv } from "@/server/spend/pricing";
import { formatMoney } from "@/server/spend/money";
import { CONTENT_STATUSES } from "@/server/content-factory/lifecycle";
import { CONTENT_FORMATS } from "@/server/content/platforms";

export const dynamic = "force-dynamic";

const PLATFORMS = ["instagram", "facebook", "tiktok", "youtube_shorts", "linkedin"] as const;

function Quality({ passed, total }: { passed: number | null; total: number | null }) {
  if (passed === null || total === null || total === 0) return <span className="quality-cell pending">Sin evaluar</span>;
  const clean = passed === total;
  return <span className={clean ? "quality-cell clean" : "quality-cell partial"}>{passed}/{total} checks</span>;
}

type ViewMode = "table" | "feed";

/** Keeps the active filters when switching view, so the toggle never silently resets a search. */
function withView(filters: ContentFilters, view: ViewMode) {
  const query = new URLSearchParams(Object.entries(filters).filter(([key, value]) => key !== "view" && Boolean(value)) as [string, string][]);
  if (view === "feed") query.set("view", "feed");
  const suffix = query.toString();
  return suffix ? `/content?${suffix}` : "/content";
}

export default async function ContentPage({ searchParams }: { searchParams: Promise<ContentFilters & { view?: string }> }) {
  const filters = await searchParams;
  const view: ViewMode = filters.view === "feed" ? "feed" : "table";
  const data = await getContentGallery(filters);
  const account = accountFor(data.orgName);
  const pages = Math.max(1, Math.ceil(data.total / CONTENT_PAGE_SIZE));
  const pillars = Array.from(new Set(data.items.map((item) => item.pillar))).filter((pillar) => pillar !== "—");
  const agents = Array.from(new Set(data.items.map((item) => item.agentName).filter(Boolean))) as string[];

  return (
    <DashboardShell activePath="/content" organizationName={data.orgName} demo={data.mode === "demo"}>
      <WorkspacePage
        eyebrow="CONTENT FACTORY"
        title="Contenido"
        description="Cada pieza nace de una campaña aprobada y se revisa antes de aprobarse. Todavía no se publica nada."
        action={
          <div className="view-switch" role="group" aria-label="Modo de vista">
            <Link href={withView(filters, "table")} className={view === "table" ? "is-active" : ""} aria-current={view === "table" ? "true" : undefined}>Tabla</Link>
            <Link href={withView(filters, "feed")} className={view === "feed" ? "is-active" : ""} aria-current={view === "feed" ? "true" : undefined}>Cómo se va a ver</Link>
          </div>
        }
      >
        <FilterBar>
          {/* The filter form is a GET submit, so the active view has to travel with it or
              applying a filter silently throws you back to the table. */}
          {view === "feed" && <input type="hidden" name="view" value="feed" />}
          <select name="campaign" defaultValue={filters.campaign} aria-label="Filtrar por campaña">
            <option value="">Todas las campañas</option>
            {data.campaigns.map((campaign) => campaign && <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
          </select>
          <select name="platform" defaultValue={filters.platform} aria-label="Filtrar por plataforma">
            <option value="">Todas las plataformas</option>
            {PLATFORMS.map((platform) => <option key={platform} value={platform}>{PLATFORM_LABEL[platform]}</option>)}
          </select>
          <select name="format" defaultValue={filters.format} aria-label="Filtrar por formato">
            <option value="">Todos los formatos</option>
            {CONTENT_FORMATS.map((format) => <option key={format} value={format}>{FORMAT_LABEL[format] ?? format}</option>)}
          </select>
          <select name="pillar" defaultValue={filters.pillar} aria-label="Filtrar por pilar">
            <option value="">Todos los pilares</option>
            {pillars.map((pillar) => <option key={pillar} value={pillar}>{pillar}</option>)}
          </select>
          <select name="status" defaultValue={filters.status} aria-label="Filtrar por estado">
            <option value="">Todos los estados</option>
            {CONTENT_STATUSES.map((status) => <option key={status} value={status}>{status.replace(/_/g, " ")}</option>)}
          </select>
          <select name="agent" defaultValue={filters.agent} aria-label="Filtrar por agente">
            <option value="">Todos los agentes</option>
            {agents.map((agent) => <option key={agent} value={agent}>{agent}</option>)}
          </select>
          <select name="date" defaultValue={filters.date} aria-label="Filtrar por fecha">
            <option value="">Cualquier fecha</option>
            <option value="today">Últimas 24 h</option>
            <option value="week">Últimos 7 días</option>
            <option value="month">Últimos 30 días</option>
          </select>
          <button className="secondary-button">Aplicar</button>
        </FilterBar>

        {data.items.length === 0 ? (
          <div className="empty-state content-empty">
            <p>Todavía no hay contenido.</p>
            <small>El contenido nace de una campaña con estrategia aprobada.</small>
            <Link className="primary-button" href="/campaigns">Ir a campañas</Link>
          </div>
        ) : (
          <>
            {view === "feed" ? (
              <div className="content-gallery">
                {data.items.map((item) => (
                  <article key={item.id} className={`gallery-card on-${item.platform}`}>
                    <header>
                      <div>
                        <Link href={`/content/${item.id}`}>{item.title}</Link>
                        <small>v{item.currentVersion} · {item.pillar}</small>
                      </div>
                      <StatusPill value={item.status} />
                    </header>
                    {item.variant ? (() => {
                      const variant = item.variant;
                      const frames = composeFrames(variant);
                      const narration = buildNarration(variant);
                      const playable = frames.length > 1;
                      return (
                        <>
                          {/* Anything with a sequence opens ready to play. Hiding it behind a
                              disclosure meant the pieces that move looked exactly like the ones
                              that do not. */}
                          {playable && (
                            <div className="gallery-assembled">
                              <AssembledPreview
                                frames={frames}
                                timings={intendedTimings(variant, frames)}
                                identity={SPECTRO_IDENTITY}
                                audioUrl={item.audioUrl}
                                label={item.title}
                              />
                              {narration && (
                                <VoiceoverAction
                                  contentItemId={item.id}
                                  demo={data.mode === "demo"}
                                  compact
                                  preflight={{
                                    hasNarration: true,
                                    characters: [...narration.text].length,
                                    estimate: formatMoney(estimateCost({ operation: "media.tts", text: narration.text }, ratesFromEnv(process.env))),
                                    existing: item.audioUrl ? { durationSeconds: null, generatedBy: "provider", url: item.audioUrl } : null,
                                  }}
                                />
                              )}
                            </div>
                          )}
                          <PlatformMockup variant={variant} account={account} frames={frames} identity={SPECTRO_IDENTITY} title={item.title} audio={item.audioUrl ? { url: item.audioUrl, mimeType: "audio/mpeg" } : null} />
                        </>
                      );
                    })() : <p className="panel-empty">Planificada, todavía sin escribir.</p>}
                  </article>
                ))}
              </div>
            ) : (
            <div className="table-shell">
              <table>
                <thead>
                  <tr><th>Pieza</th><th>Campaña</th><th>Plataforma</th><th>Formato</th><th>Pilar</th><th>Estado</th><th>Calidad</th><th>Agente</th><th>Actualizado</th></tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <Link href={`/content/${item.id}`}>
                          <strong>{item.title}</strong>
                          <small>v{item.currentVersion} · {item.angle}</small>
                        </Link>
                      </td>
                      <td><Link href={`/campaigns/${item.campaignId}`}>{item.campaignName}</Link></td>
                      <td>{PLATFORM_LABEL[item.platform] ?? item.platform}</td>
                      <td>{FORMAT_LABEL[item.format] ?? item.format}</td>
                      <td>{item.pillar}</td>
                      <td><StatusPill value={item.status} /></td>
                      <td><Quality passed={item.checksPassed} total={item.checksTotal} /></td>
                      <td>{item.agentName ?? "—"}</td>
                      <td>{new Date(item.updatedAt).toLocaleDateString("es-UY")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}
            {pages > 1 && (
              <nav className="content-pagination" aria-label="Paginación">
                {Array.from({ length: pages }, (_, index) => index + 1).map((number) => {
                  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => Boolean(value)) as [string, string][]);
                  query.set("page", String(number));
                  if (view === "feed") query.set("view", "feed");
                  return <Link key={number} href={`/content?${query}`} className={number === data.page ? "active" : ""} aria-current={number === data.page ? "page" : undefined}>{number}</Link>;
                })}
              </nav>
            )}
          </>
        )}
      </WorkspacePage>
    </DashboardShell>
  );
}
