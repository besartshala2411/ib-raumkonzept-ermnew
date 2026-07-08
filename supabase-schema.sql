-- ERM IB Raumkonzept: Supabase Setup
-- Dieses Skript ist identisch mit dem Code, der in der App unter
-- Einstellungen -> Cloud Sync zum Kopieren angezeigt wird.
create extension if not exists pgcrypto;

create table if not exists erm_access (
  id int primary key default 1,
  code_hash text not null
);

create table if not exists erm_data (
  id int primary key default 1,
  org_id text not null default 'ib_raumkonzept',
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into erm_data (id, org_id, payload) values (1, 'ib_raumkonzept', '{}'::jsonb)
  on conflict (id) do nothing;

create table if not exists push_subscriptions (
  endpoint text primary key,
  p256dh text not null,
  auth text not null,
  org_id text not null default 'ib_raumkonzept',
  created_at timestamptz not null default now()
);

create or replace function erm_check_token(token text)
returns boolean language sql security definer as $$
  select exists(
    select 1 from erm_access
    where id = 1 and code_hash = encode(digest(coalesce(token,''), 'sha256'), 'hex')
  );
$$;

alter table erm_data enable row level security;
alter table push_subscriptions enable row level security;

create policy "erm_data_access" on erm_data for all
  using ( erm_check_token(current_setting('request.headers', true)::json->>'x-erm-token') )
  with check ( erm_check_token(current_setting('request.headers', true)::json->>'x-erm-token') );

create policy "push_subscriptions_access" on push_subscriptions for all
  using ( erm_check_token(current_setting('request.headers', true)::json->>'x-erm-token') )
  with check ( erm_check_token(current_setting('request.headers', true)::json->>'x-erm-token') );

alter publication supabase_realtime add table erm_data;

-- Freigabe-Code setzen/ändern (ERSETZEN Sie 'IhrFreigabeCode123' und führen Sie dies erneut aus, um ihn zu ändern):
insert into erm_access (id, code_hash) values (1, encode(digest('IhrFreigabeCode123', 'sha256'), 'hex'))
  on conflict (id) do update set code_hash = excluded.code_hash;
