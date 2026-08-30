import { getOrganizationContext } from "@/features/organizations/context";
import { authorizeUrl, signState } from "@/server/integrations/linkedin";
import { appCredentials } from "@/server/integrations/credentials";

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
  const credentials = await appCredentials(context.orgId, "linkedin");
  if (!credentials) {
    return Response.json(
      { error: "not_configured", message: "No hay una app de LinkedIn configurada para esta organización ni para la plataforma." },
      { status: 409 },
    );
  }

  const state = signState({ organizationId: context.orgId, userId: context.user.id, issuedAt: Date.now() });
  return Response.redirect(authorizeUrl(state, credentials), 302);
}
