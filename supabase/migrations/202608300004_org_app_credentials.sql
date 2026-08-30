-- An organization bringing its own developer app.
--
-- The normal path does not need this. A client id and secret identify the *application* to the
-- platform, not the customer, so one reviewed app serves every organization and each one connects
-- through it with a single click. Asking a marketing lead to register a developer app and paste a
-- client secret is asking them to do the platform's job.
--
-- But there are two real reasons an organization would want its own: it already has an approved
-- app and would rather not depend on ours, or ours has not been approved yet and they do not want
-- to wait. So the credentials are optional and per organization, and the resolver prefers them
-- when present and falls back to the platform's own.
--
-- They live under the same rule as tokens: row level security enabled, no policy, service role
-- only. A client secret is a credential like any other, and the fact that a customer typed it
-- into a form rather than an operator setting an environment variable changes nothing about how
-- it has to be kept. Nothing ever reads it back to a browser -- the screen is told whether one
-- exists, never what it is.
--
-- Forward-only: creates one table, alters nothing.

create table public.social_app_credentials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  platform text not null check (platform in ('instagram','facebook','tiktok','youtube_shorts','linkedin')),
  client_id text not null,
  client_secret text not null,
  -- Who put it there, so a credential that stops working has someone to ask.
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, platform)
);

alter table public.social_app_credentials enable row level security;

-- Deliberately no policy: see social_tokens. Enabling RLS without one denies every role but the
-- service role, and that is the design. A policy added here would silently make a client secret
-- readable by whoever can read the organization.

create trigger social_app_credentials_updated_at
  before update on public.social_app_credentials
  for each row execute function public.set_updated_at();
