export const ONBOARDING_PATH = "/onboarding";

export type WorkspaceAccess = { authenticated: boolean; hasOnboardedOrganization: boolean };

export function isOnboardingPath(pathname: string) {
  return pathname === ONBOARDING_PATH || pathname.startsWith(`${ONBOARDING_PATH}/`);
}

// The two branches are exact complements of `hasOnboardedOrganization`, so a redirect
// can never send a request to a destination that redirects it back.
export function resolveWorkspaceRedirect(pathname: string, access: WorkspaceAccess) {
  if (!access.authenticated) return null;
  if (access.hasOnboardedOrganization) return isOnboardingPath(pathname) ? "/" : null;
  return isOnboardingPath(pathname) ? null : ONBOARDING_PATH;
}

export function hasOnboardedOrganization(memberships: Array<{ onboarding_completed_at: string | null }>) {
  return memberships.some((membership) => Boolean(membership.onboarding_completed_at));
}
