import { z } from "zod";
import { getOrganizationContext } from "@/features/organizations/context";
import { requestContentRevision } from "@/server/content-factory/revision";
import { publicError } from "@/server/errors";

// One surface for the three human outcomes. Approve and reject go through the M01 approval
// engine unchanged; a revision records the same human decision and then explicitly creates the
// next version, so nothing is inferred and nothing is overwritten.

const schema = z
  .object({
    decision: z.enum(["approve", "reject", "revision"]),
    feedback: z.string().trim().max(2000).optional(),
  })
  .refine((value) => value.decision !== "revision" || (value.feedback?.length ?? 0) >= 5, {
    message: "Una revisión necesita feedback.",
    path: ["feedback"],
  });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });

  const context = await getOrganizationContext();
  if (!context) return Response.json({ error: "organization_required" }, { status: 401 });
  if (context.role === "viewer") return Response.json({ error: "forbidden" }, { status: 403 });

  // RLS decides ownership: a piece from another organization simply is not visible here.
  const { data: item } = await context.db.from("content_items").select("id,status").eq("id", id).eq("organization_id", context.orgId).maybeSingle();
  if (!item) return Response.json({ error: "content_not_found" }, { status: 404 });

  const { data: approval } = await context.db
    .from("approvals")
    .select("id,status")
    .eq("content_item_id", id)
    .eq("status", "requested")
    .order("created_at", { ascending: false })
    .maybeSingle();
  if (!approval) return Response.json({ error: "no_open_approval" }, { status: 409 });

  const decision = parsed.data.decision === "approve" ? "approved" : "rejected";
  const note = parsed.data.feedback ?? null;

  const { error } = await context.db.rpc("decide_approval", { p_approval_id: approval.id, p_status: decision, p_note: note });
  if (error) return Response.json({ error: "decision_failed" }, { status: 403 });

  if (parsed.data.decision !== "revision") {
    return Response.json({ id, decision: parsed.data.decision, status: decision });
  }

  try {
    const result = await requestContentRevision(context.orgId, id, context.user.id, parsed.data.feedback!);
    return Response.json({ id, decision: "revision", version: result.version, taskId: result.taskId });
  } catch (revisionError) {
    return Response.json({ error: publicError(revisionError) }, { status: 400 });
  }
}
