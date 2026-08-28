-- Brand voices and the asset store.
--
-- Two things that turned out to be the same migration. Choosing a voice and keeping the audio
-- that voice produced are both organization-owned, both belong to the brand rather than to a
-- deployment, and neither can exist usefully without the other.
--
-- Why not environment variables for the voices: a variable is per deployment, so every
-- organization on the installation would share one set of voices. That is fine with one tenant
-- and wrong the moment there are two, and this is a multi-tenant system by design.
--
-- This file is intentionally 100% ASCII so no clipboard or codepage can corrupt it in transit.

-- The voices an organization actually has, described the way somebody asks for one. The
-- provider's own identifier is stored but never shown when choosing.
create table public.brand_voices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  provider text not null,
  provider_voice_id text not null,
  region text not null check (region in ('rioplatense', 'mexicana', 'castellana', 'colombiana', 'neutra')),
  gender text not null default 'indistinta' check (gender in ('femenina', 'masculina', 'indistinta')),
  -- The operator's own name for it, for the interface.
  label text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The same vendor voice must not be registered twice for one organization: two rows would make
-- "the voice for this region" ambiguous in a way nothing downstream could resolve.
create unique index brand_voices_unique_idx
  on public.brand_voices (organization_id, provider, provider_voice_id);
create index brand_voices_lookup_idx on public.brand_voices (organization_id, region, gender);

-- How this brand wants to be read by default. Nullable throughout: a brand that has not chosen
-- has not chosen, and guessing a tone would be inventing an editorial decision.
alter table public.brands add column if not exists voice_tone text
  check (voice_tone is null or voice_tone in ('reflexiva', 'entusiasta', 'comercial', 'cercana', 'autoritaria', 'informativa'));
alter table public.brands add column if not exists voice_region text
  check (voice_region is null or voice_region in ('rioplatense', 'mexicana', 'castellana', 'colombiana', 'neutra'));
alter table public.brands add column if not exists voice_gender text
  check (voice_gender is null or voice_gender in ('femenina', 'masculina', 'indistinta'));

-- Files produced for a piece: rendered frames, synthesised audio, and whatever comes later.
create table public.content_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  -- An asset belongs to one version of a piece. Asking for a revision must not leave the old
  -- version's files attached to the new one.
  content_version integer not null check (content_version >= 1),
  kind text not null check (kind in ('image', 'audio', 'video')),
  -- Stable within a version, so re-rendering replaces rather than accumulates: 'slide-0',
  -- 'cover', 'voiceover'.
  slot text not null,
  storage_path text not null,
  mime_type text not null,
  byte_size bigint not null check (byte_size > 0),
  duration_seconds numeric check (duration_seconds is null or duration_seconds > 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  -- 'mock' or a real provider, so generated output can never be mistaken for the real thing.
  generated_by text not null default 'mock',
  provider text,
  -- What it cost, linked to the ledger row that authorised it. Null for anything free.
  spend_ledger_id uuid references public.spend_ledger(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index content_assets_slot_idx
  on public.content_assets (content_item_id, content_version, slot);
create index content_assets_org_idx on public.content_assets (organization_id, content_item_id);

create trigger brand_voices_set_updated_at before update on public.brand_voices
  for each row execute function public.set_updated_at();
create trigger content_assets_set_updated_at before update on public.content_assets
  for each row execute function public.set_updated_at();

-- One trigger per foreign key, each told the column and the table it guards. Called with no
-- arguments the guard reads a null reference and waves every row through.
create trigger brand_voices_brand_org before insert or update of brand_id, organization_id
  on public.brand_voices for each row
  execute function public.enforce_same_organization_reference('brand_id', 'brands');

create trigger content_assets_campaign_org before insert or update of campaign_id, organization_id
  on public.content_assets for each row
  execute function public.enforce_same_organization_reference('campaign_id', 'campaigns');
create trigger content_assets_item_org before insert or update of content_item_id, organization_id
  on public.content_assets for each row
  execute function public.enforce_same_organization_reference('content_item_id', 'content_items');
create trigger content_assets_ledger_org before insert or update of spend_ledger_id, organization_id
  on public.content_assets for each row
  execute function public.enforce_same_organization_reference('spend_ledger_id', 'spend_ledger');

alter table public.brand_voices enable row level security;
alter table public.content_assets enable row level security;

create policy brand_voices_read on public.brand_voices
  for select using (public.is_org_member(organization_id));
create policy content_assets_read on public.content_assets
  for select using (public.is_org_member(organization_id));

-- A private bucket. Nothing here is public: an unlisted URL is not access control, and these are
-- unpublished drafts of a brand's work.
insert into storage.buckets (id, name, public)
values ('content-assets', 'content-assets', false)
on conflict (id) do nothing;

-- Storage is addressed by path, so membership is derived from the first path segment being the
-- organization id. Writes go through the service role, never straight from a browser.
create policy content_assets_object_read on storage.objects
  for select to authenticated using (
    bucket_id = 'content-assets'
    and public.is_org_member((storage.foldername(name))[1]::uuid)
  );
