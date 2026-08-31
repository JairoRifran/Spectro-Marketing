import { z } from "zod";

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

const serverSchema = publicSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  CRON_SECRET: z.string().min(24),
  AI_PROVIDER: z.preprocess((value) => value === "" ? undefined : value,z.enum(["mock", "openai", "anthropic", "ollama", "hybrid"]).default("mock")),
  DISPATCH_BATCH_SIZE: z.preprocess((value) => value === "" ? undefined : value,z.coerce.number().int().min(1).max(20).default(5)),
  TASK_LEASE_SECONDS: z.preprocess((value) => value === "" ? undefined : value,z.coerce.number().int().min(15).max(900).default(120)),
});

const emptyAsUndefined = (value: unknown) => value === "" ? undefined : value;

const runtimeSchema = z.object({
  AUTOMATION_ENABLED: z.preprocess(emptyAsUndefined,z.enum(["true", "false"]).default("false")).transform((value) => value === "true"),
  DEPLOYMENT_ENVIRONMENT: z.preprocess(emptyAsUndefined,z.enum(["development", "preview", "production", "test"]).default("development")),
  VERCEL_ENV: z.preprocess(emptyAsUndefined,z.enum(["development", "preview", "production"]).optional()),
});

// Next.js inlines only static `process.env.NEXT_PUBLIC_*` references; passing
// `process.env` itself leaves these undefined in the browser bundle.
export function getPublicEnv() {
  return publicSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
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
