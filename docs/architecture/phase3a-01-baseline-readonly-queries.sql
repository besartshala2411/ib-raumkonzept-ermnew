-- =====================================================================
-- READ-ONLY – zur Ausführung durch den Auftraggeber im Supabase SQL Editor
-- =====================================================================
-- Zweck: Ich habe keinen direkten Lesezugriff auf die Live-Datenbank. Diese
-- Abfragen liefern AUSSCHLIESSLICH Metadaten (information_schema / pg_catalog)
-- über das bestehende Live-Schema, damit der Phase-3A-Entwurf (siehe
-- docs/architecture/phase3a-00-preflight-report.md, Abschnitt 1+2) gegen die
-- Realität abgeglichen werden kann, BEVOR irgendeine Phase-3B-Migration
-- geplant wird.
--
-- Jede einzelne Abfrage unten ist ein reines SELECT. Keine dieser Abfragen
-- enthält CREATE / ALTER / DROP / INSERT / UPDATE / DELETE / TRUNCATE.
-- Es werden KEINE Anwendungsdaten (Zeileninhalte von erm_data.payload o.ä.)
-- gelesen – nur Tabellen-/Spalten-/Policy-/Index-Metadaten.
--
-- Bitte die Ergebnisse (als Text/CSV/Screenshot) zurückgeben.
-- =====================================================================

-- 1) Welche Tabellen existieren im public-Schema bereits wirklich?
select table_name, table_type
from information_schema.tables
where table_schema = 'public'
order by table_name;

-- 2) Vollständige Spaltenliste der bekannten Tabellen (Name, Typ, nullable,
--    Default) – insbesondere für erm_data, push_subscriptions, erm_access,
--    falls dort inzwischen weitere Spalten hinzugekommen sind.
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;

-- 3) Existieren bereits IRGENDWELCHE Tabellen mit Namen, die mit den
--    Phase-3A-Entwurfsnamen kollidieren könnten (companies, profiles,
--    employees, roles, permissions, role_permissions, projects,
--    project_members, tasks)? Falls ja: NICHT einfach überschreiben, sondern
--    vorher klären, wofür sie bereits verwendet werden.
select table_name
from information_schema.tables
where table_schema = 'public'
and table_name in (
  'companies','profiles','employees','roles','permissions',
  'role_permissions','projects','project_members','tasks'
);

-- 4) Welche RLS-Policies existieren aktuell (auf welchen Tabellen, welche
--    Befehle, welcher USING/WITH CHECK-Ausdruck)?
select schemaname, tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 5) Auf welchen Tabellen ist Row Level Security überhaupt aktiviert?
select c.relname as table_name, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;

-- 6) Vorhandene Indizes/Constraints auf erm_data (um z.B. den Payload-
--    Spaltentyp erneut zu bestätigen – siehe bekannter Vorfall:
--    payload MUSS jsonb sein, nicht text).
select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'erm_data';

select column_name, data_type, udt_name
from information_schema.columns
where table_schema = 'public' and table_name = 'erm_data';

-- 7) Existiert bereits eine auth.users-Tabelle mit Einträgen (grobe Anzahl,
--    KEINE E-Mail-Adressen oder sonstige personenbezogene Werte)? Dient nur
--    dazu, die Größenordnung für die auth.uid()-Zuordnungsstrategie
--    (Report Abschnitt 7) realistisch einzuschätzen.
select count(*) as anzahl_auth_users
from auth.users;

-- 8) Existierende Postgres-Funktionen im public-Schema (Namenskollisionen
--    mit current_employee(), tasks_set_updated_at() ausschließen).
select routine_name, routine_type
from information_schema.routines
where routine_schema = 'public'
order by routine_name;

-- 9) Storage-Buckets, die bereits existieren (nur Namen/Konfiguration,
--    keine Dateiinhalte) – Kontext für die separat laufende
--    Storage-Migrationsplanung (phase2-02-security-storage.md).
select id, name, public, created_at
from storage.buckets;

-- =====================================================================
-- ENDE – ausschließlich SELECT-Abfragen, keine Schreibzugriffe.
-- =====================================================================
