import { getOrganizationContext } from "@/features/organizations/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { commentaryFor, LinkedInPublishError, publishToLinkedIn } from "@/server/integrations/linkedin-publisher";
import type { PlatformContentVariant } from "@/server/content/schemas/variant";

// Publishing a piece.
//
// The only action here that leaves the building. Everything it checks is checked because skipping
// it would put something in front of an audience that nobody intended:
//
//   * the piece is approved -- publishing a draft is the failure this whole product exists to
//     prevent;
//   * the channel is connected and points at a specific company page;
//   * the row is reserved in the database before the call, not after. Publishing is not
//     idempotent at LinkedIn: the same text posted twice is two posts on the page. A check in
//     code reads, decides and writes, and two requests that read before either writes both decide
//     to publish. The partial unique index decides instead.
//
// A failed attempt releases its reservation, because a piece that could not be published should
// be publishable once the cause is fixed.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getOrganizationContext();
  if (!context) return Response.json({ error: "organization_required" }, { status: 401 });
  if (context.role === "viewer") return Response.json({ error: "forbidden" }, { status: 403 });

  // Read through the caller's session so RLS proves the piece is theirs before any service-role work.
  const { data: item } = await context.db
    .from("content_items")
    .select("id,campaign_id,current_version,status,platform,title")
    .eq("id", id)
    .eq("organization_id", context.orgId)
    .maybeSingle();
  if (!item) return Response.json({ error: "content_not_found" }, { status: 404 });
  if (item.platform !== "linkedin") {
    return Response.json({ error: "platform_unsupported", message: "Por ahora sólo LinkedIn tiene publicador." }, { status: 409 });
  }
  if (item.status !== "approved") {
    return Response.json({ error: "not_approved", message: "Una pieza se publica después de aprobarse, no antes." }, { status: 409 });
  }

  const admin = createAdminClient();

  const [{ data: integration }, { data: token }, { data: variantRow }] = await Promise.all([
    admin.from("social_integrations").select("status,external_account_id").eq("organization_id", context.orgId).eq("platform", "linkedin").maybeSingle(),
    admin.from("social_tokens").select("access_token,expires_at").eq("organization_id", context.orgId).eq("platform", "linkedin").maybeSingle(),
    admin.from("content_variants").select("payload").eq("content_item_id", id).eq("version", item.current_version).maybeSingle(),
  ]);

  if (integration?.status !== "connected" || !token?.access_token) {
    return Response.json({ error: "not_connected", message: "Conectá LinkedIn antes de publicar." }, { status: 409 });
  }
  if (!integration.external_account_id) {
    return Response.json({ error: "no_page", message: "Falta indicar en qué página de empresa publicar." }, { status: 409 });
  }
  if (token.expires_at && new Date(token.expires_at).getTime() < Date.now()) {
    return Response.json({ error: "token_expired", message: "El acceso a LinkedIn venció. Reconectalo." }, { status: 409 });
  }
  if (!variantRow) return Response.json({ error: "content_not_found" }, { status: 404 });

  // Reserved before the call. A conflict here means this exact version already went out.
  const { data: reservation, error: reserveError } = await admin
    .from("content_publications")
    .insert({
      organization_id: context.orgId,
      campaign_id: item.campaign_id,
      content_item_id: id,
      content_version: item.current_version,
      platform: "linkedin",
      status: "published",
      decided_by_type: "user",
      decided_by: context.user.id,
    })
    .select("id")
    .single();

  if (reserveError) {
    if (reserveError.code === "23505") {
      return Response.json({ error: "already_published", message: "Esta versión ya se publicó en LinkedIn." }, { status: 409 });
    }
    return Response.json({ error: "reserve_failed", code: reserveError.code }, { status: 400 });
  }

  try {
    const result = await publishToLinkedIn({
      accessToken: token.access_token,
      organizationId: integration.external_account_id,
      commentary: commentaryFor(variantRow.payload as PlatformContentVariant),
    });

    await admin.from("content_publications").update({ external_id: result.externalId, external_url: result.externalUrl }).eq("id", reservation.id);
    await admin.from("content_items").update({ status: "published" }).eq("id", id).eq("organization_id", context.orgId);
    await admin.from("activity_log").insert({
      organization_id: context.orgId,
      campaign_id: item.campaign_id,
      content_item_id: id,
      action: "content.published",
      actor_type: "user",
      actor_id: context.user.id,
      entity_type: "content_item",
      entity_id: id,
      summary: `"${item.title}" se publicó en LinkedIn`,
      metadata: { platform: "linkedin", external_id: result.externalId, version: item.current_version },
    });

    return Response.json({ published: true, url: result.externalUrl });
  } catch (error) {
    const failure = error instanceof LinkedInPublishError ? error : null;
    // Releases the reservation: the partial index only constrains successes, so marking this
    // failed makes the piece publishable again once the cause is fixed.
    await admin
      .from("content_publications")
      .update({ status: "failed", error: failure?.message ?? "Fallo desconocido al publicar" })
      .eq("id", reservation.id);
    await admin.from("activity_log").insert({
      organization_id: context.orgId,
      campaign_id: item.campaign_id,
      content_item_id: id,
      action: "content.publish_failed",
      actor_type: "user",
      actor_id: context.user.id,
      entity_type: "content_item",
      entity_id: id,
      summary: `No se pudo publicar "${item.title}" en LinkedIn`,
      metadata: { platform: "linkedin", status: failure?.status ?? null },
    });

    return Response.json(
      { error: "publish_failed", message: failure?.message ?? "No se pudo publicar.", retryable: failure?.retryable ?? false },
      { status: 502 },
    );
  }
}
