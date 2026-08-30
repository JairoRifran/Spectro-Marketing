import { getOrganizationContext } from "@/features/organizations/context";
import { authorizeUrl, isConfigured, signState } from "@/server/integrations/linkedin";

// Starting the connection.
//
// A GET that redirects, because the browser has to leave for LinkedIn and come back. It refuses
// before redirecting rather than after: sending someone to a consent screen that cannot complete
// wastes their time and teaches them the button is broken.

export const dynamic = "force-dynamic";

export async function GET() {
  const context = await getOrganizationContext();
  if (!context) return Response.json({ error: "organization_required" }, { status: 401 });
  if (context.role !== "owner" && context.role !== "admin") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  if (!isConfigured()) {
    return Response.json(
      { error: "not_configured", message: "Faltan LINKEDIN_CLIENT_ID y LINKEDIN_CLIENT_SECRET en el servidor." },
      { status: 409 },
    );
  }

  const state = signState({ organizationId: context.orgId, userId: context.user.id, issuedAt: Date.now() });
  return Response.redirect(authorizeUrl(state), 302);
}
