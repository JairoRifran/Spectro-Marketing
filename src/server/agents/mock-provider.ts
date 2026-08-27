import type { AgentContext, AgentProvider, AgentResult } from "./contracts";
import { CAMPAIGN_PROMPTS } from "@/server/campaigns/prompts";
import { mockContentResult } from "@/server/content-factory/mock-content";

type CampaignInput={campaignId?:string;strategyVersion?:number;campaignName?:string;objectiveTitle?:string;objectiveDescription?:string;metric?:string;target?:number;audienceHint?:string;brandName?:string;brandTone?:string;forbiddenClaims?:string[];forbiddenWords?:string[];productNames?:string[];personaNames?:string[];knowledgeTitles?:string[];constraints?:string[]};
const shared=(context:AgentContext)=>context.task.input as CampaignInput;
const next=(context:AgentContext,type:string,role:string,title:string,description:string,reason:string)=>[{role,title,description,type,reason,input:{...context.task.input,sourceTaskId:context.task.id}}];

function campaignResult(context:AgentContext):AgentResult|null{
  const input=shared(context);const objective=input.objectiveTitle??"crecer de forma sostenible";const audience=input.audienceHint||input.personaNames?.[0]||"equipos de pequeñas y medianas empresas";
  const product=input.productNames?.[0]??input.brandName??"la solución";const campaign=input.campaignName??`Campaña para ${objective}`;
  if(context.task.type==="campaign.strategy.draft")return{
    summary:`Sofía estructuró el borrador estratégico de ${campaign}.`,
    output:{summary:`Campaña coordinada para ${objective}, enfocada en ayudar a ${audience} a avanzar con una propuesta clara y verificable.`,targetAudience:audience,
      problem:"El equipo invierte demasiado tiempo en coordinación manual y pierde continuidad en marketing.",promise:`Organizar el marketing alrededor de ${product} con prioridades claras y trabajo coordinado.`,
      positioning:`${product} como sistema operativo de marketing para equipos que necesitan más consistencia sin ampliar complejidad.`,
      coreMessage:"Tu marketing puede trabajar como un sistema coordinado, con contexto, control humano y prioridades claras.",creativeThesis:"Mostrar el contraste entre marketing fragmentado y una operación coordinada que conserva el criterio humano.",
      primaryCta:"Descubrir cómo funciona",confidence:.78,audience:{name:audience,description:`Personas responsables de crecimiento que buscan alcanzar ${objective} con menos trabajo fragmentado.`,
        pains:["Trabajo manual repetitivo","Falta de continuidad entre estrategia y ejecución"],needs:["Prioridades claras","Control sobre decisiones relevantes"],motivations:["Crecer sin sumar complejidad","Demostrar impacto"],
        objections:["Puede ser difícil de implementar","No queremos perder control"],awarenessLevel:"solution_aware"},
      messaging:{supportingMessages:["Cada pieza futura nace de un objetivo y una campaña.","Los agentes colaboran con trazabilidad y aprobación humana."],
        valuePropositions:["Coordinación estratégica","Contexto persistente","Control humano"],proofPoints:["Tasks, runs y actividad persistentes","Guardrails de marca determinísticos"],
        objections:["La IA inventará mensajes","La automatización actuará sola"],objectionResponses:[{objection:"La IA inventará mensajes",response:"La salida se valida contra esquemas y reglas de marca."},{objection:"La automatización actuará sola",response:"La ejecución de M02.1 es manual y no publica."}]},
      signalsUsed:[`Objetivo: ${objective}`,`Audiencia disponible: ${audience}`,`Producto: ${product}`],reason:"La propuesta conecta el objetivo existente con una campaña enfocada, sin anticipar producción ni canales externos.",
      promptVersion:CAMPAIGN_PROMPTS.strategyDraft.version,provider:"mock",model:null},
    delegatedTasks:next(context,"campaign.research","market_intelligence","Investigar oportunidad de campaña","Sintetizar conocimiento interno, supuestos y vacíos de investigación externa.","Sofía requiere evidencia estructurada antes de definir canales."),
  };
  if(context.task.type==="campaign.research")return{
    summary:"Mateo completó un research basado exclusivamente en conocimiento interno.",
    output:{researchMode:"knowledge_based",marketContext:["Los equipos pequeños necesitan continuidad sin agregar procesos pesados."],audiencePains:["Marketing reactivo","Prioridades cambiantes","Poca trazabilidad"],
      audienceLanguage:["Necesito que esto sea más simple","Quiero saber qué está funcionando"],frequentQuestions:["¿Cuánto control conservo?","¿Cómo se conecta con mis objetivos?"],
      objections:["Curva de adopción","Riesgo de mensajes genéricos"],competitorMessages:[],contentPatterns:["Educación práctica","Antes y después operativo","Demostraciones de flujo"],
      opportunities:["Explicar coordinación antes que automatización","Mostrar trazabilidad de decisiones"],risks:["Confundir estrategia con publicación autónoma","Usar claims sin evidencia"],
      recommendedAngles:["Crecimiento sin contratar","Continuidad 24/7 con control humano","Reemplazar trabajo repetitivo, no criterio"],
      sources:[...(input.brandName?[{type:"brand" as const,label:input.brandName}]:[]),...(input.productNames??[]).map(label=>({type:"product" as const,label})),...(input.personaNames??[]).map(label=>({type:"persona" as const,label})),...(input.knowledgeTitles??[]).map(label=>({type:"knowledge" as const,label}))],
      assumptions:["La audiencia prioriza eficiencia operativa","La propuesta de coordinación es más relevante que volumen de contenido"],
      requiresExternalResearch:["Mensajes actuales de competidores","Benchmarks verificables por canal","Lenguaje observado en conversaciones públicas"],confidence:.66,
      promptVersion:CAMPAIGN_PROMPTS.research.version,provider:"mock",model:null},
    delegatedTasks:next(context,"campaign.channel_strategy","social_media_director","Diseñar estrategia de canales","Evaluar relevancia, formatos y rol de cada canal sin conectar APIs.","El research ya separó evidencia interna de supuestos."),
  };
  if(context.task.type==="campaign.channel_strategy")return{
    summary:"Valentina priorizó canales y explicó el rol de cada uno.",
    output:{channels:[
      {channel:"instagram",enabled:true,roleInCampaign:"Awareness y educación",objective:"Hacer visible el problema y la transformación",audienceFit:"Alto para formatos visuales y prácticos",priority:"high",formats:["Reels","Carruseles","Stories"],publishingFrequency:"4 por semana",toneAdjustment:"Directo y visual",contentNotes:"Priorizar flujos y ejemplos, sin métricas no verificadas.",score:88,reason:"Combina alcance visual y profundidad educativa para la audiencia propuesta.",confidence:.76},
      {channel:"linkedin",enabled:true,roleInCampaign:"Autoridad y consideración",objective:"Explicar el sistema operativo y sus decisiones",audienceFit:"Alto para responsables de negocio y crecimiento",priority:"high",formats:["Documento","Post educativo","Video corto"],publishingFrequency:"3 por semana",toneAdjustment:"Consultivo y concreto",contentNotes:"Usar argumentos operativos y evidencia del producto.",score:84,reason:"La audiencia puede evaluar valor de negocio y operación en este canal.",confidence:.78},
      {channel:"youtube",enabled:true,roleInCampaign:"Educación profunda",objective:"Demostrar workflows y reducir objeciones",audienceFit:"Medio-alto para búsqueda y evaluación",priority:"medium",formats:["Tutorial","Demo","Short"],publishingFrequency:"1 video y 2 shorts por semana",toneAdjustment:"Didáctico",contentNotes:"Separar claramente producto real de visión futura.",score:73,reason:"Aporta profundidad para explicar una categoría compleja.",confidence:.68},
      {channel:"tiktok",enabled:false,roleInCampaign:"Descubrimiento experimental",objective:"Probar conceptos de alto contraste",audienceFit:"Por validar con research externo",priority:"low",formats:["Video corto"],publishingFrequency:"No definido",toneAdjustment:"Ágil, sin perder precisión",contentNotes:"No activar antes de validar presencia de audiencia.",score:52,reason:"El formato encaja, pero falta evidencia externa sobre la audiencia.",confidence:.48},
      {channel:"facebook",enabled:false,roleInCampaign:"Distribución secundaria",objective:"Reutilizar educación si existe audiencia",audienceFit:"Incierto",priority:"low",formats:["Video","Post"],publishingFrequency:"No definido",toneAdjustment:"Claro y cercano",contentNotes:"Activar sólo con señal de audiencia.",score:44,reason:"No hay evidencia interna suficiente para priorizarlo.",confidence:.42},
      {channel:"threads",enabled:false,roleInCampaign:"Conversación",objective:"Explorar lenguaje y preguntas",audienceFit:"Incierto",priority:"low",formats:["Texto corto"],publishingFrequency:"No definido",toneAdjustment:"Conversacional",contentNotes:"Requiere validación.",score:38,reason:"Podría servir para conversación, pero no hay señal suficiente.",confidence:.38},
      {channel:"x",enabled:false,roleInCampaign:"Escucha y conversación",objective:"Validar temas",audienceFit:"Bajo con evidencia disponible",priority:"low",formats:["Hilo","Texto corto"],publishingFrequency:"No definido",toneAdjustment:"Sintético",contentNotes:"No priorizar en M02.1.",score:27,reason:"La evidencia interna no justifica inversión inicial.",confidence:.36}],
      promptVersion:CAMPAIGN_PROMPTS.channelStrategy.version,provider:"mock",model:null},
    delegatedTasks:next(context,"campaign.content_plan","content_strategist","Construir pilares y ángulos","Definir dirección editorial sin producir piezas.","Los canales priorizados ya tienen un rol explícito."),
  };
  if(context.task.type==="campaign.content_plan")return{
    summary:"Bruno definió pilares, ángulos y dirección editorial.",
    output:{pillars:[{name:"Educación",description:"Explicar cómo operar marketing con contexto.",weight:30,objective:"Crear comprensión"},{name:"Problema",description:"Visibilizar el costo del trabajo fragmentado.",weight:20,objective:"Generar relevancia"},{name:"Producto",description:"Mostrar el sistema y sus controles.",weight:20,objective:"Construir consideración"},{name:"Autoridad",description:"Demostrar criterio operativo.",weight:15,objective:"Generar confianza"},{name:"Prueba",description:"Usar evidencia verificable cuando exista.",weight:10,objective:"Reducir riesgo"},{name:"Conversión",description:"Invitar a conocer el producto.",weight:5,objective:"Capturar intención"}],
      angles:[{name:"Crecimiento sin contratar",description:"Coordinar más trabajo sin inflar procesos.",hypothesis:"La eficiencia operativa abre una conversación de crecimiento.",audiencePain:"Capacidad limitada",promise:"Escalar coordinación antes que estructura",recommendedFormats:["Carrusel","Documento"],priority:"high",confidence:.78},{name:"Marketing con continuidad",description:"Un sistema conserva contexto entre tareas.",hypothesis:"La continuidad diferencia a Spectro de herramientas aisladas.",audiencePain:"Trabajo fragmentado",promise:"Mantener estrategia y ejecución conectadas",recommendedFormats:["Video","Demo"],priority:"high",confidence:.81},{name:"Control humano",description:"La automatización se gobierna con aprobaciones y límites.",hypothesis:"Mostrar controles reduce la objeción principal.",audiencePain:"Pérdida de control",promise:"Automatizar sin delegar decisiones sensibles",recommendedFormats:["FAQ","Reel"],priority:"medium",confidence:.75}],
      editorialDirection:"Enseñar el sistema mediante problemas operativos reconocibles, explicar cada decisión y evitar promesas absolutas o métricas no verificadas.",promptVersion:CAMPAIGN_PROMPTS.contentPlan.version,provider:"mock",model:null},
    delegatedTasks:next(context,"campaign.strategy.finalize","cmo","Consolidar Campaign Brief","Validar guardrails, versionar la estrategia y solicitar aprobación.","Research, canales y contenido estratégico están completos."),
  };
  if(context.task.type==="campaign.strategy.finalize")return{summary:"Sofía consolidó el Campaign Brief y lo dejó listo para revisión humana.",output:{reason:"La estrategia conecta objetivo, audiencia, messaging, canales y dirección editorial con evidencia y supuestos explícitos.",confidence:.76,signalsUsed:[`Objetivo: ${objective}`,"Research interno estructurado","Priorización explicada de canales","Guardrails de marca"],promptVersion:CAMPAIGN_PROMPTS.finalBrief.version,provider:"mock",model:null}};
  return null;
}

