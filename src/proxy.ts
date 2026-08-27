import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasOnboardedOrganization, resolveWorkspaceRedirect } from "@/features/organizations/access";

const publicPaths = ["/login", "/signup", "/auth/callback", "/api/health", "/api/internal/jobs/dispatch"];

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || process.env.DEMO_MODE === "true" || process.env.NEXT_PUBLIC_DEMO_MODE === "true") return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => {
        items.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await supabase.auth.getClaims();
  const pathname = request.nextUrl.pathname;
  const isPublic = publicPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  if (!data?.claims && !isPublic) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(login);
  }
  if (data?.claims && (pathname === "/login" || pathname === "/signup")) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  // Route handlers answer with JSON and are guarded by RLS, so only page navigations
  // are steered towards onboarding.
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  if (userId && !isPublic && !pathname.startsWith("/api")) {
    const { data: memberships } = await supabase.from("organization_members")
      .select("organizations(onboarding_completed_at)").eq("user_id", userId).limit(50);
    const rows = (memberships ?? []).map((membership) => ({
      onboarding_completed_at: (membership.organizations as unknown as { onboarding_completed_at: string | null } | null)?.onboarding_completed_at ?? null,
    }));
    const destination = resolveWorkspaceRedirect(pathname, { authenticated: true, hasOnboardedOrganization: hasOnboardedOrganization(rows) });
    if (destination) return NextResponse.redirect(new URL(destination, request.url));
  }
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"] };
