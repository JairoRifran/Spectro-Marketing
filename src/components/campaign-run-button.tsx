"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function CampaignRunButton({id,demo}:{id:string;demo:boolean}){const router=useRouter();const[state,setState]=useState<"idle"|"running"|"error">("idle");async function run(){if(demo){router.refresh();return;}setState("running");const response=await fetch(`/api/campaigns/${id}/run`,{method:"POST"});if(!response.ok){setState("error");return;}router.refresh();setState("idle");}return <div className="run-action"><button className="primary-button" onClick={run} disabled={state==="running"}>{state==="running"?"Sofía está coordinando…":"Run Campaign Brain"}</button>{state==="error"&&<small>No se pudo ejecutar. Revisá actividad y estado.</small>}</div>}
