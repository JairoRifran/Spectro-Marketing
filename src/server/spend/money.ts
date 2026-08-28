import { z } from "zod";

// Money as integers, always.
//
// Per-character text-to-speech costs a fraction of a cent, so cents are too coarse and floats
// are not an option: 0.1 + 0.2 is not 0.3 in binary floating point, and a ledger that drifts by
// a rounding error every call is a ledger nobody can reconcile against an invoice.
//
// The unit is a millionth of a US dollar. One cent is 10_000 micros, so a rate of
// $0.00003 per character is 30 micros — an exact integer, no rounding anywhere in the arithmetic.

export const MICROS_PER_UNIT = 1_000_000;

export const microsSchema = z
  .number()
  .int("Money is tracked in whole micros; a fraction means a float slipped into the arithmetic.")
  .nonnegative();

export type Micros = number;

export function fromUnits(units: number): Micros {
  return Math.round(units * MICROS_PER_UNIT);
}

export function toUnits(micros: Micros): number {
  return micros / MICROS_PER_UNIT;
}

/**
 * Rounds up. An estimate that rounds down lets a caller spend slightly more than the ceiling
 * allows on every single call, and those fractions accumulate in the vendor's favour.
 */
export function ceilMicros(value: number): Micros {
  return Math.ceil(value);
}

/** For a person: "US$ 0,42". Never used in arithmetic, only for reading. */
export function formatMoney(micros: Micros, currency = "USD"): string {
  return new Intl.NumberFormat("es-UY", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 4 })
    .format(toUnits(micros));
}
