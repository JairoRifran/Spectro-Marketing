import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowDown, Check, CircleAlert } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { StatusPill, WorkspacePage } from "@/components/workspace-page";
import { ContentActions } from "@/components/content-actions";
import { ContentPreview, FORMAT_LABEL, PLATFORM_LABEL } from "@/components/content-preview";
import { PlatformMockup } from "@/components/platform-mockup";
import { accountFor } from "@/features/content/account";
import { composeFrames } from "@/server/media/compose";
import { SPECTRO_IDENTITY } from "@/server/media/identity";
import { PreviewTabs } from "@/components/preview-tabs";
import { getContentDetail } from "@/features/content/data";

export const dynamic = "force-dynamic";

function Facts({ rows }: { rows: Array<[string, string | null | undefined]> }) {
  return (
    <dl className="facts">
      {rows.map(([label, value]) => (
        <div key={label}><dt>{label}</dt><dd>{value || "—"}</dd></div>
      ))}
    </dl>
  );
}

export default async function ContentDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const data = await getContentDetail(id, Number(query.v) || undefined);
  if (!data) notFound();

  const item = data.item;
  const concept = data.concept as Record<string, string>;
  const quality = data.quality;
  const variant = data.variant;
  const review = data.review as Record<string, unknown> | null;
  const pendingDecision = item.status === "waiting_approval" && Boolean(data.approval && data.approval.status === "requested");
  // A blocked or rejected piece can still be rewritten; that is the only way out of those states.
  const revisable = ["needs_revision", "rejected"].includes(item.status);
  const canDecide = data.role !== "viewer" && (pendingDecision || revisable);

  return (
    <DashboardShell activePath="/content" organizationName={data.orgName} demo={data.mode === "demo"}>
      <WorkspacePage
        eyebrow={`${PLATFORM_LABEL[item.platform] ?? item.platform} · ${FORMAT_LABEL[item.format] ?? item.format} · v${data.selectedVersion}`}
        title={item.title}
        description={concept.core_idea}
        action={<StatusPill value={item.status} />}
      >
        <div className="content-detail">
          <section className="detail-panel wide">
            <span className="section-kicker">CONTEXTO</span>
            <h3>Por qué existe esta pieza</h3>
            <Facts rows={[
              ["Campaña", data.campaign.name],
              ["Objetivo", data.campaign.objectives?.title ?? data.campaign.business_goal],
              ["Audiencia", concept.audience_persona],
              ["Pilar", concept.pillar],
              ["Ángulo", concept.angle],
              ["Plataforma", PLATFORM_LABEL[item.platform] ?? item.platform],
              ["Formato", FORMAT_LABEL[item.format] ?? item.format],
            ]} />
            <div className="content-links">
              <Link href={`/campaigns/${data.campaign.id}`}>Ver campaña</Link>
              {data.campaign.objective_id && <Link href="/">Ver objetivo</Link>}
            </div>
          </section>

          <section className="detail-panel wide">
            <span className="section-kicker">PREVIEW</span>
            <h3>Cómo se va a consumir</h3>
            {variant ? (
              <PreviewTabs
                feed={<PlatformMockup variant={variant.payload} account={accountFor(data.orgName)} frames={composeFrames(variant.payload)} identity={SPECTRO_IDENTITY} />}
                production={<ContentPreview variant={variant.payload} />}
              />
            ) : <p className="panel-empty">Todavía no hay una versión escrita.</p>}
          </section>

          {review && (
            <section className="detail-panel wide">
              <span className="section-kicker">DIRECCIÓN CREATIVA</span>
              <h3>Lo que revisó Emilia</h3>
              <p>{String(review.visual_direction ?? "")}</p>
              {Array.isArray(review.storyboard) && review.storyboard.length > 0 && (
                <ol className="storyboard">
                  {(review.storyboard as Array<{ beat: string; visual: string; motion?: string }>).map((beat, index) => (
                    <li key={index}><strong>{beat.beat}</strong><p>{beat.visual}</p>{beat.motion && <small>{beat.motion}</small>}</li>
                  ))}
                </ol>
              )}
              <Facts rows={[
                ["Consistencia de marca", String(review.brand_consistency ?? "")],
                ["Notas de movimiento", (review.motion_notes as string[] | null)?.join(" · ")],
                ["Composición", (review.composition_notes as string[] | null)?.join(" · ")],
                ["Texto en pantalla", variant?.payload.onScreenText.join(" · ")],
                ["Notas de rodaje", variant?.payload.shotNotes.join(" · ")],
              ]} />
            </section>
          )}

          <section className="detail-panel">
            <span className="section-kicker">CALIDAD</span>
            <h3>Control determinístico</h3>
            {quality ? (
              <div className="quality-panel">
                <strong className={quality.errors.length ? "quality-blocked" : "quality-clean"}>
                  {quality.checksPassed} / {quality.checksTotal} checks
                </strong>
                {quality.errors.length === 0 && quality.warnings.length === 0 && <p className="quality-line ok"><Check size={14} /> Sin observaciones</p>}
                {quality.errors.map((finding, index) => (
                  <p className="quality-line error" key={`e${index}`}><CircleAlert size={14} /> {finding.message}</p>
                ))}
                {quality.warnings.map((finding, index) => (
                  <p className="quality-line warning" key={`w${index}`}><AlertTriangle size={14} /> {finding.message}</p>
                ))}
                {quality.recommendations.length > 0 && (
                  <ul className="quality-recommendations">
                    {quality.recommendations.map((recommendation, index) => <li key={index}>{recommendation}</li>)}
                  </ul>
                )}
              </div>
            ) : <p className="panel-empty">Todavía no se evaluó esta pieza.</p>}
          </section>

          <section className="detail-panel">
            <span className="section-kicker">LINEAGE</span>
            <h3>Cómo llegó hasta acá</h3>
            <div className="lineage">
              <div><small>BRUNO</small><strong>Concepto</strong><span>{concept.concept_key}</span></div>
              <ArrowDown size={14} />
              <div><small>CLARA</small><strong>Versión {data.selectedVersion}</strong><span>{variant?.provider ?? "—"}</span></div>
              <ArrowDown size={14} />
              <div><small>EMILIA</small><strong>Revisión creativa</strong><span>{review ? "Completada" : "Pendiente"}</span></div>
              <ArrowDown size={14} />
              <div><small>HUMANO</small><strong>{data.approval?.status ?? "Sin aprobación"}</strong><span>{item.status}</span></div>
            </div>
            <ul className="lineage-tasks">
              {data.tasks.map((task) => (
                <li key={task.id}>
                  <Link href={`/tasks/${task.id}`}>{task.title}</Link>
                  <StatusPill value={task.status} />
                </li>
              ))}
            </ul>
          </section>

          <section className="detail-panel">
            <span className="section-kicker">VERSIONES</span>
            <h3>Historial</h3>
            <nav className="version-tabs" aria-label="Versiones">
              {data.availableVersions.map((version) => (
                <Link key={version} href={`/content/${id}?v=${version}`} className={version === data.selectedVersion ? "active" : ""} aria-current={version === data.selectedVersion ? "true" : undefined}>
                  v{version}
                </Link>
              ))}
            </nav>
            {data.versions.length === 0 ? <p className="panel-empty">Todavía no hay versiones registradas.</p> : (
              <ul className="version-history">
                {data.versions.map((version) => (
                  <li key={version.version} className={version.version === data.selectedVersion ? "active" : ""}>
                    <header><strong>v{version.version}</strong><time>{new Date(version.createdAt).toLocaleString("es-UY")}</time></header>
                    <p>{version.reason}</p>
                    {version.feedback && <blockquote>{version.feedback}</blockquote>}
                    <small>{version.agentName ?? "Agente"}{version.requestedBy ? " · pedida por una persona" : ""}</small>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="detail-panel wide">
            <span className="section-kicker">CONTROL HUMANO</span>
            <h3>{pendingDecision ? "Esperando tu decisión" : revisable ? "Necesita una nueva versión" : "Decisión registrada"}</h3>
            {item.status === "waiting_approval"
              ? <p>Aprobar no publica, no agenda ni gasta presupuesto. Sólo marca la pieza como aprobada editorialmente.</p>
              : <p>Estado actual: {item.status.replace(/_/g, " ")}. {data.approval?.decision_note ? "Feedback registrado abajo." : ""}</p>}
            {data.approval?.decision_note && <blockquote>{data.approval.decision_note}</blockquote>}
            {(pendingDecision || revisable) && <ContentActions id={id} demo={data.mode === "demo"} canDecide={canDecide} revisionOnly={!pendingDecision} />}
          </section>

          <section className="detail-panel wide">
            <span className="section-kicker">ACTIVIDAD</span>
            <h3>Registro auditado</h3>
            {data.activity.length === 0 ? <p className="panel-empty">Sin actividad registrada.</p> : (
              <div className="campaign-activity">
                {data.activity.map((entry) => (
                  <article key={entry.id}>
                    <span />
                    <div>
                      <header>
                        <strong>{(entry.agents as unknown as { display_name: string } | null)?.display_name ?? "Sistema"}</strong>
                        <time>{new Date(entry.created_at).toLocaleString("es-UY")}</time>
                      </header>
                      <p>{entry.summary}</p>
                      <small>{entry.action}</small>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </WorkspacePage>
    </DashboardShell>
  );
}
