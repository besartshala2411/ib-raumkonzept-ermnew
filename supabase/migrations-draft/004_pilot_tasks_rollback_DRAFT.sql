-- ============================================================================
-- PHASE 3B – ROLLBACK DRAFT – NICHT OHNE EXPLIZITE FREIGABE AUSFÜHREN
-- ACHTUNG: Löscht ALLE Daten in den neuen Pilot-Tabellen.
-- Verändert KEINE Legacy-Tabelle und KEINE Legacy-Policy.
-- ============================================================================

begin;

-- Fail closed: Legacy-Objekte dürfen von diesem Rollback nicht betroffen sein.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema='public' and table_name not in (
      'companies','profiles','roles','permissions','role_permissions',
      'employees','projects','project_members','tasks',
      'erm_access','erm_data','push_subscriptions'
    )
  ) then
    -- Nur Hinweis; keine fremden Tabellen werden angefasst.
    raise notice 'Weitere public-Tabellen existieren; Rollback fasst sie nicht an.';
  end if;
end $$;

-- Abhängige Pilotobjekte zuerst entfernen.
drop table if exists public.tasks cascade;
drop table if exists public.project_members cascade;
drop table if exists public.projects cascade;
drop table if exists public.employees cascade;
drop table if exists public.role_permissions cascade;
drop table if exists public.permissions cascade;
drop table if exists public.roles cascade;
drop table if exists public.profiles cascade;
drop table if exists public.companies cascade;

-- Helper/Trigger-Funktionen separat entfernen, falls sie durch CASCADE nicht bereits weg sind.
drop function if exists public.tasks_set_updated_at();
drop function if exists public.tasks_enforce_tenant_refs();
drop function if exists public.current_employee_role();
drop function if exists public.current_employee_company_id();
drop function if exists public.current_employee_id();

commit;

-- Nach Rollback READ-ONLY verifizieren:
-- select table_name from information_schema.tables
-- where table_schema='public' order by table_name;
--
-- Erwartung: erm_access, erm_data, push_subscriptions bleiben bestehen.
-- ============================================================================
