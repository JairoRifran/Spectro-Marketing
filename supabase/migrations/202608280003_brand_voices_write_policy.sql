-- Corrective: brand_voices could be read but never written.
--
-- The table shipped with a select policy and nothing else, on the assumption that writes would
-- go through the service role the way spending does. They do not: choosing which voices a brand
-- uses is ordinary configuration done by a person in their own session, so the request carries
-- the user's client and row level security refused every insert.
--
-- The failure was silent in the worst way. The screen reported that no voices were loaded, which
-- is exactly what an empty table looks like, so the refusal was indistinguishable from having
-- never pressed the button.
--
-- content_assets deliberately keeps read-only client access. Those rows are written by the
-- server when it produces a file, never by a browser, so a write policy there would widen the
-- surface for nothing.
--
-- This file is intentionally 100% ASCII so no clipboard or codepage can corrupt it in transit.

create policy brand_voices_insert on public.brand_voices
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner','admin','member']::public.organization_role[]));

create policy brand_voices_update on public.brand_voices
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner','admin','member']::public.organization_role[]))
  with check (public.has_org_role(organization_id, array['owner','admin','member']::public.organization_role[]));

create policy brand_voices_delete on public.brand_voices
  for delete to authenticated
  using (public.has_org_role(organization_id, array['owner','admin','member']::public.organization_role[]));