export class MockProvider implements AgentProvider {
  readonly name = "mock";
  async run(context: AgentContext): Promise<AgentResult> {
    if (context.task.type === "test.fail.retryable") {const failures=typeof context.task.input.failuresBeforeSuccess==="number"?context.task.input.failuresBeforeSuccess:Number.POSITIVE_INFINITY;if(context.task.attempt_count<=failures)throw Object.assign(new Error("Deterministic retry test"),{retryable:true});}
    const campaign=campaignResult(context);if(campaign)return campaign;
    const contentResult = mockContentResult(context);
    if (contentResult) return contentResult;
    if (context.task.type === "cmo.daily_review") return {summary:"Revisión diaria completada; se delegó el análisis de señales de mercado.",output:{provider:"mock",reviewed:["objectives","queue","approvals"],generatedAt:new Date().toISOString()},delegatedTasks:[{role:"market_intelligence",title:"Revisar señales de mercado",description:"Identificar cambios y oportunidades relevantes para los objetivos activos.",type:"market.review_signals",reason:"Seguimiento derivado de la revisión diaria del CMO",input:{sourceTaskId:context.task.id}}]};
    return {summary:`Tarea ${context.task.type} completada por MockProvider.`,output:{provider:"mock",deterministic:true,taskType:context.task.type}};
  }
}
