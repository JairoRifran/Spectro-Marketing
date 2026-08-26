import { z } from "zod";

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

const serverSchema = publicSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  CRON_SECRET: z.string().min(24),
  AI_PROVIDER: z.enum(["mock", "openai", "anthropic"]).default("mock"),
  DISPATCH_BATCH_SIZE: z.coerce.number().int().min(1).max(20).default(5),
  TASK_LEASE_SECONDS: z.coerce.number().int().min(15).max(900).default(120),
});

export function getPublicEnv() {
  return publicSchema.parse(process.env);
}

export function getServerEnv() {
  return serverSchema.parse(process.env);
}

export const isDemoMode = process.env.DEMO_MODE === "true" || process.env.NEXT_PUBLIC_DEMO_MODE === "true";
