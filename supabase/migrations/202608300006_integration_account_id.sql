-- The column the publisher reads and the schema never had.
--
-- `social_integrations` was written with the public handle and the account name but not with the
-- account's own identifier. The identifier was declared on `social_tokens` instead, where it is
-- provenance for a credential rather than a target for a post -- and then both the route that
-- names the publishing page and the publisher itself went looking for it on the integration.
--
-- It failed as PGRST204, a column PostgREST could not find, and it failed only on write: every
-- read of this table falls back to an empty result rather than raising, so the settings screen
-- rendered perfectly against a table missing the column it depended on. That is the same silent
-- shape as the other faults recorded in docs/project-state.md, and the reason none of them were
-- visible until something tried to write.
--
-- Forward-only: adds one nullable column.

alter table public.social_integrations add column if not exists external_account_id text;

comment on column public.social_integrations.external_account_id is
  'The account posts are published to -- for LinkedIn, the numeric company page id from linkedin.com/company/<id>. Public, not a credential: it is visible in the URL of the page''s own admin dashboard.';
