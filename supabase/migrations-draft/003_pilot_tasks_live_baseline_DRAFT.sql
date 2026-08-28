-- =====================================================================
-- DRAFT – NICHT AUSFÜHREN
-- Phase 3B Vorbereitung nach verifizierter Live-Baseline 2026-08-28.
-- Keine Anweisung in dieser Datei wurde gegen das Live-System ausgeführt.
-- =====================================================================

-- Sicherheits-/Cutover-Grenzen:
-- 1. Bestehende Legacy-Tabellen/Policies werden NICHT verändert.
-- 2. Insbesondere wird erm_data.allow_all hier NICHT entfernt.
-- 3. tasks wird hier NICHT zu supabase_realtime hinzugefügt.
-- 4. Kein Storage und keine Passwortmigration in diesem Piloten.
-- 5. Vor Live-Ausführung: Backup, Validator/Dry-Run, Auth-Mapping,
--    Testkonto und ausdrückliche Freigabe erforderlich.

-- ---------------------------------------------------------------------
-- Firma: feste Migrations-ID als Referenzanker, NICHT als Security-Beweis.
-- RLS leitet die Firma serverseitig aus auth.uid() -> employees ab.
-- ---------------------------------------------------------------------
create table companies (
  id uuid primary key,
  name text not null,
  created_at timestamptz not null default now()
);

insert into companies (id, name) values
  ('00000000-0000-4000-8000-000000000001', 'IB Raumkonzept GmbH');

