"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Running Campaign Brain from the screen.
//
// The endpoint advances what it can in one request and says whether the chain is drained, so
// this asks again until it is. That loop exists because a real model answers one stage at a time
// and five of them do not fit in a single serverless invocation.
//
// It also waits. A stage that misses the platform's ceiling is queued again seconds later, which
// is a condition that resolves on its own, so the loop sleeps until the runtime says the next
// attempt is due and carries on. It used to stop and report a pause, which asked a person to
// press the same button for a deadline we set ourselves — our ceiling is not the user's problem
// to manage.
//
// The stages are named as they complete rather than shown as a spinner: five slow steps behind
// one unchanging label reads as a hang, and the first thing anyone does with a hang is press the
// button again.

/**
 * Bounded, because a loop that never gives up is a loop that spends money all night. The runtime
 * stops re-asking a stage at its own attempt limit well before this, so reaching it means
 * something is wrong that more waiting will not fix.
 */
const MAX_CALLS = 40;
/** Never sleep longer than this at once, so a far-off retry still comes back and reports. */
const MAX_WAIT_MS = 30_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function CampaignRunButton({ id, demo, resume = false, auto = false }: {
  id: string;
  demo: boolean;
  /** The chain already started and stopped partway, so this continues it rather than opening a new one. */
  resume?: boolean;
  /**
   * The chain is already under way, so pick it up without waiting to be pressed.
   *
   * The loop lives in this page, so a reload abandoned a run halfway and left the campaign
   * queued with nothing to drain it. This continues work a person already authorised; it never
   * starts any.
   */
  auto?: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "running" | "error">("idle");
  const [retrying, setRetrying] = useState(false);

  const started = useRef(false);
  useEffect(() => {
    if (!auto || demo || started.current) return;
    started.current = true;
    void run();
    // Once per mount: the effect is a resume, not a schedule.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, demo]);

  async function run() {
    if (demo) { router.refresh(); return; }
    setState("running");
    setRetrying(false);

    for (let call = 0; call < MAX_CALLS; call += 1) {
      const response = await fetch(`/api/campaigns/${id}/run`, { method: "POST" });
      if (!response.ok) { setState("error"); return; }
      const result = (await response.json()) as { done?: boolean; nextAttemptAt?: string | null; report?: { claimed?: number } };
      // Refreshed on every pass, so the pipeline fills in as the work happens rather than
      // arriving all at once at the end.
      router.refresh();
      if (result.done) { setState("idle"); setRetrying(false); return; }

      if (result.report?.claimed === 0) {
        // Work remains but none was claimable: a stage is waiting out its retry. Asking again
        // now cannot help, so wait until the runtime says it is due.
        const dueIn = result.nextAttemptAt ? Date.parse(result.nextAttemptAt) - Date.now() : 5_000;
        setRetrying(true);
        await sleep(Math.min(Math.max(dueIn, 1_000), MAX_WAIT_MS));
        continue;
      }

      setRetrying(false);
    }

    setState("error");
  }

  // The button no longer names a stage. It was counting its own calls rather than finished work,
  // so a retry advanced the label and it announced "Consolidando el brief" while the first agent
  // was still on the draft. The rail below reads the task rows and knows; a button that guesses
  // next to a panel that knows is worse than a button that says only that it is working.
  const label = state === "running"
    ? retrying ? "Reintentando…" : "Trabajando…"
    : resume ? "Continuar estrategia" : "Run Campaign Brain";

  return (
    <div className="run-action">
      <button className="primary-button" onClick={run} disabled={state === "running"}>{label}</button>
      {resume && state === "idle" && <small>La estrategia quedó a medias. Continúa donde se cortó, sin rehacer lo terminado.</small>}
      {state === "error" && <small>No se pudo completar. Revisá actividad y estado.</small>}
    </div>
  );
}
