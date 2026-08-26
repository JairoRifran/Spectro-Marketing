import { DashboardShell } from "@/components/dashboard-shell";
import { FilterBar, WorkspacePage } from "@/components/workspace-page";
import { KnowledgeComposer } from "@/components/quick-create";
import { KnowledgeEditor } from "@/components/knowledge-editor";
import { getKnowledge } from "@/features/workspace/data";

export default async function KnowledgePage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string }> }) {
  const data = await getKnowledge();
  const filters = await searchParams;
  const items = data.items.filter(item => (!filters.q || `${item.title} ${item.content}`.toLowerCase().includes(filters.q.toLowerCase())) && (!filters.type || item.type === filters.type));
  return <DashboardShell activePath="/knowledge" organizationName={data.orgName} demo={data.mode === "demo"}>
    <WorkspacePage eyebrow="MEMORIA EMPRESARIAL" title="Conocimiento" description="Contexto, políticas y aprendizajes disponibles para los agentes." action={<KnowledgeComposer demo={data.mode === "demo"} />}>
      <FilterBar><input name="q" defaultValue={filters.q} aria-label="Buscar conocimiento" placeholder="Buscar en la memoria…"/><select name="type" defaultValue={filters.type} aria-label="Filtrar por tipo"><option value="">Todos los tipos</option><option>company</option><option>product</option><option>persona</option><option>brand</option><option>learning</option></select><button className="secondary-button">Aplicar</button></FilterBar>
      <div className="knowledge-grid">{items.map(item => <article className="knowledge-card" key={item.id}><span>{item.type}</span><h2>{item.title}</h2><p>{item.content}</p><footer><small>{item.source ?? "manual"}</small><time>{new Date(item.created_at).toLocaleDateString("es-UY")}</time></footer><KnowledgeEditor {...item} demo={data.mode === "demo"}/></article>)}</div>
    </WorkspacePage>
  </DashboardShell>;
}
