-- Create notifications table
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.user_profiles(id) on delete cascade,
  actor_id uuid references public.user_profiles(id),
  type text not null, -- 'new_join', 'achievement', 'streak', 'system'
  title text not null,
  body text not null,
  data jsonb default '{}'::jsonb,
  read boolean default false,
  created_at timestamptz not null default now()
);

-- Store push subscriptions for devices
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  subscription jsonb not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, subscription)
);

-- Indexing for fast lookups
create index if not exists notifications_user_id_idx on public.notifications(user_id, created_at desc);
create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions(user_id);
