import type { PlatformContentVariant } from "@/server/content/schemas/variant";

// Posting to a LinkedIn company page.
//
// The request shape here was read from LinkedIn's current Posts API documentation rather than
// recalled, because this is the one call in the product that writes under a brand's own name in
// front of its audience. Getting a field wrong elsewhere produces a failed job; getting it wrong
// here produces a post.
//
// Two details that are easy to get wrong and expensive to discover:
//
//   * The version header is mandatory and dated. Versions are sunset on a schedule — the August
//     2025 one stopped working on 17 August 2026 — so this is a constant that has to be reviewed,
//     not a value that can be set once and forgotten. It is overridable by environment so a sunset
//     can be answered without a deploy.
//   * The created post's identifier does not come back in the body. It arrives in the `x-restli-id`
//     response header, and without it there is no way to find the post again or to prove it was
//     made.

export const POSTS_URL = "https://api.linkedin.com/rest/posts";

/**
 * The dated API version, in YYYYMM.
 *
 * LinkedIn sunsets these roughly a year out. When a call starts failing for no other reason, this
 * is the first thing to check.
 */
export const DEFAULT_VERSION = "202608";

export interface PublishResult {
  externalId: string;
  externalUrl: string | null;
}

export class LinkedInPublishError extends Error {
  constructor(message: string, readonly status: number, readonly retryable: boolean) {
    super(message);
    this.name = "LinkedInPublishError";
  }
}

/**
 * What actually goes in the post.
 *
 * A text post's body is the piece; for any other shape the caption is what LinkedIn shows. The
 * hook is not repeated when it already opens the body, because a post that says its own first
 * line twice reads like a mistake.
 */
export function commentaryFor(variant: PlatformContentVariant): string {
  if (variant.detail.shape === "text") {
    const post = variant.detail.post;
    const hook = post.hook.trim();
    const body = post.body.trim();
    const cta = post.cta.trim();
    // The hook is dropped when the body already opens with it. Writers often repeat the opening
    // line across the two fields, and a post that says its own first sentence twice reads like a
    // mistake rather than like emphasis.
    const lead = body.startsWith(hook) ? [] : [hook];
    return [...lead, body, cta].filter(Boolean).join("\n\n");
  }
  return [variant.hook, variant.caption, variant.cta].filter(Boolean).map((part) => part.trim()).join("\n\n");
}

/** Whether a failed attempt is worth repeating, from LinkedIn's own documented error table. */
function retryable(status: number) {
  return status === 409 || status === 429 || status >= 500;
}

export async function publishToLinkedIn(input: {
  accessToken: string;
  /** Numeric id of the company page. The author URN is built from it rather than pasted whole. */
  organizationId: string;
  commentary: string;
  version?: string;
}): Promise<PublishResult> {
  const response = await fetch(POSTS_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.accessToken}`,
      "x-restli-protocol-version": "2.0.0",
      "linkedin-version": input.version ?? process.env.LINKEDIN_API_VERSION?.trim() ?? DEFAULT_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      author: `urn:li:organization:${input.organizationId}`,
      commentary: input.commentary,
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
  });

  if (!response.ok) {
    // LinkedIn's documented errors are specific enough to act on, and the two worth naming are
    // the ones a person can fix: a missing scope, and an expired token.
    const hint = response.status === 403
      ? "Falta el permiso w_organization_social o el usuario no administra la página."
      : response.status === 401
        ? "El token venció o fue revocado. Reconectá LinkedIn."
        : `LinkedIn respondió ${response.status}.`;
    throw new LinkedInPublishError(hint, response.status, retryable(response.status));
  }

  // Documented: the id comes back in a header, not in the body.
  const externalId = response.headers.get("x-restli-id");
  if (!externalId) {
    // The post very likely exists. Saying it failed would invite a second one, so this is
    // reported as published-without-a-reference rather than as a failure.
    throw new LinkedInPublishError(
      "LinkedIn aceptó la publicación pero no devolvió su identificador. Revisá la página antes de reintentar: es probable que ya esté publicada.",
      response.status,
      false,
    );
  }

  return {
    externalId,
    externalUrl: `https://www.linkedin.com/feed/update/${externalId}/`,
  };
}
