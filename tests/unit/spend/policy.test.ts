import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ceilMicros, formatMoney, fromUnits, microsSchema, toUnits } from "@/server/spend/money";
import { authorizeSpend, denialMessage, remaining, type SpendLimit } from "@/server/spend/policy";
import { CONSERVATIVE_RATES, estimateCost, ratesFromEnv } from "@/server/spend/pricing";

const limit = (ceiling: number, committed = 0, scope: SpendLimit["scope"] = "organization"): SpendLimit => ({
  scope, ceilingMicros: ceiling, committedMicros: committed,
});

describe("money", () => {
  it("keeps arithmetic in integers, where floats would drift", () => {
    // The classic: 0.1 + 0.2 !== 0.3. A ledger cannot be reconciled against an invoice if it drifts.
    expect(fromUnits(0.1) + fromUnits(0.2)).toBe(fromUnits(0.3));
  });

  it("round-trips a value", () => {
    expect(toUnits(fromUnits(1.2345))).toBeCloseTo(1.2345, 6);
  });

  it("rejects a fractional amount, because that means a float got in", () => {
    expect(microsSchema.safeParse(10.5).success).toBe(false);
    expect(microsSchema.safeParse(-1).success).toBe(false);
    expect(microsSchema.safeParse(10).success).toBe(true);
  });

  it("rounds estimates up, never down", () => {
    // Rounding down lets every call spend a fraction more than allowed, in the vendor's favour.
    expect(ceilMicros(10.0001)).toBe(11);
    expect(ceilMicros(10)).toBe(10);
  });

  it("formats for reading without being used in arithmetic", () => {
    expect(formatMoney(fromUnits(0.42))).toContain("0,42");
  });
});

describe("authorisation", () => {
  it("denies when nothing has been configured", () => {
    // "Unconfigured" must never read as "unlimited". This is the whole posture.
    const decision = authorizeSpend(1_000, []);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.denial.reason).toBe("no_budget");
  });

  it("denies against a zero ceiling", () => {
    const decision = authorizeSpend(1, [limit(0)]);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.denial.reason).toBe("no_budget");
  });

  it("allows a request that fits", () => {
    const decision = authorizeSpend(1_000, [limit(10_000)]);
    expect(decision.allowed).toBe(true);
    if (decision.allowed) expect(decision.remainingAfterMicros).toBe(9_000);
  });

  it("allows a request that exactly exhausts the budget", () => {
    const decision = authorizeSpend(10_000, [limit(10_000)]);
    expect(decision.allowed).toBe(true);
    if (decision.allowed) expect(decision.remainingAfterMicros).toBe(0);
  });

  it("denies the request one micro past the budget", () => {
    const decision = authorizeSpend(10_001, [limit(10_000)]);
    expect(decision.allowed).toBe(false);
  });

  it("separates a request too big for any budget from one that merely does not fit now", () => {
    const tooBig = authorizeSpend(50_000, [limit(10_000)]);
    if (!tooBig.allowed) expect(tooBig.denial.reason).toBe("over_ceiling");

    const noRoomLeft = authorizeSpend(5_000, [limit(10_000, 8_000)]);
    if (!noRoomLeft.allowed) expect(noRoomLeft.denial.reason).toBe("insufficient_budget");
  });

  it("requires every scope to allow it, not just one", () => {
    const decision = authorizeSpend(5_000, [limit(100_000), limit(6_000, 5_000, "campaign")]);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.denial.scope).toBe("campaign");
  });

  it("reports the remaining room of the tightest scope, not the roomiest", () => {
    const decision = authorizeSpend(1_000, [limit(100_000), limit(10_000, 0, "campaign")]);
    if (decision.allowed) expect(decision.remainingAfterMicros).toBe(9_000);
  });

  it("treats an overspent scope as having nothing left rather than a negative balance", () => {
    expect(remaining(limit(10_000, 15_000))).toBe(0);
    expect(authorizeSpend(1, [limit(10_000, 15_000)]).allowed).toBe(false);
  });

  it("refuses a nonsensical estimate instead of trusting it", () => {
    expect(authorizeSpend(-5, [limit(10_000)]).allowed).toBe(false);
    expect(authorizeSpend(1.5, [limit(10_000)]).allowed).toBe(false);
  });

  it("explains a denial in words a person can act on", () => {
    const decision = authorizeSpend(1, [limit(0, 0, "campaign")]);
    if (!decision.allowed) {
      const message = denialMessage(decision.denial);
      expect(message).toContain("campaña");
      expect(message).not.toMatch(/no_budget|micros|undefined/);
    }
  });
});

