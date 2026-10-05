-- Recode Hub database
-- Apply to the dedicated Recode Supabase project.

create extension if not exists pgcrypto;

create table if not exists public.recode_games (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  process_names text[] not null default '{}',
  steam_app_id text,
  gog_product_id text,
  epic_catalog_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recode_profiles (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.recode_games(id) on delete cascade,
  title text not null,
  description text not null default '',
  author_name text not null default 'community',
  profile jsonb not null,
  verified boolean not null default false,
  published boolean not null default false,
  source text not null default 'community',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recode_profiles_profile_schema
    check (
      jsonb_typeof(profile) = 'object'
      and profile->>'schema' = 'recode.trainer-profile'
      and profile->>'version' = '1'
    )
);

create table if not exists public.recode_submissions (
  id uuid primary key default gen_random_uuid(),
  game_name text not null,
  process_name text not null,
  requested_feature text,
  ai_provider text,
  profile jsonb not null,
  publish_consent boolean not null default false,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','published')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  published_profile_id uuid references public.recode_profiles(id) on delete set null,
  constraint recode_submissions_consent_required
    check (status = 'pending' or publish_consent = true),
  constraint recode_submissions_profile_schema
    check (
      jsonb_typeof(profile) = 'object'
      and profile->>'schema' = 'recode.trainer-profile'
      and profile->>'version' = '1'
    )
);

create index if not exists recode_games_process_names_gin
  on public.recode_games using gin (process_names);

create index if not exists recode_profiles_game_published_idx
  on public.recode_profiles (game_id, published, verified);

create index if not exists recode_submissions_status_idx
  on public.recode_submissions (status, submitted_at desc);

alter table public.recode_games enable row level security;
alter table public.recode_profiles enable row level security;
alter table public.recode_submissions enable row level security;

revoke all on public.recode_games from anon, authenticated;
revoke all on public.recode_profiles from anon, authenticated;
revoke all on public.recode_submissions from anon, authenticated;

grant select on public.recode_games to anon, authenticated;
grant select on public.recode_profiles to anon, authenticated;

create policy "public can read games"
  on public.recode_games
  for select
  to anon, authenticated
  using (true);

create policy "public can read published profiles"
  on public.recode_profiles
  for select
  to anon, authenticated
  using (published = true);

-- Submissions are intentionally not writable through the public Data API.
-- They should be created by a validated Edge Function or trusted backend only.
-- Never expose a service-role key in the Recode desktop client.
