-- Two gates, decided separately.
--
-- The first asks whether a person reads each piece before it is considered finished. The second
-- asks whether anything may leave for a real audience unattended. They were one setting, and
-- that was wrong: the cost of a mistake on either side of them is not remotely the same.
--
-- A piece approved by policy and never published is a draft nobody read. A piece published
-- without a person is under the organization's own name, in front of its audience, and does not
-- come back. So they move independently, and the second one keeps its own default.
--
-- Forward-only: adds one column with a safe default, alters nothing that exists.

alter table public.organizations
  add column content_approval_mode text not null default 'human'
    check (content_approval_mode in ('human','automatic'));

alter table public.organizations add column content_approval_mode_updated_at timestamptz;
alter table public.organizations add column content_approval_mode_updated_by uuid references public.profiles(id);

comment on column public.organizations.content_approval_mode is
  'human: every piece waits for an authenticated decision before it is finished. automatic: a piece that passes the deterministic quality gate is approved by policy, recorded as approved by policy and never as approved by a person. Says nothing about publishing -- see publishing_mode.';
