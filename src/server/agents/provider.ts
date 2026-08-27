import type { AgentProvider } from "./contracts";
import { MockProvider } from "./mock-provider";
import { DomainError } from "@/server/errors";

export function configuredAgentProviderName() {
  return process.env.AI_PROVIDER?.trim() || "mock";
}

export function getAgentProvider(name = configuredAgentProviderName()): AgentProvider {
  if (name === "mock") return new MockProvider();
  throw new DomainError("provider", `El proveedor ${name} aún no está configurado en M01.`, "provider_not_configured", false);
}
