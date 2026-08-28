-- =====================================================================
-- DRAFT – NICHT AUSFÜHREN
-- =====================================================================
-- Dies ist ein SQL-ENTWURF aus Phase 2 (Planungsphase). Er wurde NICHT
-- gegen Supabase ausgeführt und ist nicht produktiv verbunden.
--
-- Zweck: Fundament-Tabellen (company/profiles/employees/roles) +
-- das für Phase 3 empfohlene Pilotmodul "tasks" (siehe
-- docs/architecture/phase2-03-migrationsplan.md, Abschnitt 34-36).
--
-- Vor echter Ausführung nötig (siehe Migrationsplan):
--   - Baseline-Schema-Export des Live-Systems (Abschnitt 16)
--   - Datenqualitäts-Validator-Lauf (Abschnitt 25)
--   - JSON-Backup (Abschnitt 31)
--   - Ausdrückliche Freigabe für Phase 3
-- =====================================================================

-- ---------------------------------------------------------------------
-- Fundament: companies
-- ---------------------------------------------------------------------
create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slogan text,
  strasse text,
  plz text,
  ort text,
  tel text,
  email text,
  web text,
  iban text,
  bic text,
  bank text,
  steuernr text,
  ustid text,
  geschaeftsfuehrer text,
  amtsgericht text,
  hrb text,
  logo_storage_path text,
  logo_aspect numeric,
  icon_storage_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Fundament: profiles (1:1 zu auth.users)
-- ---------------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null references companies(id) on delete restrict,
  email text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_profiles_company on profiles(company_id);

-- ---------------------------------------------------------------------
-- Fundament: roles / permissions / role_permissions
-- (siehe docs/architecture/phase2-01-datenmodell.md Abschnitt 9 -
--  Variante A: DB-getriebene Matrix, schlank gehalten)
-- ---------------------------------------------------------------------
create table if not exists roles (
  id text primary key,           -- 'mitarbeiter' | 'bauleiter' | 'geschaeftsfuehrer'
  label text not null
);
insert into roles (id, label) values
  ('mitarbeiter', 'Mitarbeiter'),
  ('bauleiter', 'Bauleiter'),
  ('geschaeftsfuehrer', 'Geschäftsführer')
on conflict (id) do nothing;

create table if not exists permissions (
  id text primary key            -- z.B. 'tasks.view', 'tasks.edit'
);
insert into permissions (id) values
  ('tasks.view'), ('tasks.create'), ('tasks.edit'), ('tasks.delete')
on conflict (id) do nothing;

create table if not exists role_permissions (
  role_id text not null references roles(id) on delete cascade,
  permission_id text not null references permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);
-- Beispiel-Zuordnung für das Pilotmodul (Matrix siehe Phase-2-Bericht Teil 1, Abschnitt 9):
insert into role_permissions (role_id, permission_id) values
  ('mitarbeiter', 'tasks.view'),
  ('bauleiter', 'tasks.view'), ('bauleiter', 'tasks.create'), ('bauleiter', 'tasks.edit'),
  ('geschaeftsfuehrer', 'tasks.view'), ('geschaeftsfuehrer', 'tasks.create'),
  ('geschaeftsfuehrer', 'tasks.edit'), ('geschaeftsfuehrer', 'tasks.delete')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- Fundament: employees (Ersatz für S.mitarbeiter, minimal für den Piloten
-- relevante Spalten - vollständige Spaltenliste siehe Tabellenkatalog 6.3)
-- ---------------------------------------------------------------------
create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  legacy_id text,                              -- alte uid()-ID zur Rückverfolgbarkeit
  company_id uuid not null references companies(id) on delete restrict,
  auth_user_id uuid unique references profiles(id) on delete set null,
  vorname text,
  nachname text,
  name text,                                    -- Anzeigename, wie im Ist-Zustand geführt
  position text,
  rolle text not null references roles(id) default 'mitarbeiter',
  tel text,
  email text,
  status text not null default 'aktiv',         -- 'aktiv' | 'inaktiv'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_employees_company on employees(company_id, status);

-- ---------------------------------------------------------------------
-- Fundament: projects (Minimal-Stub NUR für die Fremdschlüsselbeziehung
-- von tasks - vollständige Spaltenliste inkl. aller Kindtabellen ist
-- NICHT Teil dieses Piloten, siehe Tabellenkatalog 6.8)
-- ---------------------------------------------------------------------
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  legacy_id text,
  company_id uuid not null references companies(id) on delete restrict,
  name text not null,
  status text not null default 'in_planung',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_projects_company on projects(company_id, status);

