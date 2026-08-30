import { z } from "zod";
import { getOrganizationContext } from "@/features/organizations/context";
import { publicError } from "@/server/errors";

// Creating an objective.
//
// It existed only as something typed once during onboarding, which quietly said a business has one
// goal forever. It does not, and a campaign that has to be attached to last quarter's objective is
// a campaign that starts by lying about why it exists.
//
// Written through the caller's own session so RLS decides who may create one, rather than this
// route asserting it.

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  title: z.string().trim().min(4).max(160),
  // The measure and the number are required by the table and by the work: an objective without a
  // number is a wish, and Campaign Brain reads both when it argues for a strategy.
  metric: z.string().trim().min(2).max(80),
  target: z.number().finite().positive(),
  description: z.string().trim().max(2000).optional(),
  deadline: z.iso.date().nullable().optional(),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "validation", message: parsed.error.issues[0]?.message ?? "Datos incompletos" }, { status: 400 });
  }

  const context = await getOrganizationContext();
  if (!context) return Response.json({ error: "organization_required" }, { status: 401 });
  if (context.role === "viewer") return Response.json({ error: "forbidden" }, { status: 403 });

  try {
    const { data, error } = await context.db
      .from("objectives")
      .insert({
        organization_id: context.orgId,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        metric: parsed.data.metric,
        target: parsed.data.target,
        deadline: parsed.data.deadline ?? null,
        created_by: context.user.id,
      })
      .select("id,title,metric,target")
      .single();
    if (error || !data) return Response.json({ error: "create_failed", code: error?.code }, { status: 400 });
    return Response.json(data);
  } catch (error) {
    return Response.json({ error: publicError(error) }, { status: 400 });
  }
}
