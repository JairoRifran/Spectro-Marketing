import { getOrganizationContext } from "@/features/organizations/context";
import { isDemoMode } from "@/lib/env";

// Single source of truth for "pending": the sidebar badge and Marketing HQ must
// never disagree, so both derive from this status and this organization scope.
export const PENDING_APPROVAL_STATUS = "requested";
export const DEMO_PENDING_APPROVALS = 1;

export function countPendingApprovals(rows: Array<{ status: string }>) {
  return rows.filter((row) => row.status === PENDING_APPROVAL_STATUS).length;
}

export async function getPendingApprovalCount() {
  if (isDemoMode) return DEMO_PENDING_APPROVALS;
  const context = await getOrganizationContext();
  if (!context) return 0;
  const { count } = await context.db.from("approvals").select("id", { count: "exact", head: true })
    .eq("organization_id", context.orgId).eq("status", PENDING_APPROVAL_STATUS);
  return count ?? 0;
}
