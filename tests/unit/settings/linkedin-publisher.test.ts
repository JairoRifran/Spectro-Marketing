import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { commentaryFor, DEFAULT_VERSION, POSTS_URL } from "@/server/integrations/linkedin-publisher";
import type { PlatformContentVariant } from "@/server/content/schemas/variant";

// The one call in this product that writes under a brand's own name, in front of its audience.
// Getting a field wrong elsewhere produces a failed job; getting it wrong here produces a post.

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const publisher = read("../../../src/server/integrations/linkedin-publisher.ts");
const route = read("../../../src/app/api/content/[id]/publish/route.ts");
const migration = read("../../../supabase/migrations/202608300005_content_publications.sql");

const textVariant = (post: { hook: string; body: string; cta: string }) => ({
  detail: { shape: "text", post: { ...post, readingLevel: "professional", sources: [] } },
} as unknown as PlatformContentVariant);

describe("the request LinkedIn documented", () => {
  it("posts to the versioned endpoint with the headers it requires", () => {
    expect(POSTS_URL).toBe("https://api.linkedin.com/rest/posts");
    expect(publisher).toContain('"x-restli-protocol-version": "2.0.0"');
    expect(publisher).toContain('"linkedin-version"');
  });

  it("pins a version that is still alive", () => {
    // These are sunset on a schedule — the August 2025 one stopped working on 17 August 2026 —
    // so this is a constant to review, not one to set and forget.
    expect(DEFAULT_VERSION).toMatch(/^20\d{4}$/);
    expect(Number(DEFAULT_VERSION)).toBeGreaterThan(202508);
  });

  it("builds the author URN rather than trusting a pasted one", () => {
    expect(publisher).toContain("`urn:li:organization:${input.organizationId}`");
  });

  it("reads the created id from the header, where it actually comes back", () => {
    // It is not in the body. Without it there is no way to find the post again.
    expect(publisher).toContain('response.headers.get("x-restli-id")');
  });

  it("does not report a missing id as a failure", () => {
    // The post very likely exists; calling it failed invites a second one.
    const branch = publisher.slice(publisher.indexOf("if (!externalId)"));
    expect(branch).toMatch(/es probable que ya esté publicada/);
    expect(branch).toContain("false,");
  });
});

describe("what the post says", () => {
  it("does not repeat a hook that already opens the body", () => {
    const commentary = commentaryFor(textVariant({ hook: "Un equipo sin equipo.", body: "Un equipo sin equipo. El proceso existe igual.", cta: "¿Te pasa?" }));
    expect(commentary).toBe("Un equipo sin equipo. El proceso existe igual.\n\n¿Te pasa?");
  });

  it("keeps hook, body and call to action when they differ", () => {
    const commentary = commentaryFor(textVariant({ hook: "H", body: "B", cta: "C" }));
    expect(commentary).toBe("H\n\nB\n\nC");
  });
});

describe("the gates before anything leaves", () => {
  it("refuses a piece that is not approved", () => {
    // Publishing a draft is the failure this product exists to prevent.
    expect(route).toContain('item.status !== "approved"');
  });

  it("refuses without a connection and without a page", () => {
    expect(route).toContain('integration?.status !== "connected"');
    expect(route).toContain("integration.external_account_id");
  });

  it("reserves in the database before calling, not after", () => {
    // Publishing is not idempotent at LinkedIn: the same text twice is two posts. A check in code
    // reads, decides and writes, and two requests that read before either writes both publish.
    expect(route.indexOf("content_publications")).toBeLessThan(route.indexOf("publishToLinkedIn("));
    expect(migration).toContain("create unique index content_publications_once");
    expect(migration).toContain("where status = 'published'");
  });

  it("releases the reservation when the call fails", () => {
    // Only successes are constrained, so a failure has to be marked as one or the piece can never
    // be published again.
    expect(route).toContain('status: "failed"');
  });

  it("recognises a duplicate rather than reporting a generic error", () => {
    expect(route).toContain('reserveError.code === "23505"');
    expect(route).toContain("already_published");
  });

  it("never blurs who decided", () => {
    expect(migration).toContain("decided_by_type in ('user','policy')");
    expect(route).toContain('decided_by_type: "user"');
  });
});
