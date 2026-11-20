-- GymOP Supabase persistence schema.
-- Run this migration in the Supabase SQL Editor or with the Supabase CLI.
-- The application currently uses a server-only service-role key. It bypasses RLS;
-- do not expose it to browsers and do not treat RLS as route-level authorization.

create extension if not exists pgcrypto;

create table if not exists public.gyms (
  id uuid primary key default gen_random_uuid(),
  normalized_name text not null unique,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.weekly_uploads (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  week_start_date date not null,
  upload jsonb not null,
  uploaded_at timestamptz not null default now(),
  unique (gym_id, week_start_date)
);

create index if not exists weekly_uploads_gym_week_idx
  on public.weekly_uploads (gym_id, week_start_date desc);

create table if not exists public.gym_settings (
  gym_id uuid primary key references public.gyms(id) on delete cascade,
  settings jsonb not null default
    '{"limits": {}, "placements": {}, "hasFloorPlan": false, "events": []}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.gyms enable row level security;
alter table public.weekly_uploads enable row level security;
alter table public.gym_settings enable row level security;

-- No anon/authenticated policies are intentionally created. Browser clients
-- cannot read or write these tables. The server-only service-role key bypasses
-- RLS, so API-route authorization is still required before production use.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('floor-plans', 'floor-plans', false, 10485760, array['image/png'])
on conflict (id) do update
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array['image/png'];

-- No storage.objects policies are created for anon/authenticated users.
-- Server-side service-role access is used by the current storage adapter.
