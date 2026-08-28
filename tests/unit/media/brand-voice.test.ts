import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { brandVoiceMessage, resolveBrandVoice, toCatalogue, toProfile } from "@/server/media/brand-voice";
import { deliveryFor } from "@/server/media/voice-profile";

const voices = [
  { provider_voice_id: "rp-f", region: "rioplatense", gender: "femenina", label: "Sofia" },
  { provider_voice_id: "mx-m", region: "mexicana", gender: "masculina", label: "Diego" },
];
const brand = { voice_tone: "reflexiva", voice_region: "rioplatense", voice_gender: "femenina" };

describe("reading the brand's choice", () => {
  it("resolves a chosen profile to a concrete voice and a delivery", () => {
    const result = resolveBrandVoice(brand, voices);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.resolved.voice.providerVoiceId).toBe("rp-f");
      expect(result.resolved.delivery).toEqual(deliveryFor("reflexiva"));
    }
  });

  it("says the brand never chose, rather than picking a tone for it", () => {
    // Guessing a tone would be inventing an editorial decision nobody made.
    const result = resolveBrandVoice({ voice_tone: null, voice_region: null, voice_gender: null }, voices);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problem).toBe("no_profile");
  });

  it("treats a half-configured brand as unconfigured", () => {
    expect(resolveBrandVoice({ voice_tone: "cercana", voice_region: null, voice_gender: null }, voices).ok).toBe(false);
  });

  it("defaults only the part that genuinely has a default", () => {
    expect(toProfile({ voice_tone: "cercana", voice_region: "neutra", voice_gender: null })?.gender).toBe("indistinta");
  });

  it("says there is no voice for that region rather than using another accent", () => {
    const result = resolveBrandVoice({ ...brand, voice_region: "castellana" }, voices);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problem).toBe("no_matching_voice");
      // The profile comes back so the message can name what was actually asked for.
      expect(result.profile?.region).toBe("castellana");
    }
  });

  it("says so when the organization has no voices loaded at all", () => {
    const result = resolveBrandVoice(brand, []);
    if (!result.ok) expect(result.problem).toBe("no_matching_voice");
  });

  it("survives a brand row that does not exist yet", () => {
    expect(resolveBrandVoice(null, voices).ok).toBe(false);
  });
});

describe("the catalogue", () => {
  it("skips a row the vocabulary does not recognise instead of coercing it", () => {
    // Coercing would offer a voice as a region it is not, which is worse than not offering it.
    const catalogue = toCatalogue([...voices, { provider_voice_id: "x", region: "marciana", gender: "femenina", label: "X" }]);
    expect(catalogue).toHaveLength(2);
    expect(catalogue.map((voice) => voice.providerVoiceId)).not.toContain("x");
  });

  it("handles no rows at all", () => {
    expect(toCatalogue(null)).toEqual([]);
  });
});

describe("what a person is told", () => {
  it("explains an unconfigured brand in words, with the fix in them", () => {
    const message = brandVoiceMessage("no_profile");
    expect(message).toMatch(/tono/i);
    expect(message).not.toMatch(/no_profile|null|undefined/);
  });

  it("names the region that had no voice", () => {
    const message = brandVoiceMessage("no_matching_voice", { tone: "cercana", region: "castellana", gender: "indistinta" });
    expect(message).toContain("castellana");
  });
});

// The migration and the domain state the same vocabulary twice. They cannot drift: the database
// is what rejects a bad row, and the code is what decides what a good one means.
describe("the migration agrees with the vocabulary", () => {
  const sql = readFileSync(new URL("../../../supabase/migrations/202608280002_brand_voices_and_assets.sql", import.meta.url), "utf8");

  it("constrains region and gender to the same values the code knows", () => {
    for (const region of ["rioplatense", "mexicana", "castellana", "colombiana", "neutra"]) {
      expect(sql, region).toContain(`'${region}'`);
    }
    for (const tone of ["reflexiva", "entusiasta", "comercial", "cercana", "autoritaria", "informativa"]) {
      expect(sql, tone).toContain(`'${tone}'`);
    }
  });

  it("lets a brand have chosen nothing, since that is a real state", () => {
    expect(sql).toContain("voice_tone is null");
    expect(sql).toContain("voice_region is null");
  });

  it("ties an asset to one version of a piece", () => {
    // Otherwise asking for a revision leaves the old version's files attached to the new one.
    expect(sql).toContain("content_version integer not null");
    expect(sql).toContain("on public.content_assets (content_item_id, content_version, slot)");
  });

  it("keeps the asset bucket private", () => {
    // An unlisted URL is not access control, and these are unpublished drafts of a brand's work.
    expect(sql).toContain("values ('content-assets', 'content-assets', false)");
  });

  it("passes the guarded column and table to every cross-organization trigger", () => {
    for (const match of sql.matchAll(/enforce_same_organization_reference\(([^)]*)\)/g)) {
      expect(match[1].trim()).not.toBe("");
    }
  });

  it("keeps both tables behind row level security", () => {
    expect(sql).toContain("alter table public.brand_voices enable row level security");
    expect(sql).toContain("alter table public.content_assets enable row level security");
  });

  it("adds nothing destructive, since migrations are forward-only", () => {
    expect(sql).not.toMatch(/\b(drop table|drop column|truncate|delete from)\b/i);
  });

  it("stays pure ASCII, so no clipboard or codepage can corrupt it in transit", () => {
    expect(/^[\x00-\x7F]*$/.test(sql)).toBe(true);
  });
});

