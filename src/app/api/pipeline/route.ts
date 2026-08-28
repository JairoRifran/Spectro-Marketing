import { getOrganizationPipeline } from "@/features/content/pipeline";

// Polled by the Marketing HQ pipeline view. Read-only: it triggers no work and starts nothing.

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await getOrganizationPipeline();
  if (!snapshot) return Response.json({ error: "organization_required" }, { status: 401 });
  return Response.json(snapshot);
}
