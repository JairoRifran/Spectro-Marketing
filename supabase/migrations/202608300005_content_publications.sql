-- What was published, where, and by whom.
--
-- A publication is the only action in this product that leaves the building. Everything else can
-- be corrected quietly; this one is seen by people before anyone notices it was wrong. So it gets
-- a record of its own rather than a status on the piece: a status says where something is, and
-- what is needed here is what happened, when, under whose decision, and what the platform
-- answered.
--
-- The unique index is the point. Publishing is not idempotent at the vendor -- posting the same
-- text twice produces two posts on the page -- so the guarantee has to be ours, and it has to be
-- the database rather than a check in code. A check reads, decides, and writes, and two requests
-- that read before either writes both decide to publish.
--
-- Forward-only: creates one table, alters nothing.

create table public.content_publications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  -- The version that actually went out, which is not necessarily the current one by the time
  -- anybody looks.
  content_version integer not null,
  platform text not null check (platform in ('instagram','facebook','tiktok','youtube_shorts','linkedin')),
  status text not null default 'published' check (status in ('published','failed')),
  -- The platform's own identifier, which is the only way to find the post again.
  external_id text,
  external_url text,
  -- Who decided. 'user' when a person pressed publish, 'policy' when the organization chose to
  -- publish without one. Never blurred: the trail must not claim a person sent what no person saw.
  decided_by_type text not null check (decided_by_type in ('user','policy')),
  decided_by uuid references public.profiles(id),
  error text,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One successful publication per piece, version and platform. A failure may be retried, so only
-- successes are constrained.
create unique index content_publications_once
  on public.content_publications(content_item_id, content_version, platform)
  where status = 'published';

create index content_publications_org_idx on public.content_publications(organization_id, published_at desc);

alter table public.content_publications enable row level security;

create policy content_publications_read on public.content_publications
  for select using (public.is_org_member(organization_id));

-- Written only by the server-side publisher, through the service role. Nothing a browser can
-- reach may claim that something was published.
create trigger content_publications_updated_at
  before update on public.content_publications
  for each row execute function public.set_updated_at();
