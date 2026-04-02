create extension if not exists pgcrypto with schema extensions;

create table if not exists public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text not null,
  team text not null,
  role text,
  greythr_user_id text unique,
  greythr_username text not null,
  encrypted_greythr_password bytea not null,
  leaderboard_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attendance_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  attendance_date date not null,
  swipe_times timestamptz[] not null,
  sync_source text not null default 'greythr_mobile_api',
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, attendance_date)
);

create index if not exists attendance_logs_user_date_idx
  on public.attendance_logs (user_id, attendance_date desc);

create or replace view public.attendance_daily_summary as
select
  user_id,
  attendance_date,
  swipe_times,
  case
    when cardinality(swipe_times) = 0 then null
    else swipe_times[1]
  end as first_swipe_at,
  case
    when cardinality(swipe_times) < 2 then null
    else swipe_times[cardinality(swipe_times)]
  end as last_swipe_at,
  case
    when cardinality(swipe_times) < 2 then null
    else round(extract(epoch from (
      swipe_times[cardinality(swipe_times)] - swipe_times[1]
    )) / 60.0)::int
  end as worked_minutes
from public.attendance_logs;

comment on view public.attendance_daily_summary is
  'Daily attendance aggregate backing the "When Can I Leave?" tracker and the monthly hour bank.';

create or replace function public.decrypt_greythr_password(
  p_user_id uuid,
  p_encryption_key text
)
returns text
language sql
security definer
set search_path = public, extensions
as $$
  select extensions.pgp_sym_decrypt(encrypted_greythr_password, p_encryption_key)::text
  from public.user_profiles
  where id = p_user_id
$$;

comment on function public.decrypt_greythr_password(uuid, text) is
  'Decrypts the stored greytHR password for a single profile when invoked by trusted server code.';

create or replace function public.upsert_user_profile_credentials(
  p_auth_user_id uuid,
  p_email text,
  p_full_name text,
  p_team text,
  p_role text,
  p_greythr_user_id text,
  p_greythr_username text,
  p_greythr_password text,
  p_encryption_key text,
  p_leaderboard_opt_in boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  saved_profile_id uuid;
begin
  insert into public.user_profiles (
    auth_user_id,
    email,
    full_name,
    team,
    role,
    greythr_user_id,
    greythr_username,
    encrypted_greythr_password,
    leaderboard_opt_in,
    updated_at
  )
  values (
    p_auth_user_id,
    p_email,
    p_full_name,
    p_team,
    p_role,
    p_greythr_user_id,
    p_greythr_username,
    extensions.pgp_sym_encrypt(p_greythr_password, p_encryption_key),
    p_leaderboard_opt_in,
    now()
  )
  on conflict (auth_user_id) do update
  set
    email = excluded.email,
    full_name = excluded.full_name,
    team = excluded.team,
    role = excluded.role,
    greythr_user_id = excluded.greythr_user_id,
    greythr_username = excluded.greythr_username,
    encrypted_greythr_password = excluded.encrypted_greythr_password,
    leaderboard_opt_in = excluded.leaderboard_opt_in,
    updated_at = now()
  returning id into saved_profile_id;

  return saved_profile_id;
end;
$$;
