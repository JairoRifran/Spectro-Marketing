-- What each run actually cost.
--
-- Nothing recorded this. Not on `agent_runs`, not on `task_runs`, nowhere -- so the only honest
-- answer to "what does a campaign cost" was an estimate, and estimates are what sent two stages
-- to be tuned in the wrong direction already. A campaign that fails six times on one stage and a
-- campaign that completes cleanly looked identical from here.
--
-- Tokens are the fact, so tokens are what is stored. Cost is derived from them at write time and
-- kept alongside, because prices change and a row that only holds dollars cannot be recomputed
-- later, while a row that holds both can be checked.
--
-- Cached input is counted separately on purpose: it is the whole point of the caching work, and a
-- read served from cache is billed at about a tenth of a fresh one. Without its own column the
-- saving is invisible -- cached and uncached tokens would add up to the same number.
--
-- Forward-only: adds nullable columns with defaults that preserve every existing row.

alter table public.agent_runs
  add column if not exists input_tokens integer not null default 0,
  add column if not exists output_tokens integer not null default 0,
  add column if not exists cache_read_tokens integer not null default 0,
  add column if not exists cache_write_tokens integer not null default 0,
  add column if not exists cost_usd numeric(12,6) not null default 0;

comment on column public.agent_runs.input_tokens is
  'Uncached prompt tokens billed at the model full input rate.';
comment on column public.agent_runs.cache_read_tokens is
  'Prompt tokens served from cache, billed at roughly a tenth of the input rate. Kept apart from input_tokens so the effect of caching stays visible.';
comment on column public.agent_runs.cache_write_tokens is
  'Prompt tokens written to cache, billed at roughly 1.25x the input rate. A write that is never read is a small loss, which is why it is measured rather than assumed.';
comment on column public.agent_runs.cost_usd is
  'Derived from the token columns at write time using the price of the model that answered. Recomputable from those columns if prices change; zero for local and deterministic providers.';

-- Reading cost by campaign means joining runs to their task, which is how every question about
-- this data starts: what did this campaign cost, and which stage spent it.
create index if not exists agent_runs_task_cost_idx
  on public.agent_runs (task_id)
  where cost_usd > 0;
