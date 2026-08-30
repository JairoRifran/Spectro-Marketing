import { z } from "zod";
import { getOrganizationContext } from "@/features/organizations/context";
import { createAdminClient } from "@/lib/supabase/admin";

// Changing who signs off on a publication.
//
// Administrative, audited, and reversible. The write goes through the caller's own session so
// RLS proves the role rather than this route asserting it, and the activity entry records who
// chose what: a decision that removes human review from a brand's own channels has to be
// answerable for later, and "the setting was already like that" is not an answer.

export const dynamic = "force-dynamic";

const bodySchema = z.object({ mode: z.enum(["human_review", "autonomous"]) });

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "validation" }, { status: 400 });

  const context = await getOrganizationContext();
  if (!context) return Response.json({ error: "organization_required" }, { status: 401 });
  if (context.role !== "owner" && context.role !== "admin") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const { mode } = parsed.data;
  const { error } = await context.db
    .from("organizations")
    .update({ publishing_mode: mode, publishing_mode_updated_at: new Date().toISOString(), publishing_mode_updated_by: context.user.id })
    .eq("id", context.orgId);
  if (error) return Response.json({ error: "update_failed", code: error.code }, { status: 400 });

  await createAdminClient().from("activity_log").insert({
    organization_id: context.orgId,
    action: mode === "autonomous" ? "org.publishing_autonomous" : "org.publishing_human_review",
    actor_type: "user",
    actor_id: context.user.id,
    entity_type: "organization",
    entity_id: context.orgId,
    summary: mode === "autonomous"
      ? "Publicación automática habilitada: las piezas pueden salir sin decisión humana"
      : "Publicación devuelta a revisión humana",
    metadata: { mode },
  });

  return Response.json({ mode });
}
