# Security

- Organization data uses `organization_id`, indexed paths, and RLS membership policies.
- Organization creation atomically creates the owner membership.
- User clients use anon credentials and SSR cookies; service role is server-only.
- Internal dispatch uses a long secret and timing-safe comparison.
- Zod validates HTTP inputs; public errors are sanitized.
- Activity is append-only to organization users and contains no secrets.
- Brand assets use a private organization-prefixed bucket.
- Demo mode is explicit and separate from live data.

Before production, rotate keys, configure MFA/leaked-password protection as appropriate, restrict Vercel environment access, and run RLS tests on staging.
