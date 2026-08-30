import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { WorkspacePage,StatusPill } from "@/components/workspace-page";
import { getSettingsData } from "@/features/settings/data";
import { PublishingMode } from "@/components/publishing-mode";
import { INTEGRATIONS } from "@/server/integrations/catalog";

const tabs=[['/settings/company','Empresa'],['/settings/brand','Marca'],['/settings/team','Equipo'],['/settings/integrations','Integración'],['/settings/automation','Automatización']] as const;
export async function SettingsView({section}:{section:"company"|"brand"|"team"|"automation"|"integrations"}){const data=await getSettingsData();const connected=data.integrations.filter(item=>item.status==="connected");return <DashboardShell activePath={`/settings/${section}`} organizationName={data.orgName} demo={data.mode==="demo"}><WorkspacePage eyebrow="CONFIGURACIÓN" title="Workspace" description={`Datos del workspace seleccionado · permiso ${data.role}.`}><nav className="settings-tabs">{tabs.map(([href,label])=><Link className={href.endsWith(section)?"active":""} href={href} key={href}>{label}</Link>)}</nav>{section==="company"&&<div className="settings-panels"><Panel title="Información de empresa"><Fields items={[["Nombre",data.orgName],["Industria",data.company.industry],["País",data.company.country],["Idioma",data.company.language],["Timezone",data.company.timezone]]}/></Panel><Panel title="Perfil operativo"><p>{data.company.description||"Aún no existe una descripción operativa."}</p></Panel></div>}{section==="brand"&&<div className="settings-panels"><Panel title="Brand Kit">{data.brand?<Fields items={[["Marca",data.brand.name],["Tono",data.brand.tone],["Palabras preferidas",data.brand.preferred.join(", ")||"—"],["Claims prohibidos",data.brand.forbiddenClaims.join(", ")||"—"]]}/>:<p>No hay Brand Kit configurado.</p>}</Panel><Panel title="Paleta"><div className="swatches">{data.brand?.colors.length?data.brand.colors.map(color=><i style={{background:color}} key={color}/>):<p>Sin colores configurados.</p>}</div></Panel></div>}{section==="team"&&<div className="settings-panels"><Panel title="Miembros"><div className="simple-list">{data.members.map(member=><div key={member.id}><div><strong>{member.name}</strong><small>Miembro del workspace</small></div><StatusPill value={member.role}/></div>)}</div></Panel><Panel title="Roles"><p>Owner controla la organización; admin gestiona configuración; member opera trabajo y conocimiento; viewer es solo lectura.</p></Panel></div>}{section==="integrations"&&<div className="settings-panels">
    <Panel title="Quién aprueba lo que se publica">
      <PublishingMode mode={data.publishingMode} canDecide={data.role==="owner"||data.role==="admin"} demo={data.mode==="demo"} connected={connected.length}/>
    </Panel>
    <Panel title="Canales">
      {/* Every channel, connected or not, with what it still needs. A screen that lists only what
          is connected makes the work look finished when none of it has started. */}
      <div className="integration-list">
        {INTEGRATIONS.map(spec=>{
          const row=data.integrations.find(item=>item.platform===spec.platform);
          const status=row?.status??"not_connected";
          return <article key={spec.platform} className={`integration-card is-${status}`}>
            <header>
              <div><strong>{spec.label}</strong><small>{spec.accountType}</small></div>
              <StatusPill value={status==="not_connected"?"sin conectar":status}/>
            </header>
            {row?.handle&&<p className="integration-account">Conectado como <b>{row.handle}</b>{row.accountName?` · ${row.accountName}`:""}</p>}
            {row?.lastError&&<p className="integration-error">{row.lastError}</p>}
            <ol className="integration-steps">
              {spec.requirements.map(requirement=><li key={requirement.label}><b>{requirement.label}</b><span>{requirement.detail}</span></li>)}
            </ol>
            <p className="integration-blocker">{spec.blocker}</p>
          </article>;
        })}
      </div>
    </Panel>
    <Panel title="Por qué todavía no hay un botón de conectar">
      <p>
        Cada red exige una app de desarrollador creada bajo una cuenta tuya, con su cliente OAuth y,
        en la mayoría de los casos, una revisión de la propia plataforma antes de conceder permiso
        para publicar. Nada de eso lo puede hacer este sistema por su cuenta: empieza con una persona
        dando de alta la app. Hasta que esas credenciales existan y queden guardadas como variables
        de entorno del servidor, esta pantalla describe el estado real — que es sin conectar.
      </p>
    </Panel>
  </div>}
  {section==="automation"&&<div className="settings-panels"><Panel title="Política de autonomía"><Fields items={[["Kill switch",data.worker.enabled?"Habilitado":"Detenido"],["Riesgo medio","Requiere aprobación según autonomía"],["Riesgo alto","Siempre requiere aprobación"]]}/></Panel><Panel title="Worker"><div className="health-row"><span className={data.worker.enabled?"pulse-dot":"offline-dot"}/><div><strong>{data.worker.enabled?"Dispatcher habilitado":"Automatización detenida"}</strong><small>Cola {data.worker.queued} · running {data.worker.running} · leases vencidos {data.worker.stale}</small><small>Último dispatch: {formatTime(data.worker.lastDispatch)} · éxito: {formatTime(data.worker.lastSuccess)} · fallo: {formatTime(data.worker.lastFailure)}</small></div></div></Panel><Panel title="Schedules"><div className="simple-list">{data.schedules.length?data.schedules.map(schedule=><div key={schedule.id}><div><strong>{schedule.name}</strong><small>{schedule.cron} · {schedule.timezone} · próximo {formatTime(schedule.nextRun)}</small></div><StatusPill value={schedule.status}/></div>):<p>No hay schedules configurados.</p>}</div></Panel></div>}</WorkspacePage></DashboardShell>}
function Panel({title,children}:{title:string;children:React.ReactNode}){return <section className="detail-panel"><h3>{title}</h3>{children}</section>}
function Fields({items}:{items:string[][]}){return <dl className="facts">{items.map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>}
function formatTime(value:string|null){return value?new Date(value).toLocaleString("es-UY"):"sin datos";}
