export function idempotencyKey(...parts:Array<string|number>) {
  const normalized=parts.map(part=>String(part).trim().toLowerCase()).filter(Boolean);
  if(!normalized.length)throw new Error("idempotency key requires at least one part");
  return normalized.join(":");
}
