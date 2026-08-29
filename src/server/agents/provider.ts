import type { AgentProvider } from "./contracts";
import { MockProvider } from "./mock-provider";
import { AnthropicProvider } from "./anthropic/provider";
import { DomainError } from "@/server/errors";

// Which provider answers.
//
// The default stays deterministic. A missing or misspelt AI_PROVIDER has to produce the safe
// behaviour, not a paid call nobody asked for — the same default-deny posture the spend ceiling
// takes, for the same reason.

export function configuredAgentProviderName() {
  return process.env.AI_PROVIDER?.trim() || "mock";
}

export function getAgentProvider(name = configuredAgentProviderName()): AgentProvider {
  if (name === "mock") return new MockProvider();
  if (name === "anthropic") return new AnthropicProvider();
  throw new DomainError("provider", `El proveedor ${name} no está configurado.`, "provider_not_configured", false);
}