-- ---------------------------------------------------------------------
-- Auth-Profil. E-Mail wird für RLS nicht benötigt und daher im Pilotmodell
-- bewusst nicht dupliziert. auth.users bleibt die Auth-Quelle.
-- ---------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null references companies(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index idx_profiles_company on profiles(company_id);

create table roles (
  id text primary key,
  label text not null
);
insert into roles (id, label) values
  ('mitarbeiter', 'Mitarbeiter'),
  ('bauleiter', 'Bauleiter'),
  ('geschaeftsfuehrer', 'Geschäftsführer');

create table permissions (
  id text primary key
);
insert into permissions (id) values
  ('tasks.view'), ('tasks.create'), ('tasks.edit'), ('tasks.delete');

create table role_permissions (
  role_id text not null references roles(id) on delete cascade,
  permission_id text not null references permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);
insert into role_permissions (role_id, permission_id) values
  ('mitarbeiter', 'tasks.view'),
  ('bauleiter', 'tasks.view'), ('bauleiter', 'tasks.create'), ('bauleiter', 'tasks.edit'),
  ('geschaeftsfuehrer', 'tasks.view'), ('geschaeftsfuehrer', 'tasks.create'),
  ('geschaeftsfuehrer', 'tasks.edit'), ('geschaeftsfuehrer', 'tasks.delete');

-- Minimaler Mitarbeiter-Anker. auth_user_id ist nur gesetzt, wenn eine
-- verifizierte Zuordnung zu einem der bestehenden Supabase-Auth-Konten vorliegt.
create table employees (
  id uuid primary key default gen_random_uuid(),
  legacy_id text,
  company_id uuid not null references companies(id) on delete restrict,
  auth_user_id uuid unique references profiles(id) on delete set null,
  name text not null,
  rolle text not null default 'mitarbeiter' references roles(id),
  status text not null default 'aktiv' check (status in ('aktiv','inaktiv')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index idx_employees_legacy_unique
  on employees(company_id, legacy_id) where legacy_id is not null;
create index idx_employees_company on employees(company_id, status);

-- Minimaler Projekt-Anker für Sichtbarkeit/FK. Keine Migration der vollständigen
-- Projektakte in diesem Pilot.
create table projects (
  id uuid primary key default gen_random_uuid(),
  legacy_id text,
  company_id uuid not null references companies(id) on delete restrict,
  name text not null,
  created_at timestamptz not null default now()
);
create unique index idx_projects_legacy_unique
  on projects(company_id, legacy_id) where legacy_id is not null;

create table project_members (
  project_id uuid not null references projects(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  is_responsible boolean not null default false,
  primary key (project_id, employee_id)
);
create index idx_project_members_employee on project_members(employee_id, project_id);

-- ---------------------------------------------------------------------
-- Pilot: Aufgaben
-- Historische created_at-Werte existieren im Legacy-State nicht. Bei einer
-- späteren Migration ist created_at daher der dokumentierte Migrationszeitpunkt
-- und darf nicht als historisches Erstellungsdatum interpretiert werden.
-- ---------------------------------------------------------------------
create table tasks (
  id uuid primary key default gen_random_uuid(),
  legacy_id text,
  company_id uuid not null references companies(id) on delete restrict,
  project_id uuid references projects(id) on delete set null,
  titel text not null check (length(btrim(titel)) > 0),
  beschreibung text,
  faellig date,
  prioritaet text check (prioritaet is null or prioritaet in ('niedrig','mittel','hoch')),
  zugeordnet_employee_id uuid references employees(id) on delete set null,
  status text not null default 'offen' check (status in ('offen','in Arbeit','erledigt')),
  created_by uuid references profiles(id) on delete set null,
  updated_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint tasks_deleted_after_created check (deleted_at is null or deleted_at >= created_at)
);
create unique index idx_tasks_legacy_unique
  on tasks(company_id, legacy_id) where legacy_id is not null;
create index idx_tasks_company_active on tasks(company_id, status) where deleted_at is null;
create index idx_tasks_project_active on tasks(project_id) where deleted_at is null;
create index idx_tasks_assignee_active on tasks(zugeordnet_employee_id) where deleted_at is null;

create function tasks_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_tasks_updated_at
before update on tasks
for each row execute function tasks_set_updated_at();

-- ---------------------------------------------------------------------
-- RLS für ALLE neuen Tabellen. Referenz-/Berechtigungstabellen erhalten keine
-- Client-Schreibpolicy. Damit können authenticated/anon sie nicht verändern.
-- ---------------------------------------------------------------------
alter table companies enable row level security;
alter table profiles enable row level security;
alter table roles enable row level security;
alter table permissions enable row level security;
alter table role_permissions enable row level security;
alter table employees enable row level security;
alter table projects enable row level security;
alter table project_members enable row level security;
alter table tasks enable row level security;

-- Server-seitige Identitätsauflösung. SECURITY DEFINER wird absichtlich auf
-- eine schmale Funktion begrenzt. search_path ist fixiert.
create function current_employee_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select e.id
  from employees e
  where e.auth_user_id = auth.uid() and e.status = 'aktiv'
  limit 1;
$$;

create function current_employee_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select e.company_id
  from employees e
  where e.auth_user_id = auth.uid() and e.status = 'aktiv'
  limit 1;
$$;

create function current_employee_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select e.rolle
  from employees e
  where e.auth_user_id = auth.uid() and e.status = 'aktiv'
  limit 1;
$$;

-- Ausführungsrechte auf die drei Helper explizit begrenzen.
revoke all on function current_employee_id() from public;
revoke all on function current_employee_company_id() from public;
revoke all on function current_employee_role() from public;
grant execute on function current_employee_id() to authenticated;
grant execute on function current_employee_company_id() to authenticated;
grant execute on function current_employee_role() to authenticated;

-- Eigenes Profil.
create policy profiles_select_self on profiles for select to authenticated
  using (id = auth.uid());

-- Minimale Mitarbeiterdaten firmenweit. Keine HR-/Vergütungsdaten in dieser Tabelle.
create policy employees_select_company on employees for select to authenticated
  using (company_id = current_employee_company_id());

-- Referenztabellen dürfen authentifizierte Benutzer lesen; keine Client-Writes.
create policy roles_select_authenticated on roles for select to authenticated using (true);
create policy permissions_select_authenticated on permissions for select to authenticated using (true);
create policy role_permissions_select_authenticated on role_permissions for select to authenticated using (true);

-- Firma nur für Mitglieder derselben Firma sichtbar.
create policy companies_select_own on companies for select to authenticated
  using (id = current_employee_company_id());

-- Projektzugriff: GF firmenweit; Bauleiter/Mitarbeiter nur Mitgliedschaft.
create policy projects_select_scoped on projects for select to authenticated
  using (
    company_id = current_employee_company_id()
    and (
      current_employee_role() = 'geschaeftsfuehrer'
      or exists (
        select 1 from project_members pm
        where pm.project_id = projects.id
          and pm.employee_id = current_employee_id()
      )
    )
  );

-- Mitgliedschaften nur innerhalb sichtbarer Projekte. Diese Policy vermeidet
-- eine pauschale firmenweite Offenlegung von Teamzuordnungen.
create policy project_members_select_scoped on project_members for select to authenticated
  using (
    employee_id = current_employee_id()
    or current_employee_role() = 'geschaeftsfuehrer'
  );

-- KORREKTUR gegenüber Draft 002:
-- project_id IS NULL ist KEIN eigener Sichtbarkeitsgrund.
-- GF: alle aktiven Firmenaufgaben.
-- Bauleiter/Mitarbeiter: direkte Zuweisung ODER Mitgliedschaft im Projekt.
create policy tasks_select_scoped on tasks for select to authenticated
  using (
    deleted_at is null
    and company_id = current_employee_company_id()
    and (
      current_employee_role() = 'geschaeftsfuehrer'
      or zugeordnet_employee_id = current_employee_id()
      or (
        project_id is not null
        and exists (
          select 1 from project_members pm
          where pm.project_id = tasks.project_id
            and pm.employee_id = current_employee_id()
        )
      )
    )
  );

-- Erstellen: Bauleiter/GF. company_id muss serverseitig auf eigene Firma passen.
-- Projektlose Aufgaben sind erlaubt, aber dadurch NICHT automatisch sichtbar.
create policy tasks_insert_scoped on tasks for insert to authenticated
  with check (
    company_id = current_employee_company_id()
    and current_employee_role() in ('bauleiter','geschaeftsfuehrer')
    and (
      project_id is null
      or current_employee_role() = 'geschaeftsfuehrer'
      or exists (
        select 1 from project_members pm
        where pm.project_id = tasks.project_id
          and pm.employee_id = current_employee_id()
      )
    )
  );

-- Bearbeiten: GF firmenweit; Bauleiter nur Aufgaben, die er auch sehen darf.
-- Mitarbeiter hat im aktuellen Rollenmodell keine tasks.edit-Berechtigung.
create policy tasks_update_scoped on tasks for update to authenticated
  using (
    company_id = current_employee_company_id()
    and (
      current_employee_role() = 'geschaeftsfuehrer'
      or (
        current_employee_role() = 'bauleiter'
        and (
          zugeordnet_employee_id = current_employee_id()
          or (
            project_id is not null
            and exists (
              select 1 from project_members pm
              where pm.project_id = tasks.project_id
                and pm.employee_id = current_employee_id()
            )
          )
        )
      )
    )
  )
  with check (
    company_id = current_employee_company_id()
    and (
      current_employee_role() = 'geschaeftsfuehrer'
      or (
        current_employee_role() = 'bauleiter'
        and (
          zugeordnet_employee_id = current_employee_id()
          or (
            project_id is not null
            and exists (
              select 1 from project_members pm
              where pm.project_id = tasks.project_id
                and pm.employee_id = current_employee_id()
            )
          )
        )
      )
    )
  );

-- Kein DELETE-Policy im Pilot. Repository soll ausschließlich deleted_at setzen.
-- Ein späteres Hard-Delete-Adminwerkzeug bekommt eine separat geprüfte Policy.

-- =====================================================================
-- WICHTIG VOR LIVE-AUSFÜHRUNG
-- =====================================================================
-- A) Auth-Mapping für die 2 vorhandenen auth.users verifizieren.
-- B) Minimal-Migration der für Aufgaben benötigten Mitarbeiter-/Projektanker
--    definieren und gegen echte Legacy-IDs dry-runnen.
-- C) Sicherstellen, dass keine Zuweisung/Projektverknüpfung still verloren geht.
-- D) Task-Repository Supabase-Pfad + Soft Delete testen; Flag bleibt legacy.
-- E) Erst Testkonto/Testgerät, kein produktiver Parallelbetrieb.
-- F) Realtime für tasks erst nach separater Entscheidung.
-- =====================================================================
-- ENDE DRAFT – NICHT AUSFÜHREN
