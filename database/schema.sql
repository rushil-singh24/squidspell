-- SquidSpell — Phase 8 (Auth & Persistence via Supabase)
--
-- Run this ONCE in the Supabase SQL editor for the project.
-- The whole script is idempotent: every statement is `if not exists`,
-- `drop policy ... / create policy`, or an insert guarded by `where not
-- exists`, so re-running it is safe and non-destructive.
--
-- The frontend talks to Supabase directly (the FastAPI backend is not
-- involved). Per-user isolation is enforced entirely by Row-Level Security
-- (`auth.uid() = user_id`), not by application code.
--
-- NOTE: `create table if not exists` only creates a table that is absent; it
-- does NOT apply later column/constraint changes to an existing table. Schema
-- changes after the first run need a hand-written migration.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  start_time timestamptz not null default now(),
  end_time   timestamptz
);

create table if not exists public.translations (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid references public.sessions on delete cascade,
  user_id    uuid not null references auth.users on delete cascade,
  sentence   text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.race_results (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  duration_s  int not null,
  spm         real not null,
  accuracy    real,
  consistency real,
  created_at  timestamptz not null default now()
);

create table if not exists public.models (
  id              uuid primary key default gen_random_uuid(),
  version         text not null,
  kind            text not null,
  algorithm       text not null,
  feature_set     text,
  hyperparameters jsonb,
  accuracy        real,
  precision       real,
  recall          real,
  f1              real,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------

alter table public.sessions     enable row level security;
alter table public.translations enable row level security;
alter table public.race_results enable row level security;
alter table public.models       enable row level security;

-- sessions / translations / race_results: a row is readable and writable
-- only by the user that owns it.
drop policy if exists "sessions_owner_all" on public.sessions;
create policy "sessions_owner_all" on public.sessions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "translations_owner_all" on public.translations;
create policy "translations_owner_all" on public.translations
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "race_results_owner_all" on public.race_results;
create policy "race_results_owner_all" on public.race_results
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- models: public read-only catalogue. Everyone (including anon) may SELECT.
-- There is deliberately NO insert/update/delete policy, so with RLS enabled
-- the client can never write to this table — it is seeded only by this script.
drop policy if exists "models_public_read" on public.models;
create policy "models_public_read" on public.models
  for select
  using (true);

-- ---------------------------------------------------------------------------
-- Table privileges
--
-- Explicit so the script is self-contained rather than relying on Supabase's
-- default-privilege configuration. Grants are idempotent (safe to re-run).
-- RLS still applies on top of these grants.
-- ---------------------------------------------------------------------------

grant select on public.models to anon, authenticated;
grant select, insert, update, delete on public.sessions to authenticated;
grant select, insert, update, delete on public.translations to authenticated;
grant select, insert, update, delete on public.race_results to authenticated;

-- ---------------------------------------------------------------------------
-- Seed: Phase 2 winning models (see DECISIONS.md [Phase 2] / ml/results/)
--
-- static: random forest on the 40-float engineered features
--         (ml/features_static.py). Test accuracy 0.994, CV accuracy 0.994.
--
-- motion: random forest on the 49-float motion-trajectory features
--         (ml/features_motion.py). Test accuracy 0.893.
--         Per-class recall: J = 0.889, Z = 1.000, negative = 0.778.
--         CAVEAT: the negative-class recall (0.778) is computed on only
--         ~9 test takes (20% of 43), so it is noisy. It is the metric to
--         watch: if J/Z false-trigger on ordinary hand movement in live
--         testing, the fix is more negative takes + retraining, not
--         threshold tuning in the inference loop.
-- ---------------------------------------------------------------------------

insert into public.models (version, kind, algorithm, feature_set, accuracy)
select '2026-08-19', 'static', 'random_forest', 'engineered', 0.994
where not exists (
  select 1 from public.models where version = '2026-08-19' and kind = 'static'
);

insert into public.models (version, kind, algorithm, feature_set, accuracy)
select '2026-08-19', 'motion', 'random_forest', null, 0.893
where not exists (
  select 1 from public.models where version = '2026-08-19' and kind = 'motion'
);
