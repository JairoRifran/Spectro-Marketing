export type ErrorKind = "validation" | "authorization" | "provider" | "timeout" | "retryable" | "non_retryable" | "dependency" | "approval";

export class DomainError extends Error {
  constructor(public readonly kind: ErrorKind, message: string, public readonly code: string, public readonly retryable = false) {
    super(message);
    this.name = "DomainError";
  }
}

export function publicError(error: unknown) {
  if (error instanceof DomainError) return { code: error.code, message: error.message, kind: error.kind };
  return { code: "internal_error", message: "No pudimos completar la operación.", kind: "non_retryable" as const };
}
