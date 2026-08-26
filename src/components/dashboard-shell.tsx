import Link from "next/link";
import { Activity, Bot, BrainCircuit, Building2, CheckSquare2, ChevronDown, Command, Gauge, Settings2 } from "lucide-react";
import type { ReactNode } from "react";

const primaryNav = [
  { href: "/", label: "Marketing HQ", icon: Gauge },
  { href: "/agents", label: "Agentes", icon: Bot },
  { href: "/tasks", label: "Trabajo", icon: CheckSquare2 },
  { href: "/approvals", label: "Aprobaciones", icon: Command, badge: "1" },
  { href: "/knowledge", label: "Conocimiento", icon: BrainCircuit },
];

const settingsNav = [
  { href: "/settings/company", label: "Empresa", icon: Building2 },
  { href: "/settings/automation", label: "Automatización", icon: Settings2 },
];

export function DashboardShell({ children, activePath, organizationName="Northstar Urban", demo=true }: { children: ReactNode; activePath: string; organizationName?: string; demo?: boolean }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="brand-mark" aria-label="Spectro Marketing HQ">
          <span className="brand-icon"><Activity size={18} /></span>
          <span><strong>SPECTRO</strong><small>MARKETING OS</small></span>
        </Link>
        <button className="org-switcher" type="button" aria-label="Cambiar organización">
          <span className="org-avatar">NU</span>
          <span><strong>{organizationName}</strong><small>{demo ? "Datos de demostración" : "Workspace principal"}</small></span>
          <ChevronDown size={16} />
        </button>
        <nav aria-label="Navegación principal">
          <p className="nav-label">OPERACIONES</p>
          {primaryNav.map((item) => (
            <Link key={item.href} href={item.href} className={activePath === item.href ? "nav-item active" : "nav-item"}>
              <item.icon size={18} /><span>{item.label}</span>{item.badge && <em>{item.badge}</em>}
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
          <div><span className="pulse-dot" /><strong>Sistema operativo</strong></div>
          <p>Worker activo · hace 42 s</p>
        </div>
      </aside>
      <main className="main-stage">{children}</main>
    </div>
  );
}
