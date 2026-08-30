import { z } from "zod";
import { getOrganizationContext } from "@/features/organizations/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPPORTED_PLATFORMS } from "@/server/content/platforms";

// Which account a channel publishes to.
//
// Separate from the OAuth connection on purpose. Authorising an app says this system may act for
// you; naming the page says where. A person can administer several pages with one LinkedIn
// account, and guessing which one a campaign belongs to is not a guess worth making silently.
//
// The value is not a secret — a LinkedIn page id sits in the URL of its own admin dashboard — so
// it lives on social_integrations where members can read it and confirm the right page is set.

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  // Digits only: the id is what appears in linkedin.com/company/<id>/, and accepting a whole
  // pasted URL here would store something the author URN cannot be built from.
  accountId: z.string().trim().regex(/^\d{4,20}$/, "El id de la página son sólo números"),
  accountName: z.string().trim().max(160).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  if (!SUPPORTED_PLATFORMS.includes(platform as (typeof SUPPORTED_PLATFORMS)[number])) {
    return Response.json({ error: "unknown_platform" }, { status: 404 });
  }

  const context = await getOrganizationContext();
  if (!context) return Response.json({ error: "organization_required" }, { status: 401 });
  if (context.role !== "owner" && context.role !== "admin") return Response.json({ error: "forbidden" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "validation", message: parsed.error.issues[0]?.message ?? "Valor inválido" }, { status: 400 });
  }

  const { error } = await createAdminClient().from("social_integrations").upsert(
    {
      organization_id: context.orgId,
      platform,
      external_account_id: parsed.data.accountId,
      account_name: parsed.data.accountName ?? null,
      account_handle: `linkedin.com/company/${parsed.data.accountId}`,
    },
    { onConflict: "organization_id,platform" },
  );
  if (error) return Response.json({ error: "save_failed", code: error.code }, { status: 400 });

  await createAdminClient().from("activity_log").insert({
    organization_id: context.orgId,
    action: "integration.account_set",
    actor_type: "user",
    actor_id: context.user.id,
    entity_type: "integration",
    summary: `Se fijó la página de ${platform} donde se publica`,
    metadata: { platform, account_id: parsed.data.accountId },
  });

  return Response.json({ accountId: parsed.data.accountId });
}
