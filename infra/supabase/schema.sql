create extension if not exists "pgcrypto";

do $$ begin
  create type user_plan as enum ('free', 'pro', 'creator');
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_status as enum ('queued', 'generating', 'succeeded', 'failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type song_mode as enum ('instrumental', 'vocal');
exception when duplicate_object then null; end $$;

do $$ begin
  create type song_visibility as enum ('private', 'public');
exception when duplicate_object then null; end $$;

do $$ begin
  create type point_status as enum ('available', 'pending', 'reserved', 'void');
exception when duplicate_object then null; end $$;

do $$ begin
  create type withdrawal_status as enum ('pending_review', 'approved', 'rejected', 'paid');
exception when duplicate_object then null; end $$;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  password_hash text,
  display_name text not null default 'Creator',
  avatar_url text,
  plan user_plan not null default 'free',
  plan_expires_at timestamptz,
  risk_status text not null default 'clear',
  points_balance integer not null default 0 check (points_balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table users add column if not exists password_hash text;

create table if not exists app_settings (
  key text primary key,
  value text not null,
  description text,
  updated_at timestamptz not null default now()
);

insert into app_settings (key, value, description)
values
  ('points_per_usdc', '10', 'Melody Points required for 1 USDC'),
  ('min_withdrawal_points', '10', 'Minimum points allowed for one USDC withdrawal request'),
  ('publish_reward_points', '25', 'Points awarded when a song is first published')
on conflict (key) do nothing;

create table if not exists user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  session_fingerprint text not null,
  session_type text not null default 'app',
  platform text,
  user_agent text,
  ip_address text,
  request_count integer not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, session_fingerprint)
);

create table if not exists music_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  status task_status not null default 'queued',
  title text,
  prompt text not null,
  style text not null,
  mood text not null,
  lyrics text,
  mode song_mode not null,
  lyrics_optimizer boolean not null default true,
  minimax_model text not null,
  minimax_trace_id text,
  minimax_request_id text,
  minimax_status_code integer,
  estimated_cost_cents integer not null default 0,
  error_code text,
  error_message text,
  quota_refunded boolean not null default false,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists songs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid unique references music_tasks(id) on delete set null,
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  theme text not null,
  style text not null,
  mood text not null,
  lyrics text,
  audio_url text not null,
  audio_storage_key text not null,
  cover_url text,
  cover_storage_key text,
  duration_seconds integer,
  mode song_mode not null,
  visibility song_visibility not null default 'private',
  is_submitted_to_challenge boolean not null default false,
  likes_count integer not null default 0,
  favorites_count integer not null default 0,
  view_count integer not null default 0,
  play_count integer not null default 0,
  comments_count integer not null default 0,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table songs add column if not exists view_count integer not null default 0;
alter table songs add column if not exists play_count integer not null default 0;

create table if not exists mv_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  song_id uuid not null references songs(id) on delete cascade,
  status task_status not null default 'queued',
  prompt text not null,
  image_count integer not null default 0 check (image_count >= 0),
  image_names jsonb not null default '[]'::jsonb,
  video_url text,
  video_storage_key text,
  minimax_model text not null,
  minimax_task_id text,
  minimax_file_id text,
  minimax_status_code integer,
  estimated_cost_cents integer not null default 0,
  error_code text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table mv_tasks add column if not exists image_names jsonb not null default '[]'::jsonb;
alter table mv_tasks add column if not exists video_storage_key text;
alter table mv_tasks add column if not exists minimax_task_id text;
alter table mv_tasks add column if not exists minimax_file_id text;

create table if not exists likes (
  user_id uuid not null references users(id) on delete cascade,
  song_id uuid not null references songs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, song_id)
);

create table if not exists favorites (
  user_id uuid not null references users(id) on delete cascade,
  song_id uuid not null references songs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, song_id)
);

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  song_id uuid not null references songs(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  likes_count integer not null default 0,
  created_at timestamptz not null default now()
);

alter table comments add column if not exists likes_count integer not null default 0;

create table if not exists comment_likes (
  user_id uuid not null references users(id) on delete cascade,
  comment_id uuid not null references comments(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, comment_id)
);

create table if not exists song_view_events (
  user_id uuid not null references users(id) on delete cascade,
  song_id uuid not null references songs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, song_id)
);

create table if not exists song_play_events (
  user_id uuid not null references users(id) on delete cascade,
  song_id uuid not null references songs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, song_id)
);

