-- ひびつみの通知（ほかのアプリと分けるため専用のスキーマ。API には公開せず、Edge Function から直接使う）
create schema if not exists hibitsumi;
revoke all on schema hibitsumi from public, anon, authenticated;

create table hibitsumi.config (
  id int primary key default 1 check (id = 1),
  vapid_public text not null,
  vapid_private text not null,
  created_at timestamptz not null default now()
);

create table hibitsumi.devices (
  device_id uuid primary key,
  secret_hash text not null,
  subscription jsonb not null,
  updated_at timestamptz not null default now()
);

create table hibitsumi.queue (
  id bigserial primary key,
  device_id uuid not null references hibitsumi.devices (device_id) on delete cascade,
  send_at timestamptz not null,
  title text not null,
  body text not null,
  tag text not null
);
create index queue_send_at_idx on hibitsumi.queue (send_at);
create index queue_device_idx on hibitsumi.queue (device_id);

alter table hibitsumi.config enable row level security;
alter table hibitsumi.devices enable row level security;
alter table hibitsumi.queue enable row level security;

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 5分ごとに、時刻が来た通知を送る
select cron.schedule(
  'hibitsumi-push-send',
  '*/5 * * * *',
  $$ select net.http_post(
       url := 'https://yhdhmynxjtczhyzhmauq.supabase.co/functions/v1/hibitsumi-push',
       headers := '{"Content-Type": "application/json"}'::jsonb,
       body := '{"action": "send"}'::jsonb
     ) $$
);

-- 送信（action: send）を pg_cron からだけ呼べるように、合い言葉を置く（値は DB の中だけで作り、外に出さない）
alter table hibitsumi.config add column if not exists cron_key text not null default encode(extensions.gen_random_bytes(24), 'hex');
create index if not exists devices_endpoint_idx on hibitsumi.devices ((subscription->>'endpoint'));

-- 5分ごとの送信に、合い言葉を付ける（実行のたびに表から読む）。同じ名前で登録し直すと置き換わる
select cron.schedule(
  'hibitsumi-push-send',
  '*/5 * * * *',
  $$ select net.http_post(
       url := 'https://yhdhmynxjtczhyzhmauq.supabase.co/functions/v1/hibitsumi-push',
       headers := '{"Content-Type": "application/json"}'::jsonb,
       body := jsonb_build_object('action', 'send', 'key', (select cron_key from hibitsumi.config where id = 1))
     ) $$
);
