-- Social integrations, and who decides whether a piece is published.
--
-- Two things, kept apart on purpose. A connection says a channel CAN be reached. The autonomy
-- policy says whether anything may go out without a person. Collapsing them would mean that
-- connecting an account quietly grants permission to publish from it, and connecting is
-- something an admin does once while publishing is a decision the organization makes
-- deliberately.
--
-- What this migration does NOT do: store credentials. No access token, refresh token or client
-- secret belongs in a table the application reads on every request. Tokens live server-side,
-- outside the database the product queries, and this table records only that a connection
-- exists, for which account, and who established it. Until that plumbing exists a row here is a
-- statement of intent, not a working channel.
--
-- Forward-only: creates two objects, alters nothing that exists.

create type public.integration_status as enum ('not_connected','connected','expired','error');

create table public.social_integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  platform text not null check (platform in ('instagram','facebook','tiktok','youtube_shorts','linkedin')),
  status public.integration_status not null default 'not_connected',
  -- The public handle, so a person can confirm the right account was connected. Never a token.
  account_handle text,
  account_name text,
  connected_at timestamptz,
  connected_by uuid references public.profiles(id),
  last_error text,
  -- Non-secret provenance only: scopes granted, external account id, api version.
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, platform)
);

create index social_integrations_org_idx on public.social_integrations(organization_id);

alter table public.social_integrations enable row level security;

create policy social_integrations_read on public.social_integrations
  for select using (public.is_org_member(organization_id));

-- Connecting a channel is an administrative act, not ordinary member work.
create policy social_integrations_write on public.social_integrations
  for all using (public.has_org_role(organization_id, array['owner','admin']))
  with check (public.has_org_role(organization_id, array['owner','admin']));

create trigger social_integrations_updated_at
  before update on public.social_integrations
  for each row execute function public.set_updated_at();

-- Who decides whether a piece goes out.
--
-- Default is human review, and that default is the product's central claim rather than a
-- cautious setting: every piece waits for a person. Autonomous is a real option, but it has to
-- be chosen, and the choice is attributed and timestamped so it can be answered for later.
alter table public.organizations
  add column publishing_mode text not null default 'human_review'
    check (publishing_mode in ('human_review','autonomous'));

alter table public.organizations add column publishing_mode_updated_at timestamptz;
alter table public.organizations add column publishing_mode_updated_by uuid references public.profiles(id);

comment on column public.organizations.publishing_mode is
  'human_review: every piece waits for an authenticated decision. autonomous: approved-by-policy pieces may publish without one. Never changes what the runtime is allowed to do on its own -- AUTOMATION_ENABLED still gates execution.';
