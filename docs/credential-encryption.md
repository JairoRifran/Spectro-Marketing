# Credential encryption

Spectro encrypts organization app secrets and social access/refresh tokens in the application
before they reach Supabase. Row-level security remains enabled with no user policy; encryption is
an additional boundary, not a replacement for access control.

## Format and scope

- Algorithm: AES-256-GCM with a fresh 96-bit nonce for every value.
- Authentication context: organization id, platform, field name, and envelope version.
- Encrypted fields: `social_app_credentials.client_secret`,
  `social_tokens.access_token`, and `social_tokens.refresh_token`.
- Deliberately plaintext: client ids, account ids, expiry, and granted scopes. They are identifiers
  or operational metadata, not bearer credentials.
- The envelope contains a version and a truncated SHA-256 key identifier. It contains no key
  material.

## Initial production rollout

1. Generate a key locally with `openssl rand -base64 32` or an equivalent cryptographically secure
   generator. Do not paste the result into source control, SQL, logs, tickets, or chat.
2. Set `CREDENTIAL_ENCRYPTION_KEY` as a server-only secret in every environment that can store or
   use real integration credentials.
3. Deploy the code only after the key is present. `/api/health` reports
   `credentialEncryption: true` when the configured key is valid; it never reports the key id.
4. Open the integration settings once for each organization that owns a developer-app secret.
   Reading that credential rewrites any historical plaintext value before it is used.
5. The first token use similarly rewrites historical access and refresh tokens before publishing.
   Reconnecting a channel writes encrypted values immediately.

Until steps 4 and 5 have been exercised against production data, do not claim that every
historical row has been migrated. New writes cannot fall back to plaintext: a missing or invalid
key makes the operation fail closed.

## Rotation

1. Keep the current key in `CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS`.
2. Generate a new key and make it `CREDENTIAL_ENCRYPTION_KEY`.
3. Deploy. Values read with an old key are authenticated and rewritten with the active key before
   they are returned to the integration.
4. Exercise each connected organization and confirm the relevant flows.
5. Remove the old key only after no envelope references it. Removing it early makes those values
   unreadable by design; restore it under `CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS` to recover.

Keys must be rotated by changing environment configuration, never by a database migration. A
database migration containing the key would collapse the separation this feature creates.
