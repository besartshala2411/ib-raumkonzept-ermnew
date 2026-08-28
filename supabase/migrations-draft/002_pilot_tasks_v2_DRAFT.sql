-- =====================================================================
-- DRAFT – NICHT AUSFÜHREN
-- =====================================================================
-- Phase 3A (Preflight-Planung für den Aufgaben-Piloten). Dieser Entwurf
-- VERFEINERT 001_pilot_tasks_DRAFT.sql (Phase 2) auf Basis der inzwischen
-- vollständig verifizierten Ist-Datenmodell-Analyse von S.aufgaben (siehe
-- docs/architecture/phase3a-00-preflight-report.md, Abschnitt 3+5) und der
-- inzwischen getroffenen Entscheidung zur Projekt-Sichtbarkeit (Abschnitt 8).
--
-- 001 bleibt als historisches Phase-2-Dokument unverändert erhalten. Dieser
-- Entwurf (002) ist die Grundlage für eine mögliche spätere Phase 3B – er
-- wurde NICHT gegen Supabase ausgeführt und ist nicht produktiv verbunden.
--
-- Vor echter Ausführung zwingend nötig (siehe Preflight-Report):
--   - Baseline-Schema-Abgleich mit dem Live-System (Abschnitt 1+2 des Reports,
--     READ-ONLY-Queries in phase3a-01-baseline-readonly-queries.sql)
--   - Erfolgreicher Dry-Run + Validator-Lauf gegen echte (aber nur lokal
--     eingesehene) S.aufgaben-Daten (Abschnitt 11+12)
--   - JSON-Backup des kompletten S-States vor jeder Änderung (Abschnitt 13)
--   - Ausdrückliche Freigabe für Phase 3B durch den Auftraggeber
--
-- WEITERHIN UNVERÄNDERT GÜLTIG: Das Klartext-Passwort-Risiko in
-- S.passwoerter[].passwort bleibt vollständig bestehen. Dieser Piloten-Entwurf
-- migriert und berührt KEINE Passwortdaten. "tasks hat RLS" bedeutet NICHT
-- "das System ist jetzt sicher" – der ungeschützte Legacy-Payload
-- (erm_data.payload) bleibt exakt so exponiert wie vor diesem Piloten.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Fundament: companies – bewusst MINIMAL für den Piloten (nur als
-- FK-Anker). Die vollständigen Firmenprofil-Felder (Adresse, IBAN,
-- Steuernummer etc., siehe S.einstellungen) sind NICHT Teil dieses
-- Piloten und werden erst migriert, wenn Einstellungen selbst migriert
-- wird (siehe phase2-01-datenmodell.md, Tabellenkatalog).
-- ---------------------------------------------------------------------
create table if not exists companies (
  id uuid primary key,
  name text not null,
  created_at timestamptz not null default now()
);

-- "Kleinste sichere Lösung" (Report Abschnitt 6): GENAU EINE Firma, mit
-- einer FEST VERGEBENEN UUID (nicht gen_random_uuid()), damit SQL-Migration
-- und das Node-Migrationswerkzeug (tools/migration/migrateTasksDryRun.js)
-- exakt denselben Wert referenzieren, ohne ihn zur Laufzeit nachschlagen zu
-- müssen. Der konkrete Literal-Wert wird erst unmittelbar vor einer
-- tatsächlichen Phase-3B-Ausführung endgültig festgelegt und dokumentiert.
insert into companies (id, name) values
  ('00000000-0000-4000-8000-000000000001', 'IB Raumkonzept GmbH')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Fundament: profiles (1:1 zu auth.users) – unverändert zu 001.
-- ---------------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null references companies(id) on delete restrict,
  email text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_profiles_company on profiles(company_id);

-- ---------------------------------------------------------------------
-- Fundament: roles / permissions / role_permissions – unverändert zu 001,
-- gespiegelt in src/modules/tasks/taskPermissions.js (reine UI-Convenience,
-- KEINE Sicherheitsgrenze – siehe Kommentar dort).
-- ---------------------------------------------------------------------
create table if not exists roles (
  id text primary key,
  label text not null
);
insert into roles (id, label) values
  ('mitarbeiter', 'Mitarbeiter'),
  ('bauleiter', 'Bauleiter'),
  ('geschaeftsfuehrer', 'Geschäftsführer')
on conflict (id) do nothing;

create table if not exists permissions (
  id text primary key
);
insert into permissions (id) values
  ('tasks.view'), ('tasks.create'), ('tasks.edit'), ('tasks.delete')
