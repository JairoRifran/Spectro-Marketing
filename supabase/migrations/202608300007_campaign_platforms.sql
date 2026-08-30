-- Which channels a campaign is allowed to consider.
--
-- Until now the only objective a campaign could use was whatever was typed during onboarding, and
-- the channels were entirely the strategist's call. The first is a gap -- a business does not have
-- one objective forever. The second is a real decision that belongs to the person: an organization
-- may have no presence on TikTok, or may have decided not to be there, and a strategist arguing
-- for it is arguing about something already settled.
--
-- This constrains rather than replaces. Empty means no restriction, which is the current behaviour
-- and stays the default. With a list, the strategist still decides priority, role and weight among
-- those channels, and may still argue for disabling one -- what it cannot do is propose a channel
-- the organization ruled out.
--
-- Forward-only: adds one column with a default that preserves today's behaviour.

alter table public.campaigns
  add column if not exists preferred_platforms text[] not null default '{}';

comment on column public.campaigns.preferred_platforms is
  'Channels the person allowed this campaign to consider. Empty means no restriction. Constrains the channel strategy rather than replacing it: the strategist still decides priority and role within the allowed set.';
