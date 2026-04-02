create extension if not exists pgcrypto with schema extensions;

alter table public.user_profiles
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete cascade;

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
  on conflict (email) do update
  set
    auth_user_id = excluded.auth_user_id,
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