on conflict (id) do nothing;

create table if not exists role_permissions (
  role_id text not null references roles(id) on delete cascade,
  permission_id text not null references permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);
insert into role_permissions (role_id, permission_id) values
  ('mitarbeiter', 'tasks.view'),
  ('bauleiter', 'tasks.view'), ('bauleiter', 'tasks.create'), ('bauleiter', 'tasks.edit'),
  ('geschaeftsfuehrer', 'tasks.view'), ('geschaeftsfuehrer', 'tasks.create'),
  ('geschaeftsfuehrer', 'tasks.edit'), ('geschaeftsfuehrer', 'tasks.delete')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- Fundament: employees – für den Piloten bewusst auf die für RLS
-- benötigten Spalten REDUZIERT (Report Abschnitt 7, "auth.uid()-Strategie:
-- minimal"). Die vollständige HR-Spaltenliste (Gehalt, Vertrag, Urlaub
-- usw., siehe phase2-01-datenmodell.md Tabellenkatalog 6.3) ist NICHT Teil
-- dieses Piloten. Befüllt würde diese Tabelle in Phase 3B ausdrücklich NUR
-- für die Teilmenge von S.mitarbeiter, die bereits einen echten
-- Supabase-Auth-Account besitzt (authUserId gesetzt) – nicht für alle
-- Mitarbeiter automatisch.
-- ---------------------------------------------------------------------
create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  legacy_id text,
  company_id uuid not null references companies(id) on delete restrict,
  auth_user_id uuid unique references profiles(id) on delete set null,
  name text not null,
  rolle text not null references roles(id) default 'mitarbeiter',
  status text not null default 'aktiv',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists idx_employees_legacy_unique on employees(company_id, legacy_id) where legacy_id is not null;
create index if not exists idx_employees_company on employees(company_id, status);

-- ---------------------------------------------------------------------
-- Fundament: projects – Minimal-Stub NUR für die FK-Beziehung von tasks
-- und für project_members (Sichtbarkeitsmodell, siehe unten). Die
-- vollständige projects-Struktur (12 Unterbereiche, siehe
-- phase2-01-datenmodell.md Abschnitt 6.8) ist NICHT Teil dieses Piloten.
-- ---------------------------------------------------------------------
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  legacy_id text,
  company_id uuid not null references companies(id) on delete restrict,
  name text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists idx_projects_legacy_unique on projects(company_id, legacy_id) where legacy_id is not null;

