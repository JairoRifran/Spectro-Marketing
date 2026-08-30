import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { DomainError } from "@/server/errors";

// Application-level encryption for credentials that must persist between requests.
//
// Access control and encryption solve different failures. RLS keeps ordinary database roles from
// reading these rows; AES-GCM keeps a database dump, backup, or accidental service-role query from
// being enough to recover the credentials. The key remains outside Postgres in the server
// environment, so compromising only one of those systems is not sufficient.

const ENVELOPE_PREFIX = "spectro:v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

export type SecretField = "client_secret" | "access_token" | "refresh_token";

export interface SecretContext {
  organizationId: string;
  platform: string;
  field: SecretField;
}

export interface OpenedSecret {
  value: string;
  /** Plaintext and values encrypted with an older key are rewritten by the caller. */
  needsRewrite: boolean;
}

interface KeyEntry {
  id: string;
  value: Buffer;
}

function encryptionError(message: string, code: string) {
  return new DomainError("dependency", message, code, false);
}

function decodeKey(encoded: string, variable: string): Buffer {
  const value = encoded.trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 === 1) {
    throw encryptionError(`${variable} no contiene una clave base64 válida.`, "credential_encryption_key_invalid");
  }

  const key = Buffer.from(value, "base64");
  const canonical = key.toString("base64").replace(/=+$/, "");
  if (key.length !== 32 || canonical !== value.replace(/=+$/, "")) {
    throw encryptionError(`${variable} debe decodificar exactamente 32 bytes.`, "credential_encryption_key_invalid");
  }
  return key;
}

function keyId(key: Buffer): string {
  // An identifier, not key material. It selects the right key during rotation without trying every
  // key and without storing secrets in the envelope.
  return createHash("sha256").update(key).digest("base64url").slice(0, 12);
}

function keyring(env: NodeJS.ProcessEnv): { active: KeyEntry; byId: Map<string, KeyEntry> } {
  const encodedActive = env.CREDENTIAL_ENCRYPTION_KEY?.trim();
  if (!encodedActive) {
    throw encryptionError(
      "Falta CREDENTIAL_ENCRYPTION_KEY en el servidor; no se leerán ni guardarán credenciales sin cifrar.",
      "credential_encryption_not_configured",
    );
  }

  const activeValue = decodeKey(encodedActive, "CREDENTIAL_ENCRYPTION_KEY");
  const active = { id: keyId(activeValue), value: activeValue };
  const entries = [active];
  for (const encoded of (env.CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS ?? "").split(",").map((item) => item.trim()).filter(Boolean)) {
    const value = decodeKey(encoded, "CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS");
    entries.push({ id: keyId(value), value });
  }
  return { active, byId: new Map(entries.map((entry) => [entry.id, entry])) };
}

function additionalData(context: SecretContext): Buffer {
  // JSON preserves field boundaries. Binding all three values prevents a valid ciphertext copied
  // into another organization, platform, or column from decrypting there.
  return Buffer.from(JSON.stringify(["spectro", 1, context.organizationId, context.platform, context.field]), "utf8");
}

function decodeEnvelopePart(encoded: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error("invalid envelope encoding");
  const decoded = Buffer.from(encoded, "base64url");
  if (decoded.toString("base64url") !== encoded) throw new Error("non-canonical envelope encoding");
  return decoded;
}

export function credentialEncryptionConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    keyring(env);
    return true;
  } catch {
    return false;
  }
}

export function sealSecret(value: string, context: SecretContext, env: NodeJS.ProcessEnv = process.env): string {
  if (!value) throw encryptionError("No se puede cifrar una credencial vacía.", "credential_empty");
  const { active } = keyring(env);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", active.value, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(additionalData(context));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [ENVELOPE_PREFIX, active.id, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(":");
}

export function openSecret(stored: string, context: SecretContext, env: NodeJS.ProcessEnv = process.env): OpenedSecret {
  // Rows created before encryption have no envelope. They are accepted only when a key is present,
  // and callers must rewrite them before using the plaintext. This makes the rollout forward-only
  // without requiring the encryption key to enter Postgres or a migration file.
  if (!stored.startsWith(`${ENVELOPE_PREFIX}:`)) {
    keyring(env);
    return { value: stored, needsRewrite: true };
  }

  const parts = stored.split(":");
  if (parts.length !== 6 || `${parts[0]}:${parts[1]}` !== ENVELOPE_PREFIX) {
    throw encryptionError("La credencial cifrada tiene un formato inválido.", "credential_ciphertext_invalid");
  }

  const [, , storedKeyId, encodedIv, encodedTag, encodedCiphertext] = parts;
  const keys = keyring(env);
  const entry = keys.byId.get(storedKeyId!);
  if (!entry) {
    throw encryptionError(
      "La credencial fue cifrada con una clave que ya no está disponible.",
      "credential_encryption_key_unavailable",
    );
  }

  try {
    const iv = decodeEnvelopePart(encodedIv!);
    const tag = decodeEnvelopePart(encodedTag!);
    const ciphertext = decodeEnvelopePart(encodedCiphertext!);
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES || ciphertext.length === 0) throw new Error("invalid envelope");
    const decipher = createDecipheriv("aes-256-gcm", entry.value, iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(additionalData(context));
    decipher.setAuthTag(tag);
    const value = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    return { value, needsRewrite: entry.id !== keys.active.id };
  } catch {
    // Authentication failures do not include the stored value, key id, or vendor credential.
    throw encryptionError(
      "No se pudo autenticar la credencial cifrada. Revisá la clave del entorno antes de reemplazarla.",
      "credential_decryption_failed",
    );
  }
}
