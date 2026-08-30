import { z } from "zod";
import { getOrganizationContext } from "@/features/organizations/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPPORTED_PLATFORMS } from "@/server/content/platforms";

// An organization registering its own developer app.
//
// The secret arrives once and never leaves. It is written with the service role into a table no
// ordinary role can read, and neither this route nor any other returns it: a response that echoed
// what was just saved would put a client secret into a browser's network log for no reason at all.
//
// DELETE removes it, which falls the organization back to the platform's app. That is the undo,
// and it has to exist: a credential you cannot remove is one you cannot rotate.

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  clientId: z.string().trim().min(4).max(200),
  clientSecret: z.string().trim().min(8).max(500),
});

async function authorize(platform: string) {
  if (!SUPPORTED_PLATFORMS.includes(platform as (typeof SUPPORTED_PLATFORMS)[number])) return { error: "unknown_platform", status: 404 } as const;
  const context = await getOrganizationContext();
  if (!context) return { error: "organization_required", status: 401 } as const;
  // Registering an app is administrative: it decides whose review every future connection depends on.
  if (context.role !== "owner" && context.role !== "admin") return { error: "forbidden", status: 403 } as const;
  return { context } as const;
}

export async function POST(request: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const auth = await authorize(platform);
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "validation" }, { status: 400 });

  const { error } = await createAdminClient().from("social_app_credentials").upsert(
    {
      organization_id: auth.context.orgId,
      platform,
      client_id: parsed.data.clientId,
      client_secret: parsed.data.clientSecret,
      created_by: auth.context.user.id,
    },
    { onConflict: "organization_id,platform" },
  );
  if (error) return Response.json({ error: "save_failed", code: error.code }, { status: 400 });

  await createAdminClient().from("activity_log").insert({
    organization_id: auth.context.orgId,
    action: "integration.credentials_set",
    actor_type: "user",
    actor_id: auth.context.user.id,
    entity_type: "integration",
    summary: `Se registró una app propia para ${platform}`,
    // The identifier is not a secret and it is what tells two apps apart later. The secret is not here.
    metadata: { platform, client_id: parsed.data.clientId },
  });

  // Deliberately no echo of what was saved.
  return Response.json({ configured: true, source: "organization" });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const auth = await authorize(platform);
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });

  const { error } = await createAdminClient()
    .from("social_app_credentials")
    .delete()
    .eq("organization_id", auth.context.orgId)
    .eq("platform", platform);
  if (error) return Response.json({ error: "delete_failed", code: error.code }, { status: 400 });

  await createAdminClient().from("activity_log").insert({
    organization_id: auth.context.orgId,
    action: "integration.credentials_cleared",
    actor_type: "user",
    actor_id: auth.context.user.id,
    entity_type: "integration",
    summary: `Se quitó la app propia de ${platform}; vuelve a usarse la de la plataforma`,
    metadata: { platform },
  });

  return Response.json({ configured: false, source: null });
}
