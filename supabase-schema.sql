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
