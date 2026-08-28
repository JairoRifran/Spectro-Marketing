import type { SupabaseClient } from "@supabase/supabase-js";
import { withBudget } from "../spend/ledger";
import { estimateCost, ratesFromEnv, type RateCard } from "../spend/pricing";
import { speechRequestSchema, type MediaProvider, type SpeechResult } from "./provider";

// Synthesising a voiceover, with the ceiling in the path rather than beside it.
//
// The order is the whole point and it is not negotiable: estimate from the exact string that
// will be sent, reserve against that estimate, call the vendor, settle with what it really cost.
// Any other order either checks a number unrelated to the invoice or checks it after the money
// is gone.
//
// The audio is returned, not stored. There is no asset store yet, and inventing half of one
// here would be worse than not having it: the caller gets the bytes and decides what to do with
// them, which today means putting them in the pack the browser downloads.

export interface VoiceoverInput {
  organizationId: string;
  campaignId: string | null;
  contentItemId?: string | null;
  taskId?: string | null;
  text: string;
  voiceId: string;
  language?: string;
  /**
   * Stable for one logical request, supplied by the caller.
   *
   * It belongs to the caller because only the caller knows what "the same request" means: a
   * retried HTTP call is the same request and must not pay twice, while asking for the same
   * script again on purpose is a new one. Deriving it from the text here would quietly make the
   * second deliberate attempt fail instead of costing money, which is a different decision
   * wearing the same clothes.
   */
  idempotencyKey: string;
}

export async function synthesizeVoiceover(
  db: SupabaseClient,
  input: VoiceoverInput,
  provider: MediaProvider,
  rates: RateCard = ratesFromEnv(process.env),
): Promise<SpeechResult> {
  const request = speechRequestSchema.parse({
    text: input.text,
    voiceId: input.voiceId,
    language: input.language ?? "es-UY",
  });

  // Estimated from the string that will actually be sent, so the ceiling is enforced against
  // the same thing the vendor will bill for.
  const estimateMicros = estimateCost({ operation: "media.tts", text: request.text }, rates);

  return withBudget(
    db,
    {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      contentItemId: input.contentItemId ?? null,
      taskId: input.taskId ?? null,
      operation: "media.tts",
      provider: provider.name,
      estimateMicros,
      idempotencyKey: input.idempotencyKey,
    },
    async () => {
      const result = await provider.synthesizeSpeech(request);
      return {
        result,
        // Settle with what the vendor charged when it says so; the estimate is the fallback.
        actualMicros: result.costMicros,
        // Enough to reconcile against an invoice, and nothing that could be a prompt or a key.
        summary: [`${provider.billedCharacters(request)} caracteres`, result.durationSeconds ? `${result.durationSeconds.toFixed(1)}s` : null].filter(Boolean).join(", "),
      };
    },
  );
}