// The vendor's own interface invites this mistake: its key list shows an identifier, and the
// secret appears once at creation. The two look alike, so the wrong one gets pasted.
describe("the misconfigured key hint", () => {
  const source = readFileSync(new URL("../../../src/features/media/voice-settings.ts", import.meta.url), "utf8");

  it("only speaks up after a call has actually failed", () => {
    // A prefix is a vendor convention and could change; refusing a working key on a guess would
    // be worse than the confusion it avoids.
    const inCatch = source.slice(source.indexOf("} catch (error) {"), source.indexOf("// The database speaks snake_case"));
    expect(inCatch).toContain("configuredKeyHint");
    expect(source).not.toMatch(/if \(!key\?\.startsWith\("sk_"\)\) (return|throw)/);
  });

  it("reports the shape of the value and never the value", () => {
    const body = source.slice(source.indexOf("function configuredKeyHint"), source.indexOf("export async function getVoiceSettings"));
    expect(body).toContain("startsWith(\"sk_\")");
    // Nothing in the message interpolates the key itself.
    expect(body).not.toMatch(/\$\{key\}/);
  });

  it("stays quiet when the key already looks right", () => {
    const body = source.slice(source.indexOf("function configuredKeyHint"), source.indexOf("export async function getVoiceSettings"));
    expect(body).toContain('key.startsWith("sk_")) return ""');
  });
});

// A table that could be read but never written shipped once. The screen reported "no voices
// loaded", which is exactly what an empty table looks like, so the refusal was indistinguishable
// from having never pressed the button.
describe("writing the brand's voices", () => {
  const policy = readFileSync(new URL("../../../supabase/migrations/202608280003_brand_voices_write_policy.sql", import.meta.url), "utf8");
  const route = readFileSync(new URL("../../../src/app/api/media/voices/route.ts", import.meta.url), "utf8");
  const screen = readFileSync(new URL("../../../src/components/voice-settings.tsx", import.meta.url), "utf8");

  it("grants the writes the screen actually performs", () => {
    for (const verb of ["insert", "update", "delete"]) {
      expect(policy, verb).toContain(`for ${verb} to authenticated`);
    }
  });

  it("keeps a viewer out at the database, not only at the route", () => {
    expect(policy).not.toContain("'viewer'");
    expect(policy.match(/has_org_role/g)?.length).toBeGreaterThanOrEqual(3);
    expect(route).toContain('context.role === "viewer"');
  });

  it("tells a policy refusal apart from a duplicate and from anything else", () => {
    // Each is a different thing to do next, and one message for all three tells you none of them.
    expect(route).toContain('error.code === "23505"');
    expect(route).toContain('error.code === "42501"');
    expect(route).toContain("forbidden_by_policy");
  });

  it("names a policy refusal in words rather than as a generic failure", () => {
    expect(screen).toContain("forbidden_by_policy");
    expect(screen).toMatch(/politica de escritura/i);
  });

  it("shows the notice beside the action instead of at the foot of the page", () => {
    // A failure nobody sees reads as nothing happening, which is what actually occurred.
    expect(screen).toContain("const notice = message ?");
    expect(screen.match(/\{notice\}/g)?.length).toBe(2);
  });

  it("stays pure ASCII and adds nothing destructive", () => {
    expect(/^[\x00-\x7F]*$/.test(policy)).toBe(true);
    expect(policy).not.toMatch(/\b(drop table|drop policy|truncate|delete from)\b/i);
  });
});