create table if not exists project_members (
  project_id uuid not null references projects(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  primary key (project_id, employee_id)
);

-- =====================================================================
-- PILOTMODUL: tasks (Ersatz für S.aufgaben)
-- =====================================================================
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  legacy_id text,                               -- alte uid()-ID (Migrations-Rückverfolgung)
  company_id uuid not null references companies(id) on delete restrict,
  project_id uuid references projects(id) on delete set null,
  titel text not null,
  beschreibung text,
  faellig date,
  prioritaet text,                              -- Ist-Werte übernehmen, nicht neu erfinden
  zugeordnet_employee_id uuid references employees(id) on delete set null,
  status text not null default 'offen',         -- 'offen' | 'in_arbeit' | 'erledigt'
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_tasks_company on tasks(company_id, status);
create index if not exists idx_tasks_project on tasks(project_id);
create index if not exists idx_tasks_zugeordnet on tasks(zugeordnet_employee_id);

-- ---------------------------------------------------------------------
-- RLS aktivieren
-- ---------------------------------------------------------------------
alter table companies enable row level security;
alter table profiles enable row level security;
alter table employees enable row level security;
alter table projects enable row level security;
alter table project_members enable row level security;
alter table tasks enable row level security;

-- Hilfsfunktion: eigene employees-Zeile des angemeldeten Nutzers
create or replace function current_employee()
returns employees
language sql stable
security definer
set search_path = public
as $$
  select * from employees where auth_user_id = auth.uid() and status = 'aktiv' limit 1;
$$;

-- profiles: nur eigenes Profil sichtbar
create policy "profiles_self" on profiles for select
  using ( id = auth.uid() );

-- employees: firmenweit sichtbar (wie heutiges UI-Verhalten), aber KEINE
-- Gehaltsspalten in dieser Tabelle (siehe Phase-2-Bericht Teil 2, Abschnitt 10 -
-- Lohn kommt in eine eigene, separat geschützte employee_compensation-Tabelle,
-- hier bewusst NICHT Teil des Piloten)
create policy "employees_select" on employees for select
  using ( company_id = (select company_id from current_employee()) );

-- projects: siehe offene Entscheidung (Phase-2-Bericht Teil 3, Abschnitt 38, Punkt 1) -
-- dieser Entwurf zeigt BEIDE Varianten, auskommentiert die nicht gewählte.

-- Variante A (wie heutiges Verhalten): alle Firmenmitarbeiter sehen alle Projekte
create policy "projects_select_all_company" on projects for select
  using ( company_id = (select company_id from current_employee()) );

-- Variante B (nur zugewiesene Projekte für Mitarbeiter/Bauleiter) - AUSKOMMENTIERT,
-- erst nach deiner Entscheidung aktivieren:
-- create policy "projects_select_assigned" on projects for select
--   using (
--     (select rolle from current_employee()) = 'geschaeftsfuehrer'
--     or exists (
--       select 1 from project_members pm
--       where pm.project_id = projects.id
--       and pm.employee_id = (select id from current_employee())
--     )
--   );

-- tasks: sichtbar für zugewiesenen Mitarbeiter, Team-Mitglieder des verknüpften
-- Projekts, und Geschäftsführung; Schreiben nach role_permissions-Matrix
create policy "tasks_select" on tasks for select
  using (
    company_id = (select company_id from current_employee())
    and (
      (select rolle from current_employee()) = 'geschaeftsfuehrer'
      or zugeordnet_employee_id = (select id from current_employee())
      or project_id in (
        select project_id from project_members where employee_id = (select id from current_employee())
      )
      or project_id is null
    )
  );

create policy "tasks_insert" on tasks for insert
  with check (
    company_id = (select company_id from current_employee())
    and exists (
      select 1 from role_permissions rp
      where rp.role_id = (select rolle from current_employee())
      and rp.permission_id = 'tasks.create'
    )
  );

create policy "tasks_update" on tasks for update
  using (
    company_id = (select company_id from current_employee())
    and exists (
      select 1 from role_permissions rp
      where rp.role_id = (select rolle from current_employee())
      and rp.permission_id = 'tasks.edit'
    )
  )
  with check ( company_id = (select company_id from current_employee()) );

create policy "tasks_delete" on tasks for delete
  using (
    company_id = (select company_id from current_employee())
    and exists (
      select 1 from role_permissions rp
      where rp.role_id = (select rolle from current_employee())
      and rp.permission_id = 'tasks.delete'
    )
  );

-- =====================================================================
-- ENDE DRAFT – NICHT AUSFÜHREN
-- =====================================================================
