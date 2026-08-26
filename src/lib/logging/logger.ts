type LogLevel = "info" | "warn" | "error";
export type LogContext = { organizationId?: string; taskId?: string; agentId?: string; runId?: string; eventId?: string; correlationId?: string };

export function log(level: LogLevel, message: string, context: LogContext = {}, data: Record<string, unknown> = {}) {
  const entry = { timestamp: new Date().toISOString(), level, message, ...context, data };
  const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.info;
  sink(JSON.stringify(entry));
}
