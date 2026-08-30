import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { WorkspacePage,StatusPill } from "@/components/workspace-page";
import { getSettingsData } from "@/features/settings/data";
import { PublishingMode } from "@/components/publishing-mode";
import { INTEGRATIONS } from "@/server/integrations/catalog";
import { callbackUrl, commonPortalFields } from "@/server/integrations/urls";
import { isConfigured as linkedinConfigured } from "@/server/integrations/linkedin";
import { CopyField } from "@/components/copy-field";

const tabs=[['/settings/company','Empresa'],['/settings/brand','Marca'],['/settings/team','Equipo'],['/settings/integrations','Integración'],['/settings/automation','Automatización']] as const;
export async function SettingsView({section}:{section:"company"|"brand"|"team"|"automation"|"integrations"}){const data=await getSettingsData();const connected=data.integrations.filter(item=>item.status==="connected");return <DashboardShell activePath={`/settings/${section}`} organizationName={data.orgName} demo={data.mode==="demo"}><WorkspacePage eyebrow="CONFIGURACIÓN" title="Workspace" description={`Datos del workspace seleccionado · permiso ${data.role}.`}><nav className="settings-tabs">{tabs.map(([href,label])=><Link className={href.endsWith(section)?"active":""} href={href} key={href}>{label}</Link>)}</nav>{section==="company"&&<div className="settings-panels"><Panel title="Información de empresa"><Fields items={[["Nombre",data.orgName],["Industria",data.company.industry],["País",data.company.country],["Idioma",data.company.language],["Timezone",data.company.timezone]]}/></Panel><Panel title="Perfil operativo"><p>{data.company.description||"Aún no existe una descripción operativa."}</p></Panel></div>}{section==="brand"&&<div className="settings-panels"><Panel title="Brand Kit">{data.brand?<Fields items={[["Marca",data.brand.name],["Tono",data.brand.tone],["Palabras preferidas",data.brand.preferred.join(", ")||"—"],["Claims prohibidos",data.brand.forbiddenClaims.join(", ")||"—"]]}/>:<p>No hay Brand Kit configurado.</p>}</Panel><Panel title="Paleta"><div className="swatches">{data.brand?.colors.length?data.brand.colors.map(color=><i style={{background:color}} key={color}/>):<p>Sin colores configurados.</p>}</div></Panel></div>}{section==="team"&&<div className="settings-panels"><Panel title="Miembros"><div className="simple-list">{data.members.map(member=><div key={member.id}><div><strong>{member.name}</strong><small>Miembro del workspace</small></div><StatusPill value={member.role}/></div>)}</div></Panel><Panel title="Roles"><p>Owner controla la organización; admin gestiona configuración; member opera trabajo y conocimiento; viewer es solo lectura.</p></Panel></div>}{section==="integrations"&&<div className="settings-panels">
    <Panel title="Quién aprueba, y en qué paso">
      <PublishingMode contentMode={data.contentApprovalMode} publishingMode={data.publishingMode} canDecide={data.role==="owner"||data.role==="admin"} demo={data.mode==="demo"} connected={connected.length}/>
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
            {/* The button appears only once the server has credentials for this channel. Offering
                it earlier sends someone to a consent screen that cannot complete, and teaches
                them the button is broken rather than that a step is missing. */}
            {spec.platform==="linkedin"&&(linkedinConfigured()
              ? <a className="primary-button integration-connect" href="/api/integrations/linkedin/start">
                  {status==="connected"?"Reconectar":"Conectar LinkedIn"}
                </a>
              : <p className="integration-pending">Cuando cargues <code>LINKEDIN_CLIENT_ID</code> y <code>LINKEDIN_CLIENT_SECRET</code> en el servidor, acá aparece el botón para conectar.</p>)}
            {row?.lastError&&<p className="integration-error">{row.lastError}</p>}
            <ol className="integration-steps">
              {spec.steps.map(step=><li key={step.title}>
                <b>{step.title}</b>
                <span>{step.detail}</span>
                {step.where&&<em>en {step.where}</em>}
              </li>)}
            </ol>
            {/* The value the portal matches character for character. Shown to be copied, because
                a redirect URI retyped with a trailing slash fails hours later with an error that
                names nothing. */}
            <CopyField label="URL de retorno (redirect URI)" value={callbackUrl(spec.platform)}/>
            <dl className="integration-meta">
              <div><dt>Termina en</dt><dd>{spec.credentials.join(" · ")}</dd></div>
              <div><dt>Espera</dt><dd>{spec.waiting}</dd></div>
            </dl>
            <p className="integration-blocker">{spec.blocker}</p>
          </article>;
        })}
      </div>
    </Panel>
    <Panel title="Datos de este sistema que te van a pedir">
      {/* Every one of these guides ends at a form asking for URLs that belong to us. Stopping
          just short of them is the least useful place to stop: the reader has done the work, is
          looking at the field, and has to guess. */}
      <div className="portal-fields">
        {commonPortalFields().map(field=><CopyField key={field.label} label={field.label} value={field.value}/>)}
      </div>
      <p className="integration-blocker">
        La política de privacidad y los términos son obligatorios para presentar la app en Meta y en
        LinkedIn: las dos plataformas rechazan el formulario sin URLs alcanzables. Las páginas ya
        existen y describen con precisión lo que el sistema hace con los datos, pero están pendientes
        de revisión legal — conviene que las lea alguien calificado antes de una presentación formal.
      </p>
    </Panel>
    <Panel title="Por qué todavía no hay un botón de conectar">
      <p>
        Cada red exige una app de desarrollador creada bajo una cuenta tuya, con su cliente OAuth y,
        en la mayoría de los casos, una revisión de la propia plataforma antes de conceder permiso
        para publicar. Nada de eso lo puede hacer este sistema por su cuenta: empieza con una persona
        dando de alta la app.
      </p>
      <p>
        Los canales están en el orden en que conviene hacerlos. LinkedIn primero: es el más rápido de
        habilitar y el único que ya tiene contenido generado esperando. Instagram y Facebook comparten
        una misma app y una misma revisión de Meta, así que se hacen juntos o no se hace ninguno.
      </p>
      <p>
        Las credenciales que salen de cada guía van como variables de entorno en el servidor, igual que
        la clave de Anthropic. Nunca a un archivo del repositorio, nunca a un chat, nunca a esta pantalla.
        Los nombres exactos de menús y botones dentro de cada portal cambian seguido: los pasos describen
        qué conseguir, no dónde hacer clic.
      </p>
    </Panel>
  </div>}
  {section==="automation"&&<div className="settings-panels"><Panel title="Política de autonomía"><Fields items={[["Kill switch",data.worker.enabled?"Habilitado":"Detenido"],["Riesgo medio","Requiere aprobación según autonomía"],["Riesgo alto","Siempre requiere aprobación"]]}/></Panel><Panel title="Worker"><div className="health-row"><span className={data.worker.enabled?"pulse-dot":"offline-dot"}/><div><strong>{data.worker.enabled?"Dispatcher habilitado":"Automatización detenida"}</strong><small>Cola {data.worker.queued} · running {data.worker.running} · leases vencidos {data.worker.stale}</small><small>Último dispatch: {formatTime(data.worker.lastDispatch)} · éxito: {formatTime(data.worker.lastSuccess)} · fallo: {formatTime(data.worker.lastFailure)}</small></div></div></Panel><Panel title="Schedules"><div className="simple-list">{data.schedules.length?data.schedules.map(schedule=><div key={schedule.id}><div><strong>{schedule.name}</strong><small>{schedule.cron} · {schedule.timezone} · próximo {formatTime(schedule.nextRun)}</small></div><StatusPill value={schedule.status}/></div>):<p>No hay schedules configurados.</p>}</div></Panel></div>}</WorkspacePage></DashboardShell>}
function Panel({title,children}:{title:string;children:React.ReactNode}){return <section className="detail-panel"><h3>{title}</h3>{children}</section>}
function Fields({items}:{items:string[][]}){return <dl className="facts">{items.map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>}
function formatTime(value:string|null){return value?new Date(value).toLocaleString("es-UY"):"sin datos";}
