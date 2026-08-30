-- Where a channel's access token lives.
--
-- A correction to what the previous migration said. It claimed no credential would be stored,
-- and that was true only while nothing could publish: to post on behalf of an account, the token
-- has to persist somewhere between the moment a person authorises it and the moment a piece goes
-- out, and there is no version of that where it lives nowhere.
--
-- So it lives here, apart from everything else, under one rule: nothing that runs with a user's
-- session may read this table. Row level security is enabled and NO policy is created, which in
-- Postgres means every ordinary role is denied. Only the service role reaches it, and only the
-- server-side publisher uses the service role. A token in a table the product selects from on an
-- ordinary page is a token one careless join away from a log.
--
-- The table also stores no client secret. That belongs to the application rather than to an
-- organization, and it stays in the server's environment where it can be rotated without a
-- migration.
--
-- Forward-only: creates one table, alters nothing.

create table public.social_tokens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  platform text not null check (platform in ('instagram','facebook','tiktok','youtube_shorts','linkedin')),
  access_token text not null,
  refresh_token text,
  -- When the access token stops working. Null means the platform did not say, which is not the
  -- same as never: it is a reason to re-check rather than a reason to assume.
  expires_at timestamptz,
  -- What the platform actually granted, which is often less than what was asked for.
  scope text,
  /** The account this token acts as, for showing a person which account they connected. */
  external_account_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, platform)
);

alter table public.social_tokens enable row level security;

-- Deliberately no policy. See the note above: enabling RLS without one denies every role except
-- the service role, and that is the whole design rather than an omission. A future policy added
-- here would silently open it, so anything that seems to need one needs a different answer.

create trigger social_tokens_updated_at
  before update on public.social_tokens
  for each row execute function public.set_updated_at();