create table if not exists follows (
  follower_id uuid not null references users(id) on delete cascade,
  following_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create table if not exists challenges (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  theme text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  min_plan user_plan not null default 'creator',
  reward_points integer not null default 1000,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists challenge_submissions (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenges(id) on delete cascade,
  song_id uuid not null references songs(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  rank integer,
  score integer not null default 0,
  status text not null default 'submitted',
  created_at timestamptz not null default now(),
  unique (challenge_id, song_id),
  unique (challenge_id, user_id)
);

create table if not exists points_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  source text not null,
  source_id uuid,
  delta integer not null,
  balance_after integer not null,
  status point_status not null default 'available',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists reward_withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  amount_points integer not null check (amount_points > 0),
  usdc_amount numeric(12, 2) not null check (usdc_amount > 0),
  wallet_address text not null,
  status withdrawal_status not null default 'pending_review',
  risk_note text,
  reviewed_by text,
  reviewed_at timestamptz,
  paid_tx_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists iap_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  product_id text not null,
  plan user_plan not null,
  original_transaction_id text,
  transaction_id text not null unique,
  environment text not null,
  purchase_date timestamptz,
  expires_at timestamptz,
  revocation_date timestamptz,
  raw_signed_transaction text not null,
  status text not null default 'verified',
  created_at timestamptz not null default now()
);

create table if not exists minimax_api_logs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references music_tasks(id) on delete set null,
  mv_task_id uuid references mv_tasks(id) on delete set null,
  endpoint text not null,
  model text not null,
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb,
  status_code integer,
  estimated_cost_cents integer not null default 0,
  error_code text,
  error_message text,
  duration_ms integer,
  created_at timestamptz not null default now()
);

alter table minimax_api_logs add column if not exists mv_task_id uuid references mv_tasks(id) on delete set null;

create table if not exists admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor text not null,
  action text not null,
  target_type text not null,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_music_tasks_user_created on music_tasks(user_id, created_at desc);
create index if not exists idx_music_tasks_status on music_tasks(status, created_at desc);
create index if not exists idx_mv_tasks_user_created on mv_tasks(user_id, created_at desc);
create index if not exists idx_mv_tasks_song_created on mv_tasks(song_id, created_at desc);
create index if not exists idx_mv_tasks_status on mv_tasks(status, created_at desc);
create index if not exists idx_songs_public_created on songs(visibility, created_at desc);
create index if not exists idx_points_ledger_user_created on points_ledger(user_id, created_at desc);
create index if not exists idx_reward_withdrawals_status on reward_withdrawals(status, created_at desc);
create index if not exists idx_challenges_active_window on challenges(is_active, starts_at, ends_at);
create index if not exists idx_comment_likes_comment on comment_likes(comment_id);
create index if not exists idx_song_view_events_song on song_view_events(song_id, created_at desc);
create index if not exists idx_song_play_events_song on song_play_events(song_id, created_at desc);
create index if not exists idx_follows_following on follows(following_id, created_at desc);
create index if not exists idx_user_sessions_last_seen on user_sessions(last_seen_at desc);
create index if not exists idx_user_sessions_user_last_seen on user_sessions(user_id, last_seen_at desc);

create or replace function touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists touch_users_updated_at on users;
create trigger touch_users_updated_at before update on users for each row execute function touch_updated_at();

drop trigger if exists touch_music_tasks_updated_at on music_tasks;
create trigger touch_music_tasks_updated_at before update on music_tasks for each row execute function touch_updated_at();

drop trigger if exists touch_songs_updated_at on songs;
create trigger touch_songs_updated_at before update on songs for each row execute function touch_updated_at();

drop trigger if exists touch_mv_tasks_updated_at on mv_tasks;
create trigger touch_mv_tasks_updated_at before update on mv_tasks for each row execute function touch_updated_at();

drop trigger if exists touch_reward_withdrawals_updated_at on reward_withdrawals;
create trigger touch_reward_withdrawals_updated_at before update on reward_withdrawals for each row execute function touch_updated_at();

insert into users (id, email, display_name, plan)
values ('11111111-1111-4111-8111-111111111111', 'demo@melody.ai', 'Demo Creator', 'creator')
on conflict (id) do nothing;

update users
set plan = 'creator',
    points_balance = greatest(points_balance, 1500)
where id = '11111111-1111-4111-8111-111111111111';

insert into challenges (id, title, theme, description, starts_at, ends_at, min_plan, reward_points)
values (
  '00000000-0000-0000-0000-000000000101',
  '每日灵感',
  '为正在醒来的城市写一首充满希望的歌',
  '使用每日主题创作原创歌曲。优质投稿通过审核后可获得积分奖励。',
  date_trunc('day', now()),
  date_trunc('day', now()) + interval '1 day',
  'creator',
  1000
)
on conflict (id) do update
set title = excluded.title,
    theme = excluded.theme,
    description = excluded.description,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    min_plan = excluded.min_plan,
    reward_points = excluded.reward_points,
    is_active = true;
