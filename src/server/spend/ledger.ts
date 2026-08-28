import type { SupabaseClient } from "@supabase/supabase-js";
import { denialMessage, type SpendDenial } from "./policy";
import type { Micros } from "./money";

// The boundary between the ceiling and the database that enforces it.
//
// The decision itself is not made here. It is made inside `reserve_spend`, under a row lock, in
// the same transaction that writes the reservation — because a check in application code is a
// read that has already gone stale by the time the write happens, and under a retrying worker
// that race is not rare.
//
// What this module owns is translation: turning the engine's refusals into typed errors the
// callers can act on, and never letting a raw database message reach a person.

export class SpendRefused extends Error {
  constructor(readonly denial: SpendDenial) {
    super(denialMessage(denial));
    this.name = "SpendRefused";
  }
}

export class SpendUnavailable extends Error {
  constructor(readonly cause?: unknown) {
    super("No se pudo verificar el presupuesto.");
    this.name = "SpendUnavailable";
  }
}

/**
 * The engine raises a bare code. Anything unrecognised is treated as a refusal rather than as
 * permission: an unreadable answer from the thing that guards spending is not a yes.
 */
function toDenial(message: string): SpendDenial | null {
  const scope = message.endsWith("_campaign") ? "campaign" : "organization";
  if (message.startsWith("no_budget")) return { reason: "no_budget", scope };
  if (message.startsWith("over_ceiling")) return { reason: "over_ceiling", scope, ceilingMicros: 0, estimateMicros: 0 };
  if (message.startsWith("insufficient_budget")) return { reason: "insufficient_budget", scope, remainingMicros: 0, estimateMicros: 0 };
  return null;
}

export interface ReserveInput {
  organizationId: string;
  campaignId: string | null;
  operation: string;
  provider: string;
  estimateMicros: Micros;
  /**
   * Stable for the logical operation, not for the attempt. A retry must present the same key so
   * it reuses its reservation instead of paying a second time.
   */
  idempotencyKey: string;
  contentItemId?: string | null;
  taskId?: string | null;
}

export interface Reservation {
  id: string;
  estimatedMicros: Micros;
  status: "reserved" | "settled" | "released";
}

type Db = SupabaseClient;

export async function reserveSpend(db: Db, input: ReserveInput): Promise<Reservation> {
  const { data, error } = await db.rpc("reserve_spend", {
    p_organization_id: input.organizationId,
    p_campaign_id: input.campaignId,
    p_operation: input.operation,
    p_provider: input.provider,
    p_estimated_micros: input.estimateMicros,
    p_idempotency_key: input.idempotencyKey,
    p_content_item_id: input.contentItemId ?? null,
    p_task_id: input.taskId ?? null,
  });

  if (error) {
    const denial = toDenial(error.message ?? "");
    if (denial) throw new SpendRefused(denial);
    throw new SpendUnavailable(error);
  }
  const row = data as { id: string; estimated_micros: number; status: Reservation["status"] } | null;
  if (!row) throw new SpendUnavailable();
  return { id: row.id, estimatedMicros: row.estimated_micros, status: row.status };
}

/** Records what the call really cost, once it has come back. */
export async function settleSpend(db: Db, ledgerId: string, actualMicros: Micros, summary?: string) {
  const { error } = await db.rpc("settle_spend", {
    p_ledger_id: ledgerId,
    p_actual_micros: actualMicros,
    p_summary: summary ?? null,
  });
  if (error) throw new SpendUnavailable(error);
}

/** Gives the room back when the call never happened. */
export async function releaseSpend(db: Db, ledgerId: string, summary?: string) {
  const { error } = await db.rpc("release_spend", { p_ledger_id: ledgerId, p_summary: summary ?? null });
  if (error) throw new SpendUnavailable(error);
}

/**
 * Runs paid work between a reservation and its settlement.
 *
 * The reservation is released if the work throws, so a failed call does not sit on budget
 * forever. It is settled with the real cost when the work reports one, and with the estimate
 * when it does not — never with nothing, because an unsettled reservation is money that looks
 * spent but can never be reconciled.
 */
export async function withBudget<T>(
  db: Db,
  input: ReserveInput,
  work: (reservation: Reservation) => Promise<{ result: T; actualMicros?: Micros; summary?: string }>,
): Promise<T> {
  const reservation = await reserveSpend(db, input);
  if (reservation.status !== "reserved") {
    // An idempotent replay of something already settled: the work was done and paid for.
    throw new SpendRefused({ reason: "insufficient_budget", scope: "organization", remainingMicros: 0, estimateMicros: input.estimateMicros });
  }
  try {
    const outcome = await work(reservation);
    await settleSpend(db, reservation.id, outcome.actualMicros ?? reservation.estimatedMicros, outcome.summary);
    return outcome.result;
  } catch (error) {
    await releaseSpend(db, reservation.id, "La operación falló y no se cobró.").catch(() => undefined);
    throw error;
  }
}
