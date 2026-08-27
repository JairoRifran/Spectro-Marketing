import Link from "next/link";
import { Activity, Bot, BrainCircuit, Building2, CheckSquare2, Command, Gauge, LogOut, Megaphone, Settings2, FileText } from "lucide-react";
import type { ReactNode } from "react";
import { getPendingApprovalCount } from "@/features/approvals/count";
import { getOrganizationContext } from "@/features/organizations/context";
import { automationIsEnabled } from "@/lib/env";

const primaryNav = [
  { href: "/", label: "Marketing HQ", icon: Gauge },
  { href: "/agents", label: "Agentes", icon: Bot },
  { href: "/tasks", label: "Trabajo", icon: CheckSquare2 },
  { href: "/campaigns", label: "Campañas", icon: Megaphone },
  { href: "/content", label: "Contenido", icon: FileText },
  { href: "/approvals", label: "Aprobaciones", icon: Command },
  { href: "/knowledge", label: "Conocimiento", icon: BrainCircuit },
];

const settingsNav = [
  { href: "/settings/company", label: "Empresa", icon: Building2 },
  { href: "/settings/automation", label: "Automatización", icon: Settings2 },
];

export async function DashboardShell({ children, activePath, organizationName="Sin organización", demo=false }: { children: ReactNode; activePath: string; organizationName?: string; demo?: boolean }) {
  const context = demo ? null : await getOrganizationContext();
  const pendingApprovals = await getPendingApprovalCount();
  const automationEnabled = automationIsEnabled();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="brand-mark" aria-label="Spectro Marketing HQ">
          <span className="brand-icon"><Activity size={18} /></span>
          <span><strong>SPECTRO</strong><small>MARKETING OS</small></span>
        </Link>
        {context && context.organizations.length > 1 ? <form className="org-switcher org-switcher-form" action="/api/organizations/select" method="post">
          <span className="org-avatar">{organizationName.slice(0,2).toUpperCase()}</span>
          <input type="hidden" name="next" value={activePath}/>
          <select name="organization_id" defaultValue={context.orgId} aria-label="Cambiar organización">
            {context.organizations.map(organization=><option value={organization.id} key={organization.id}>{organization.name}</option>)}
          </select>
          <button type="submit">Cambiar</button>
        </form> : <div className="org-switcher">
          <span className="org-avatar">{organizationName.slice(0,2).toUpperCase()}</span>
          <span><strong>{organizationName}</strong><small>{demo ? "Datos de demostración" : context?.role ?? "Workspace"}</small></span>
        </div>}
        <nav aria-label="Navegación principal">
          <p className="nav-label">OPERACIONES</p>
          {primaryNav.map((item) => (
            <Link key={item.href} href={item.href} className={activePath === item.href ? "nav-item active" : "nav-item"}>
              <item.icon size={18} /><span>{item.label}</span>{item.href === "/approvals" && pendingApprovals > 0 && <em>{pendingApprovals}</em>}
            </Link>
          ))}
          <p className="nav-label nav-label-spaced">CONFIGURACIÓN</p>
          {settingsNav.map((item) => (
            <Link key={item.href} href={item.href} className={activePath === item.href ? "nav-item active" : "nav-item"}>
              <item.icon size={18} /><span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-status">
          <div><span className={automationEnabled?"pulse-dot":"offline-dot"} /><strong>{automationEnabled?"Automatización activa":"Automatización detenida"}</strong></div>
          <p>{demo?"Entorno demo explícito":automationEnabled?"Kill switch habilitado":"AUTOMATION_ENABLED=false"}</p>
          {!demo&&<form action="/api/auth/logout" method="post"><button className="logout-button" type="submit"><LogOut size={13}/>Cerrar sesión</button></form>}
        </div>
      </aside>
      <main className="main-stage">{children}</main>
    </div>
  );
}
