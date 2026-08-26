import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { dispatch } from "@/server/workers/dispatcher";
import { getServerEnv } from "@/lib/env";
import { log } from "@/lib/logging/logger";

export const runtime = "nodejs";
export const maxDuration = 60;

const inputSchema = z.object({ workerId: z.string().min(3).max(100).optional() });
function validSecret(received: string | null, expected: string) {
  if (!received) return false;
  const a = Buffer.from(received); const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const env = getServerEnv();
  const auth = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? request.headers.get("x-cron-secret");
  if (!validSecret(auth, env.CRON_SECRET)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const parsed = inputSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });
  const workerId = parsed.data.workerId ?? `vercel-${crypto.randomUUID()}`;
  try {
    const report = await dispatch({ workerId, batchSize: env.DISPATCH_BATCH_SIZE, leaseSeconds: env.TASK_LEASE_SECONDS });
    return Response.json(report);
  } catch (error) {
    log("error", "dispatcher.failed", { correlationId: workerId }, { message: error instanceof Error ? error.message : "unknown" });
    return Response.json({ error: "dispatch_failed", workerId }, { status: 500 });
  }
}
