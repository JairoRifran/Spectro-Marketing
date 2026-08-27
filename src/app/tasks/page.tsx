import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { FilterBar, StatusPill, WorkspacePage } from "@/components/workspace-page";
import { TaskComposer } from "@/components/quick-create";
import { filterTasks, getTasks, type TaskFilters } from "@/features/workspace/data";

export default async function TasksPage({ searchParams }: { searchParams: Promise<TaskFilters> }) {
  const data = await getTasks();
  const filters = await searchParams;
  const items = filterTasks(data.items,filters);
  const agents=Array.from(new Map(data.items.filter(t=>t.assigned_agent_id&&t.agent_name).map(t=>[t.assigned_agent_id!,t.agent_name!])).entries());
  const objectives=Array.from(new Map(data.items.filter(t=>t.objective_id&&t.objective_title).map(t=>[t.objective_id!,t.objective_title!])).entries());
  return <DashboardShell activePath="/tasks" organizationName={data.orgName} demo={data.mode === "demo"}>
    <WorkspacePage eyebrow="MOTOR DE TRABAJO" title="Trabajo" description="Cada tarea tiene origen, responsable, estado y resultado." action={<TaskComposer demo={data.mode === "demo"} />}>
      <FilterBar><input name="q" defaultValue={filters.q} aria-label="Buscar tareas" placeholder="Buscar tarea…"/><select name="status" defaultValue={filters.status} aria-label="Filtrar por estado"><option value="">Todos los estados</option><option>queued</option><option>running</option><option value="waiting_approval">waiting approval</option><option>completed</option><option>failed</option></select><select name="agent" defaultValue={filters.agent} aria-label="Filtrar por agente"><option value="">Todos los agentes</option>{agents.map(([id,name])=><option value={id} key={id}>{name}</option>)}</select><select name="priority" defaultValue={filters.priority} aria-label="Filtrar por prioridad"><option value="">Todas las prioridades</option><option>urgent</option><option>high</option><option>medium</option><option>low</option></select><select name="objective" defaultValue={filters.objective} aria-label="Filtrar por objetivo"><option value="">Todos los objetivos</option>{objectives.map(([id,title])=><option value={id} key={id}>{title}</option>)}</select><select name="source" defaultValue={filters.source} aria-label="Filtrar por origen"><option value="">Todos los orígenes</option><option value="user">Usuario</option><option value="agent">Agente</option><option value="system">Sistema</option><option value="event">Evento</option></select><select name="date" defaultValue={filters.date} aria-label="Filtrar por fecha"><option value="">Cualquier fecha</option><option value="today">Últimas 24 h</option><option value="week">Últimos 7 días</option><option value="month">Últimos 30 días</option></select><button className="secondary-button">Aplicar</button></FilterBar>
      <div className="table-shell"><table><thead><tr><th>Tarea</th><th>Agente</th><th>Objetivo</th><th>Prioridad</th><th>Estado</th><th>Creada</th></tr></thead><tbody>{items.map(task => <tr key={task.id}><td><Link href={`/tasks/${task.id}`}><strong>{task.title}</strong><small>{task.type}</small></Link></td><td>{task.agent_name ?? "Sin asignar"}</td><td>{task.objective_title ?? "—"}</td><td>{task.priority}</td><td><StatusPill value={task.status}/></td><td>{new Date(task.created_at).toLocaleDateString("es-UY")}</td></tr>)}</tbody></table></div>
    </WorkspacePage>
  </DashboardShell>;
}
