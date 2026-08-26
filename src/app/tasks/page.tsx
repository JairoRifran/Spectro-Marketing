import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { FilterBar, StatusPill, WorkspacePage } from "@/components/workspace-page";
import { TaskComposer } from "@/components/quick-create";
import { getTasks } from "@/features/workspace/data";

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; priority?: string }> }) {
  const data = await getTasks();
  const filters = await searchParams;
  const items = data.items.filter(task => (!filters.q || task.title.toLowerCase().includes(filters.q.toLowerCase())) && (!filters.status || task.status === filters.status) && (!filters.priority || task.priority === filters.priority));
  return <DashboardShell activePath="/tasks" organizationName={data.orgName} demo={data.mode === "demo"}>
    <WorkspacePage eyebrow="MOTOR DE TRABAJO" title="Trabajo" description="Cada tarea tiene origen, responsable, estado y resultado." action={<TaskComposer demo={data.mode === "demo"} />}>
      <FilterBar><input name="q" defaultValue={filters.q} aria-label="Buscar tareas" placeholder="Buscar tarea…"/><select name="status" defaultValue={filters.status} aria-label="Filtrar por estado"><option value="">Todos los estados</option><option>queued</option><option>running</option><option value="waiting_approval">waiting approval</option><option>completed</option><option>failed</option></select><select name="priority" defaultValue={filters.priority} aria-label="Filtrar por prioridad"><option value="">Todas las prioridades</option><option>urgent</option><option>high</option><option>medium</option><option>low</option></select><button className="secondary-button">Aplicar</button></FilterBar>
      <div className="table-shell"><table><thead><tr><th>Tarea</th><th>Agente</th><th>Objetivo</th><th>Prioridad</th><th>Estado</th><th>Creada</th></tr></thead><tbody>{items.map(task => <tr key={task.id}><td><Link href={`/tasks/${task.id}`}><strong>{task.title}</strong><small>{task.type}</small></Link></td><td>{task.agent_name ?? "Sin asignar"}</td><td>{task.objective_title ?? "—"}</td><td>{task.priority}</td><td><StatusPill value={task.status}/></td><td>{new Date(task.created_at).toLocaleDateString("es-UY")}</td></tr>)}</tbody></table></div>
    </WorkspacePage>
  </DashboardShell>;
}
