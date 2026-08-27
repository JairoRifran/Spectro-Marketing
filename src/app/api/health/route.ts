import { isSupabaseConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  let database = false;
  if (isSupabaseConfigured) {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/organizations?select=id&limit=1`, {
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
        cache: "no-store",
        signal: AbortSignal.timeout(3_000),
      });
      database = response.ok;
    } catch { database = false; }
  }
  return Response.json(
    { status: database ? "ok" : "degraded", app: true, database, timestamp: new Date().toISOString() },
    { status: database ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
