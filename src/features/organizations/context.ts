import { cookies } from "next/headers";
import { isDemoMode, isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const ORGANIZATION_COOKIE = "spectro_organization";
export type OrganizationChoice = { id: string; name: string; role: "owner"|"admin"|"member"|"viewer" };

export async function getOrganizationContext() {
  if (isDemoMode || !isSupabaseConfigured) return null;
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;
  const { data } = await db.from("organization_members")
    .select("organization_id,role,organizations(name)")
    .eq("user_id", user.id)
    .order("created_at");
  const organizations: OrganizationChoice[] = (data ?? []).map((membership) => ({
    id: membership.organization_id,
    name: (membership.organizations as unknown as { name: string } | null)?.name ?? "Organización",
    role: membership.role,
  }));
  if (!organizations.length) return null;
  const requestedId = (await cookies()).get(ORGANIZATION_COOKIE)?.value;
  const selected = organizations.find((organization) => organization.id === requestedId) ?? organizations[0];
  return { db, user, orgId: selected.id, orgName: selected.name, role: selected.role, organizations };
}