create table if not exists project_members (
  project_id uuid not null references projects(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  primary key (project_id, employee_id)
);

-- =====================================================================
-- PILOTMODUL: tasks (Ersatz für S.aufgaben)
-- =====================================================================
-- Feldentscheidungen (Report Abschnitt 5) – bewusst NICHT die im Auftrag
-- genannte Beispielliste blind übernommen, sondern gegen das verifizierte
-- Ist-Modell (index.html, MODULE: AUFGABEN) abgeglichen:
--
--   id / legacy_id   – echte uuid PK + alte uid()-Werte zur Rückverfolgung
--                       und Idempotenz (unique-Index, siehe unten), analog
--                       zum bestehenden Vorbild rechnungen[].id vs. .nr.
--   status/prioritaet – Ist-WERTE 1:1 übernommen ("offen"/"in Arbeit"/
--                       "erledigt", "niedrig"/"mittel"/"hoch"), NICHT auf
--                       ein neues Enum-Schema normalisiert – Normalisierung
--                       wäre eine zusätzliche, hier bewusst nicht gebündelte
--                       Änderung (siehe Report Abschnitt 5, Risiken).
--   created_at/updated_at/created_by/updated_by – NEU. Es gibt in S.aufgaben
--                       KEIN Erstellungsdatum und KEINEN Ersteller. Für
--                       migrierte Zeilen bleibt created_by NULL und
--                       created_at entspricht dem MIGRATIONS-Zeitpunkt, NICHT
--                       einem echten historischen Datum – siehe Validator-
--                       und Migrations-Dokumentation, um Missverständnisse zu
--                       vermeiden.
--   deleted_at        – NEU (Soft Delete). Ersetzt den heutigen physischen
--                       splice() in deleteItemWithUndo(); siehe Report
--                       Abschnitt 5 zur vorgeschlagenen UX-Beibehaltung.
-- =====================================================================
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  legacy_id text,
  company_id uuid not null references companies(id) on delete restrict,
  project_id uuid references projects(id) on delete set null,
  titel text not null,
  beschreibung text,
  faellig date,
  prioritaet text check (prioritaet is null or prioritaet in ('niedrig', 'mittel', 'hoch')),
  zugeordnet_employee_id uuid references employees(id) on delete set null,
  status text not null default 'offen' check (status in ('offen', 'in Arbeit', 'erledigt')),
  created_by uuid references profiles(id),
  updated_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists idx_tasks_legacy_unique on tasks(company_id, legacy_id) where legacy_id is not null;
create index if not exists idx_tasks_company on tasks(company_id, status) where deleted_at is null;
create index if not exists idx_tasks_project on tasks(project_id) where deleted_at is null;
create index if not exists idx_tasks_zugeordnet on tasks(zugeordnet_employee_id) where deleted_at is null;

create or replace function tasks_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger trg_tasks_updated_at before update on tasks
  for each row execute function tasks_set_updated_at();

-- ---------------------------------------------------------------------
-- RLS aktivieren
-- ---------------------------------------------------------------------
alter table companies enable row level security;
alter table profiles enable row level security;
alter table employees enable row level security;
alter table projects enable row level security;
alter table project_members enable row level security;
alter table tasks enable row level security;

-- current_employee(): serverseitige Auflösung von auth.uid() -> employees-Zeile.
-- WICHTIG: Rolle/company_id kommen HIER aus der Datenbank, nie aus dem Client.
-- Kein RLS-Ausdruck unten liest role/company_id aus JWT-Claims, localStorage
-- oder sonstigen clientseitig beeinflussbaren Quellen.
create or replace function current_employee()
returns employees
language sql stable
security definer
set search_path = public
as $$
  select * from employees where auth_user_id = auth.uid() and status = 'aktiv' limit 1;
$$;

-- profiles: nur eigenes Profil sichtbar
create policy "profiles_select_self" on profiles for select
  using ( id = auth.uid() );

-- employees: firmenweit sichtbar (wie heutiges UI-Verhalten: alle Mitarbeiter
-- sehen die Mitarbeiterliste). Bewusst KEINE Gehalts-/Vertragsspalten in
-- dieser Tabelle (siehe phase2-02-security-storage.md Abschnitt 10 –
-- employee_compensation als separat geschützte Tabelle, nicht Teil des Piloten).
create policy "employees_select" on employees for select
  using ( company_id = (select company_id from current_employee()) );

-- projects: Sichtbarkeitsmodell gemäß der inzwischen getroffenen Entscheidung
-- (Report Abschnitt "Ziel-Sichtbarkeitsmodell"): Geschäftsführer sieht alle
-- Projekte der Firma; Bauleiter/Mitarbeiter sehen nur Projekte, denen sie
-- über project_members zugeordnet sind. HINWEIS: Diese Policy ist Teil des
-- ZIELMODELLS und wird hier nur vorbereitet – die eigentliche projects-Tabelle
-- selbst wird in DIESEM Piloten nicht mit echten Daten befüllt (nur als
-- FK-Stub für tasks.project_id, siehe Report Abschnitt "Migrationsumfang").
create policy "projects_select_scoped" on projects for select
  using (
    company_id = (select company_id from current_employee())
    and (
      (select rolle from current_employee()) = 'geschaeftsfuehrer'
      or exists (
        select 1 from project_members pm
        where pm.project_id = projects.id
        and pm.employee_id = (select id from current_employee())
      )
    )
  );

-- tasks: sichtbar für den zugewiesenen Mitarbeiter, Team-Mitglieder des
-- verknüpften Projekts, und die Geschäftsführung (immer alles). Aufgaben ohne
-- Projektbezug (project_id is null) bleiben firmenweit sichtbar, analog zum
-- heutigen Verhalten von globalSearchIndex() (Aufgaben werden dort
-- uneingeschränkt für alle indexiert). Gelöschte Zeilen (deleted_at gesetzt)
-- werden nirgends zurückgegeben.
create policy "tasks_select" on tasks for select
  using (
    deleted_at is null
    and company_id = (select company_id from current_employee())
    and (
      (select rolle from current_employee()) = 'geschaeftsfuehrer'
      or zugeordnet_employee_id = (select id from current_employee())
      or project_id is null
      or project_id in (
        select project_id from project_members where employee_id = (select id from current_employee())
      )
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

-- delete: in diesem Piloten realisiert als Soft Delete (UPDATE deleted_at),
-- siehe Report Abschnitt 5+13. Eine echte SQL-DELETE-Policy wird trotzdem
-- vorbereitet, für den Fall eines späteren Hard-Delete-Admin-Werkzeugs.
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
