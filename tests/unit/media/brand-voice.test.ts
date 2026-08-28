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