describe("estimation", () => {
  it("charges by the characters actually sent", () => {
    const short = estimateCost({ operation: "media.tts", text: "hola" });
    const long = estimateCost({ operation: "media.tts", text: "hola hola hola hola hola hola" });
    expect(long).toBeGreaterThan(short);
  });

  it("counts a character, not a code unit", () => {
    // An emoji is two UTF-16 code units; billing it as two would misprice every caption.
    expect([..."👋"].length).toBe(1);
    expect(estimateCost({ operation: "media.tts", text: "👋" }, { ttsPerCharacterMicros: 100, sfxPerSecondMicros: 0, musicPerSecondMicros: 0, minimumChargeMicros: 0 })).toBe(100);
  });

  it("applies a floor, so a tiny request is not treated as free", () => {
    expect(estimateCost({ operation: "media.tts", text: "a" })).toBe(CONSERVATIVE_RATES.minimumChargeMicros);
  });

  it("always returns whole micros", () => {
    const estimate = estimateCost({ operation: "media.tts", text: "una frase cualquiera" }, { ttsPerCharacterMicros: 7, sfxPerSecondMicros: 0, musicPerSecondMicros: 0, minimumChargeMicros: 0 });
    expect(Number.isInteger(estimate)).toBe(true);
  });

  it("falls back to the conservative rates when the environment is unset or nonsense", () => {
    expect(ratesFromEnv({})).toEqual(CONSERVATIVE_RATES);
    expect(ratesFromEnv({ SPECTRO_TTS_MICROS_PER_CHARACTER: "no-es-un-numero" })).toEqual(CONSERVATIVE_RATES);
    expect(ratesFromEnv({ SPECTRO_TTS_MICROS_PER_CHARACTER: "-5" })).toEqual(CONSERVATIVE_RATES);
    expect(ratesFromEnv({ SPECTRO_TTS_MICROS_PER_CHARACTER: "1.5" })).toEqual(CONSERVATIVE_RATES);
  });

  it("takes a configured rate when it is a sane whole number", () => {
    expect(ratesFromEnv({ SPECTRO_TTS_MICROS_PER_CHARACTER: "42" }).ttsPerCharacterMicros).toBe(42);
  });

  it("estimates high rather than low by default", () => {
    // Under-estimating authorises a call that breaks the ceiling. Over-estimating only annoys.
    const perThousand = estimateCost({ operation: "media.tts", text: "x".repeat(1000) });
    expect(toUnits(perThousand)).toBeGreaterThanOrEqual(0.3);
  });
});

// The migration and the TypeScript policy state the same rules twice, in two languages. They
// cannot be allowed to drift: the SQL is what actually protects the money.
describe("the database enforces the same rules", () => {
  const sql = () => readFileSync(new URL("../../../supabase/migrations/202608280001_spend_ceiling.sql", import.meta.url), "utf8");

  it("decides and reserves in one locked transaction, not in application code", () => {
    const source = sql();
    // Without the lock, two concurrent callers both read "there is room" and both proceed.
    expect(source).toContain("for update");
    expect(source.indexOf("for update")).toBeLessThan(source.indexOf("insert into public.spend_ledger"));
  });

  it("defaults to denying: an absent or zero ceiling authorises nothing", () => {
    const source = sql();
    expect(source).toContain("ceiling_micros bigint not null default 0");
    expect(source).toContain("no_budget_organization");
  });

  it("counts reservations as committed, so money in flight still occupies the ceiling", () => {
    expect(sql()).toContain("status in ('reserved', 'settled')");
  });

  it("makes a retry reuse its reservation instead of paying twice", () => {
    const source = sql();
    expect(source).toContain("create unique index spend_ledger_idempotency_idx");
    expect(source).toMatch(/where organization_id = p_organization_id and idempotency_key = p_idempotency_key/);
  });

  it("refuses to settle or release anything that is not a live reservation", () => {
    const source = sql();
    expect(source.match(/where id = p_ledger_id and status = 'reserved'/g)?.length).toBe(2);
  });

  it("passes the guarded column and table to the cross-organization trigger", () => {
    // Called with no arguments the guard reads a null reference and waves every row through:
    // a trigger that exists and protects nothing.
    for (const match of sql().matchAll(/enforce_same_organization_reference\(([^)]*)\)/g)) {
      expect(match[1].trim(), "the guard needs the column and the table it points at").not.toBe("");
    }
  });

  it("keeps both tables behind row level security", () => {
    const source = sql();
    expect(source).toContain("alter table public.spend_limits enable row level security");
    expect(source).toContain("alter table public.spend_ledger enable row level security");
  });

  it("adds nothing destructive, since migrations are forward-only", () => {
    expect(sql()).not.toMatch(/\b(drop table|drop column|truncate|delete from)\b/i);
  });

  it("stays pure ASCII, so no clipboard or codepage can corrupt it in transit", () => {
    expect(/^[\x00-\x7F]*$/.test(sql())).toBe(true);
  });
});
