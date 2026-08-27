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

const runtimeSchema = z.object({
  AUTOMATION_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  DEPLOYMENT_ENVIRONMENT: z.enum(["development", "preview", "production", "test"]).default("development"),
  VERCEL_ENV: z.enum(["development", "preview", "production"]).optional(),
});

export function getPublicEnv() {
  return publicSchema.parse(process.env);
}

export function getServerEnv() {
  return serverSchema.merge(runtimeSchema).parse(process.env);
}

export function getRuntimeEnv() { return runtimeSchema.parse(process.env); }

export function automationIsEnabled() {
  const env = getRuntimeEnv();
  const environment = env.VERCEL_ENV ?? env.DEPLOYMENT_ENVIRONMENT;
  return env.AUTOMATION_ENABLED && environment !== "preview" && environment !== "test";
}

export const isDemoMode = process.env.DEMO_MODE === "true" || process.env.NEXT_PUBLIC_DEMO_MODE === "true";
export const isSupabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
