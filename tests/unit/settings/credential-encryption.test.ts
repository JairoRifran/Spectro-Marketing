import { describe, expect, it } from "vitest";
import { credentialEncryptionConfigured, openSecret, sealSecret } from "@/server/integrations/secret-crypto";

const key = Buffer.alloc(32, 7).toString("base64");
const oldKey = Buffer.alloc(32, 3).toString("base64");
const env = { CREDENTIAL_ENCRYPTION_KEY: key } as unknown as NodeJS.ProcessEnv;
const context = { organizationId: "org-1", platform: "linkedin", field: "access_token" as const };

describe("credential encryption at rest", () => {
  it("round-trips without storing the plaintext", () => {
    const encrypted = sealSecret("linkedin-token-value", context, env);

    expect(encrypted).toMatch(/^spectro:v1:/);
    expect(encrypted).not.toContain("linkedin-token-value");
    expect(openSecret(encrypted, context, env)).toEqual({ value: "linkedin-token-value", needsRewrite: false });
  });

  it("uses a fresh nonce for every write", () => {
    const first = sealSecret("same-value", context, env);
    const second = sealSecret("same-value", context, env);

    expect(first).not.toBe(second);
    expect(openSecret(first, context, env).value).toBe("same-value");
    expect(openSecret(second, context, env).value).toBe("same-value");
  });

  it("authenticates the organization, platform, and field", () => {
    const encrypted = sealSecret("secret", context, env);

    expect(() => openSecret(encrypted, { ...context, organizationId: "org-2" }, env)).toThrow(/autenticar/);
    expect(() => openSecret(encrypted, { ...context, platform: "facebook" }, env)).toThrow(/autenticar/);
    expect(() => openSecret(encrypted, { ...context, field: "refresh_token" }, env)).toThrow(/autenticar/);
  });

  it("rejects tampering without exposing the value", () => {
    const encrypted = sealSecret("do-not-leak", context, env);
    const tampered = `${encrypted.slice(0, -1)}${encrypted.endsWith("A") ? "B" : "A"}`;

    try {
      openSecret(tampered, context, env);
      throw new Error("expected decryption to fail");
    } catch (error) {
      expect(String(error)).not.toContain("do-not-leak");
      expect(error).toMatchObject({ code: "credential_decryption_failed" });
    }
  });

  it("fails closed when the active key is missing or malformed", () => {
    expect(credentialEncryptionConfigured({} as NodeJS.ProcessEnv)).toBe(false);
    expect(credentialEncryptionConfigured({ CREDENTIAL_ENCRYPTION_KEY: "short" } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(() => sealSecret("secret", context, {} as NodeJS.ProcessEnv))
      .toThrowError(expect.objectContaining({ code: "credential_encryption_not_configured" }));
    expect(() => sealSecret("secret", context, { CREDENTIAL_ENCRYPTION_KEY: "short" } as unknown as NodeJS.ProcessEnv))
      .toThrowError(expect.objectContaining({ code: "credential_encryption_key_invalid" }));
  });

  it("marks historical plaintext for an immediate encrypted rewrite", () => {
    expect(openSecret("historical-plaintext", context, env)).toEqual({
      value: "historical-plaintext",
      needsRewrite: true,
    });
  });

  it("reads an old key only when supplied and marks it for rotation", () => {
    const encryptedWithOldKey = sealSecret(
      "rotating-secret",
      context,
      { CREDENTIAL_ENCRYPTION_KEY: oldKey } as unknown as NodeJS.ProcessEnv,
    );

    expect(() => openSecret(encryptedWithOldKey, context, env))
      .toThrowError(expect.objectContaining({ code: "credential_encryption_key_unavailable" }));
    expect(openSecret(encryptedWithOldKey, context, {
      CREDENTIAL_ENCRYPTION_KEY: key,
      CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS: oldKey,
    } as unknown as NodeJS.ProcessEnv)).toEqual({ value: "rotating-secret", needsRewrite: true });
  });
});
