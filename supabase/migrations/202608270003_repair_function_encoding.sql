-- Corrective, forward-only migration.
-- 202608270001 first reached production through a transfer that read the UTF-8 file with
-- the system ANSI codepage, so the accented literals inside complete_onboarding were
-- stored double-encoded and every future organization would be provisioned with mangled
-- agent names. 202608270002 repaired the rows already written; this repairs the stored
-- function definition itself.
--
-- The repair reads the installed definition, reverses the double encoding, and reinstalls
-- it. Deliberately written in pure ASCII: it carries no accented character of its own, so
-- no clipboard or codepage can corrupt it in transit. Running it twice is a no-op, because
-- the guard only fires while a mojibake marker is still present.

do $repair$
declare definition text;
begin
  select pg_get_functiondef(p.oid) into definition
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'complete_onboarding';

  if definition is null then
    raise notice 'complete_onboarding is not installed; nothing to repair';
    return;
  end if;

  -- chr(195) is the leading byte every double-encoded accent starts with.
  if strpos(definition, chr(195)) = 0 then
    raise notice 'complete_onboarding is already stored correctly';
    return;
  end if;

  execute convert_from(convert_to(definition, 'LATIN1'), 'UTF8');
  raise notice 'complete_onboarding definition repaired';
end
$repair$;
