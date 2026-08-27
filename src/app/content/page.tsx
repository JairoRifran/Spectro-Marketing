import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { FilterBar, StatusPill, WorkspacePage } from "@/components/workspace-page";
import { FORMAT_LABEL, PLATFORM_LABEL } from "@/components/content-preview";
import { CONTENT_PAGE_SIZE, getContentList, type ContentFilters } from "@/features/content/data";
import { CONTENT_STATUSES } from "@/server/content-factory/lifecycle";
import { CONTENT_FORMATS } from "@/server/content/platforms";

export const dynamic = "force-dynamic";

const PLATFORMS = ["instagram", "facebook", "tiktok", "youtube_shorts", "linkedin"] as const;

function Quality({ passed, total }: { passed: number | null; total: number | null }) {
  if (passed === null || total === null || total === 0) return <span className="quality-cell pending">Sin evaluar</span>;
  const clean = passed === total;
  return <span className={clean ? "quality-cell clean" : "quality-cell partial"}>{passed}/{total} checks</span>;
}

export default async function ContentPage({ searchParams }: { searchParams: Promise<ContentFilters> }) {
  const filters = await searchParams;
  const data = await getContentList(filters);
  const pages = Math.max(1, Math.ceil(data.total / CONTENT_PAGE_SIZE));
  const pillars = Array.from(new Set(data.items.map((item) => item.pillar))).filter((pillar) => pillar !== "—");
  const agents = Array.from(new Set(data.items.map((item) => item.agentName).filter(Boolean))) as string[];

  return (
    <DashboardShell activePath="/content" organizationName={data.orgName} demo={data.mode === "demo"}>
      <WorkspacePage
        eyebrow="CONTENT FACTORY"
        title="Contenido"
        description="Cada pieza nace de una campaña aprobada y se revisa antes de aprobarse. Todavía no se publica nada."
      >
        <FilterBar>
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
            {pages > 1 && (
              <nav className="content-pagination" aria-label="Paginación">
                {Array.from({ length: pages }, (_, index) => index + 1).map((number) => {
                  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => Boolean(value)) as [string, string][]);
                  query.set("page", String(number));
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
