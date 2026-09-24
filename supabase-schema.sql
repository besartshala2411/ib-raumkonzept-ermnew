-- ERM IB Raumkonzept: Umstieg auf echte Nutzerkonten
-- Dieses Skript ist identisch mit dem Code, der in der App unter
-- Einstellungen -> Cloud Sync zum Kopieren angezeigt wird.

-- ============================================================
-- TEIL 1 — Jetzt ausführen. Sicher erneut ausführbar. Der alte
-- Freigabe-Code funktioniert währenddessen weiter, damit Geräte
-- mit alter App-Version nicht sofort ausgesperrt werden.
-- ============================================================
drop policy if exists "erm_data_access" on erm_data;
create policy "erm_data_access" on erm_data for all
  using ( erm_check_token(current_setting('request.headers', true)::json->>'x-erm-token')
          or (select auth.role()) = 'authenticated' )
  with check ( erm_check_token(current_setting('request.headers', true)::json->>'x-erm-token')
          or (select auth.role()) = 'authenticated' );

drop policy if exists "push_subscriptions_access" on push_subscriptions;
create policy "push_subscriptions_access" on push_subscriptions for all
  using ( erm_check_token(current_setting('request.headers', true)::json->>'x-erm-token')
          or (select auth.role()) = 'authenticated' )
  with check ( erm_check_token(current_setting('request.headers', true)::json->>'x-erm-token')
          or (select auth.role()) = 'authenticated' );

-- ============================================================
-- TEIL 1B — LIVE-BAUSTELLEN-CHAT
-- Jetzt ebenfalls ausführen. Sicher erneut ausführbar.
-- Der Chat nutzt echte angemeldete Nutzerkonten und ist bewusst
-- vom großen erm_data-Payload getrennt, damit mehrere Mitarbeiter
-- gleichzeitig schreiben können.
-- ============================================================
create table if not exists public.project_chat_messages (
  id uuid primary key default gen_random_uuid(),
  projekt_id text not null,
  autor_id text,
  autor_name text not null default 'Benutzer',
  text text not null default '',
  attachment_name text,
  attachment_type text,
  attachment_path text,
  legacy_id text,
  org_id text not null default 'ib_raumkonzept',
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists project_chat_messages_project_created_idx
  on public.project_chat_messages (projekt_id, created_at);

create unique index if not exists project_chat_messages_legacy_idx
  on public.project_chat_messages (projekt_id, legacy_id)
  where legacy_id is not null;

alter table public.project_chat_messages enable row level security;
alter table public.project_chat_messages replica identity full;

drop policy if exists "project_chat_authenticated" on public.project_chat_messages;
create policy "project_chat_authenticated" on public.project_chat_messages
  for all to authenticated
  using ((select auth.role()) = 'authenticated')
  with check ((select auth.role()) = 'authenticated');

revoke all on public.project_chat_messages from anon;
grant select, insert, update, delete on public.project_chat_messages to authenticated;

do $
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'project_chat_messages'
  ) then
    alter publication supabase_realtime add table public.project_chat_messages;
  end if;
end $;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-chat',
  'project-chat',
  false,
  15728640,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "project_chat_storage_select" on storage.objects;
create policy "project_chat_storage_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'project-chat');

drop policy if exists "project_chat_storage_insert" on storage.objects;
create policy "project_chat_storage_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'project-chat');

drop policy if exists "project_chat_storage_update" on storage.objects;
create policy "project_chat_storage_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'project-chat')
  with check (bucket_id = 'project-chat');

drop policy if exists "project_chat_storage_delete" on storage.objects;
create policy "project_chat_storage_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'project-chat');

-- ============================================================
-- TEIL 2 — ERST ausführen, wenn alle Mitarbeiter erfolgreich mit
-- ihrem neuen Konto eingeloggt waren. Entfernt den alten
-- Freigabe-Code-Mechanismus endgültig. Zeilen unten entkommentieren
-- und im SQL Editor separat ausführen.
-- ============================================================
-- drop policy if exists "erm_data_access" on erm_data;
-- create policy "erm_data_access" on erm_data for all
--   using ( (select auth.role()) = 'authenticated' )
--   with check ( (select auth.role()) = 'authenticated' );
--
-- drop policy if exists "push_subscriptions_access" on push_subscriptions;
-- create policy "push_subscriptions_access" on push_subscriptions for all
--   using ( (select auth.role()) = 'authenticated' )
--   with check ( (select auth.role()) = 'authenticated' );
--
-- drop function if exists erm_check_token(text);
-- drop table if exists erm_access;
