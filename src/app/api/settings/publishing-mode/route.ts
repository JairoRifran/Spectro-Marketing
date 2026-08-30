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

// One route, two gates, never both in one call: a request that could move both at once makes
// "everything automatic" a single click, and these are not one decision.
const bodySchema = z.union([
  z.object({ gate: z.literal("publishing"), mode: z.enum(["human_review", "autonomous"]) }),
  z.object({ gate: z.literal("content"), mode: z.enum(["human", "automatic"]) }),
]);

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "validation" }, { status: 400 });

  const context = await getOrganizationContext();
  if (!context) return Response.json({ error: "organization_required" }, { status: 401 });
  if (context.role !== "owner" && context.role !== "admin") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const { gate, mode } = parsed.data;
  const now = new Date().toISOString();
  const patch = gate === "publishing"
    ? { publishing_mode: mode, publishing_mode_updated_at: now, publishing_mode_updated_by: context.user.id }
    : { content_approval_mode: mode, content_approval_mode_updated_at: now, content_approval_mode_updated_by: context.user.id };

  const { error } = await context.db.from("organizations").update(patch).eq("id", context.orgId);
  if (error) return Response.json({ error: "update_failed", code: error.code }, { status: 400 });

  const relaxed = mode === "autonomous" || mode === "automatic";
  const summary = gate === "publishing"
    ? relaxed
      ? "Publicación automática habilitada: una pieza puede llegar a la audiencia sin decisión humana"
      : "Publicación devuelta a revisión humana"
    : relaxed
      ? "Aprobación de contenido automática: las piezas que pasan el control quedan aprobadas sin lectura humana"
      : "Aprobación de contenido devuelta a revisión humana";

  await createAdminClient().from("activity_log").insert({
    organization_id: context.orgId,
    action: `org.${gate}_${relaxed ? "automatic" : "human"}`,
    actor_type: "user",
    actor_id: context.user.id,
    entity_type: "organization",
    entity_id: context.orgId,
    summary,
    metadata: { gate, mode },
  });

  return Response.json({ gate, mode });
}
