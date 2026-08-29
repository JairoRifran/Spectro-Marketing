import { isSupabaseConfigured } from "@/lib/env";
import { configuredAgentProviderName } from "@/server/agents/provider";

// Health, and which build is answering.
//
// "I don't see it in production" was asked repeatedly while there was no way to tell a deploy
// that had not finished from a change that had not shipped, and the workaround was grepping the
// deployed CSS bundle for a class that only existed in the new commit. The commit and the
// configured provider answer both questions in one request.
//
// Neither is a secret: a commit hash is meaningless without the repository, and the provider is
// a name, never a key. Nothing here reads a credential — only whether one was chosen.

export const dynamic = "force-dynamic";

/** Set by Vercel on every deployment; absent when running locally. */
const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local";

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
    {
      status: database ? "ok" : "degraded",
      app: true,
      database,
      commit,
      // Which generator writes content. "mock" means the deterministic one, whatever key is set.
      agentProvider: configuredAgentProviderName(),
      timestamp: new Date().toISOString(),
    },
    { status: database ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
