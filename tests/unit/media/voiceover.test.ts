import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MockMediaProvider } from "@/server/media/mock-provider";
import { MediaProviderError, type MediaProvider, type SpeechRequest } from "@/server/media/provider";
import { synthesizeVoiceover } from "@/server/media/voiceover";
import { SpendRefused, SpendUnavailable } from "@/server/spend/ledger";

// A double for the spend engine, recording the order it was driven in.
//
// The order is what is being tested, not the arithmetic: reserving after the vendor has already
// answered would enforce the ceiling against money that is already spent, and the tests would
// still pass on totals.
function fakeDb(options: { reserveError?: string; ledgerStatus?: string } = {}) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const db = {
    async rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args });
      if (fn === "reserve_spend") {
        if (options.reserveError) return { data: null, error: { message: options.reserveError } };
        return {
          data: { id: "ledger-1", estimated_micros: args.p_estimated_micros, status: options.ledgerStatus ?? "reserved" },
          error: null,
        };
      }
      return { data: null, error: null };
    },
  } as unknown as SupabaseClient;
  return { db, calls };
}

const input = {
  organizationId: "org-1",
  campaignId: "camp-1",
  contentItemId: "item-1",
  text: "Antes de automatizar, describí la tarea de principio a fin.",
  voiceId: "voz-principal",
  idempotencyKey: "req-1",
};

const rates = { ttsPerCharacterMicros: 10, minimumChargeMicros: 0 };

describe("synthesising a voiceover", () => {
  it("reserves before calling the vendor, and settles after", async () => {
    const { db, calls } = fakeDb();
    await synthesizeVoiceover(db, input, new MockMediaProvider(), rates);
    expect(calls.map((call) => call.fn)).toEqual(["reserve_spend", "settle_spend"]);
  });

  it("estimates from the exact string that will be sent", async () => {
    // Estimating from anything upstream of the sent string enforces the ceiling against a
    // number that has nothing to do with the invoice.
    const { db, calls } = fakeDb();
    await synthesizeVoiceover(db, input, new MockMediaProvider(), rates);
    expect(calls[0].args.p_estimated_micros).toBe([...input.text].length * 10);
  });

  it("settles with what the vendor charged, not with the estimate", async () => {
    const { db, calls } = fakeDb();
    await synthesizeVoiceover(db, input, new MockMediaProvider(), rates);
    // The mock genuinely costs nothing and says so, so nothing may be booked against the ceiling.
    expect(calls[1].args.p_actual_micros).toBe(0);
  });

  it("falls back to the estimate when the vendor reports no cost at all", async () => {
    const silent: MediaProvider = {
      name: "silent",
      billedCharacters: (request: SpeechRequest) => [...request.text].length,
      synthesizeSpeech: async () => ({ bytes: new Uint8Array([1]), mimeType: "audio/wav", durationSeconds: 1, generatedBy: "provider" as const }),
    };
    const { db, calls } = fakeDb();
    await synthesizeVoiceover(db, input, silent, rates);
    // Never settle with nothing: an unsettled reservation is money that can never be reconciled.
    expect(calls[1].args.p_actual_micros).toBe([...input.text].length * 10);
  });

  it("never calls the vendor when the ceiling refuses", async () => {
    let called = false;
    const watcher: MediaProvider = {
      name: "watcher",
      billedCharacters: () => 1,
      synthesizeSpeech: async () => { called = true; throw new Error("should not run"); },
    };
    const { db } = fakeDb({ reserveError: "insufficient_budget_organization" });
    await expect(synthesizeVoiceover(db, input, watcher, rates)).rejects.toBeInstanceOf(SpendRefused);
    expect(called, "the vendor was contacted despite the refusal").toBe(false);
  });

  it("names the scope that refused, so the message can be acted on", async () => {
    const { db } = fakeDb({ reserveError: "no_budget_campaign" });
    const error = await synthesizeVoiceover(db, input, new MockMediaProvider(), rates).catch((thrown) => thrown);
    expect(error).toBeInstanceOf(SpendRefused);
    expect((error as SpendRefused).denial.scope).toBe("campaign");
    expect(error.message).toContain("campaña");
  });

  it("treats an unreadable refusal as a refusal, never as permission", async () => {
    // An answer nobody can parse, from the thing that guards spending, is not a yes.
    const { db } = fakeDb({ reserveError: "connection reset by peer" });
    await expect(synthesizeVoiceover(db, input, new MockMediaProvider(), rates)).rejects.toBeInstanceOf(SpendUnavailable);
  });

  it("releases the reservation when the vendor fails, so budget is not held forever", async () => {
    const broken: MediaProvider = {
      name: "broken",
      billedCharacters: () => 1,
      synthesizeSpeech: async () => { throw new MediaProviderError("unavailable", "broken"); },
    };
    const { db, calls } = fakeDb();
    await expect(synthesizeVoiceover(db, input, broken, rates)).rejects.toBeInstanceOf(MediaProviderError);
    expect(calls.map((call) => call.fn)).toEqual(["reserve_spend", "release_spend"]);
  });

  it("does not settle a failed call", async () => {
    const broken: MediaProvider = {
      name: "broken",
      billedCharacters: () => 1,
      synthesizeSpeech: async () => { throw new MediaProviderError("rejected", "broken"); },
    };
    const { db, calls } = fakeDb();
    await synthesizeVoiceover(db, input, broken, rates).catch(() => undefined);
    expect(calls.some((call) => call.fn === "settle_spend")).toBe(false);
  });

  it("refuses to run again against a reservation that was already settled", async () => {
    // An idempotent replay of finished work: it was done and paid for, so doing it again would
    // be a second charge wearing the first one's key.
    const { db } = fakeDb({ ledgerStatus: "settled" });
    await expect(synthesizeVoiceover(db, input, new MockMediaProvider(), rates)).rejects.toBeInstanceOf(SpendRefused);
  });

  it("passes the caller's idempotency key straight through", async () => {
    const { db, calls } = fakeDb();
    await synthesizeVoiceover(db, input, new MockMediaProvider(), rates);
    expect(calls[0].args.p_idempotency_key).toBe("req-1");
  });

  it("records a summary that could reconcile an invoice and nothing that could be a secret", async () => {
    const { db, calls } = fakeDb();
    await synthesizeVoiceover(db, input, new MockMediaProvider(), rates);
    const summary = String(calls[1].args.p_summary);
    expect(summary).toMatch(/\d+ caracteres/);
    expect(summary).not.toContain(input.text);
    expect(summary).not.toContain(input.voiceId);
  });

  it("returns audio that actually plays", async () => {
    const { db } = fakeDb();
    const result = await synthesizeVoiceover(db, input, new MockMediaProvider(), rates);
    expect(String.fromCharCode(...result.bytes.slice(0, 4))).toBe("RIFF");
    expect(result.generatedBy).toBe("mock");
  });
});
