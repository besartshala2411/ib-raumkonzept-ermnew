-- ============================================================================
-- PHASE 3B – PRE-LIVE DRAFT – NICHT OHNE EXPLIZITE FREIGABE AUSFÜHREN
-- Stand: 2026-08-28
-- Grundlage: verifizierte Live-Baseline + Auth-/Aufgaben-Preflight.
--
-- Dieser Draft:
--   * verändert erm_data / erm_access / push_subscriptions NICHT
--   * verändert erm_data.allow_all NICHT
--   * aktiviert Realtime für tasks NICHT
--   * migriert KEINE Passwörter / Dokumente / HR-Daten
--   * mappt genau EIN verifiziertes Auth-Konto
--   * lässt das zweite, nicht gemappte Auth-Konto vollständig unberührt
--   * importiert keine Legacy-Aufgaben, weil S.aufgaben aktuell leer ist
-- ============================================================================

begin;

-- Fester Firmenanker für diese Migration. Kein Client-Vertrauensanker.
-- RLS leitet die Firma serverseitig aus auth.uid() -> employees ab.
-- company_id: 02165c75-59fa-4aa5-bb45-b2f3c4145761

-- Fail closed, falls der verifizierte Ausgangszustand nicht mehr gilt.
do $$
begin
  if not exists (
    select 1 from auth.users where id = '236dabb3-f962-4c27-b6d0-db93699a2643'::uuid
  ) then
    raise exception 'ABBRUCH: verifiziertes Pilot-Auth-Konto existiert nicht mehr.';
  end if;

  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public'
      and table_name in ('companies','profiles','roles','permissions','role_permissions','employees','projects','project_members','tasks')
  ) then
    raise exception 'ABBRUCH: mindestens eine Pilot-Tabelle existiert bereits; Baseline erneut prüfen.';
  end if;
end $$;

create table public.companies (
  id uuid primary key,
  name text not null,
  created_at timestamptz not null default now()
);

insert into public.companies (id, name)
values ('02165c75-59fa-4aa5-bb45-b2f3c4145761', 'IB Raumkonzept GmbH');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index idx_profiles_company on public.profiles(company_id);

create table public.roles (
  id text primary key,
  label text not null
);
insert into public.roles (id, label) values
  ('mitarbeiter', 'Mitarbeiter'),
  ('bauleiter', 'Bauleiter'),
  ('geschaeftsfuehrer', 'Geschäftsführer');

create table public.permissions (id text primary key);
insert into public.permissions (id) values
  ('tasks.view'), ('tasks.create'), ('tasks.edit'), ('tasks.delete');

create table public.role_permissions (
  role_id text not null references public.roles(id) on delete cascade,
  permission_id text not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);
insert into public.role_permissions (role_id, permission_id) values
  ('mitarbeiter', 'tasks.view'),
  ('bauleiter', 'tasks.view'), ('bauleiter', 'tasks.create'), ('bauleiter', 'tasks.edit'),
  ('geschaeftsfuehrer', 'tasks.view'), ('geschaeftsfuehrer', 'tasks.create'),
  ('geschaeftsfuehrer', 'tasks.edit'), ('geschaeftsfuehrer', 'tasks.delete');

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  legacy_id text,
  company_id uuid not null references public.companies(id) on delete restrict,
  auth_user_id uuid unique references public.profiles(id) on delete set null,
  name text not null,
  rolle text not null default 'mitarbeiter' references public.roles(id),
  status text not null default 'aktiv' check (status in ('aktiv','inaktiv')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index idx_employees_legacy_unique
  on public.employees(company_id, legacy_id) where legacy_id is not null;
create index idx_employees_company on public.employees(company_id, status);

-- Genau das read-only verifizierte Pilotkonto wird gemappt.
insert into public.profiles (id, company_id)
values (
  '236dabb3-f962-4c27-b6d0-db93699a2643',
  '02165c75-59fa-4aa5-bb45-b2f3c4145761'
);

insert into public.employees (legacy_id, company_id, auth_user_id, name, rolle, status)
values (
  'mrwbp45ien9rg83',
  '02165c75-59fa-4aa5-bb45-b2f3c4145761',
  '236dabb3-f962-4c27-b6d0-db93699a2643',
  'Berat Shala',
  'geschaeftsfuehrer',
  'aktiv'
);

-- Das zweite Auth-Konto 7d775c6a-3809-4b3a-b133-e38dbb98fd1a wird absichtlich
-- NICHT in profiles/employees eingetragen, solange keine verifizierte Zuordnung existiert.

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  legacy_id text,
  company_id uuid not null references public.companies(id) on delete restrict,
  name text not null,
  created_at timestamptz not null default now()
);
create unique index idx_projects_legacy_unique
  on public.projects(company_id, legacy_id) where legacy_id is not null;

create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  is_responsible boolean not null default false,
  primary key (project_id, employee_id)
);
create index idx_project_members_employee on public.project_members(employee_id, project_id);

-- Server-seitige Identitätsauflösung. Security Definer + fixer search_path.
create function public.current_employee_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select e.id from public.employees e
  where e.auth_user_id = auth.uid() and e.status = 'aktiv'
  limit 1
$$;

create function public.current_employee_company_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select e.company_id from public.employees e
  where e.auth_user_id = auth.uid() and e.status = 'aktiv'
  limit 1
$$;

create function public.current_employee_role()
returns text
language sql stable security definer
set search_path = public
as $$
  select e.rolle from public.employees e
  where e.auth_user_id = auth.uid() and e.status = 'aktiv'
  limit 1
$$;

revoke all on function public.current_employee_id() from public;
revoke all on function public.current_employee_company_id() from public;
revoke all on function public.current_employee_role() from public;
grant execute on function public.current_employee_id() to authenticated;
grant execute on function public.current_employee_company_id() to authenticated;
grant execute on function public.current_employee_role() to authenticated;

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  legacy_id text,
  company_id uuid not null default public.current_employee_company_id()
    references public.companies(id) on delete restrict,
  project_id uuid references public.projects(id) on delete set null,
  titel text not null check (length(btrim(titel)) > 0),
  beschreibung text,
  faellig date,
  prioritaet text not null default 'mittel'
    check (prioritaet in ('niedrig','mittel','hoch')),
  zugeordnet_employee_id uuid references public.employees(id) on delete set null,
  status text not null default 'offen'
    check (status in ('offen','in Arbeit','erledigt')),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  updated_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint tasks_deleted_after_created check (deleted_at is null or deleted_at >= created_at)
);
create unique index idx_tasks_legacy_unique
  on public.tasks(company_id, legacy_id) where legacy_id is not null;
create index idx_tasks_company_active
  on public.tasks(company_id, status) where deleted_at is null;
create index idx_tasks_project_active
  on public.tasks(project_id) where deleted_at is null;
create index idx_tasks_assignee_active
  on public.tasks(zugeordnet_employee_id) where deleted_at is null;

create function public.tasks_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  if auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;
  -- Firmenzugehörigkeit darf bei Updates nie geändert werden.
  new.company_id := old.company_id;
  return new;
end;
$$;

create trigger trg_tasks_updated_at
before update on public.tasks
for each row execute function public.tasks_set_updated_at();

-- RLS auf sämtlichen neuen Tabellen.
alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.employees enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.tasks enable row level security;

create policy profiles_select_self on public.profiles
for select to authenticated using (id = auth.uid());

create policy companies_select_own on public.companies
for select to authenticated using (id = public.current_employee_company_id());

create policy roles_select_authenticated on public.roles
for select to authenticated using (true);
create policy permissions_select_authenticated on public.permissions
for select to authenticated using (true);
create policy role_permissions_select_authenticated on public.role_permissions
for select to authenticated using (true);

create policy employees_select_company on public.employees
for select to authenticated
using (company_id = public.current_employee_company_id());

create policy projects_select_scoped on public.projects
for select to authenticated
using (
  company_id = public.current_employee_company_id()
  and (
    public.current_employee_role() = 'geschaeftsfuehrer'
    or exists (
      select 1 from public.project_members pm
      where pm.project_id = projects.id
        and pm.employee_id = public.current_employee_id()
    )
  )
);

create policy project_members_select_scoped on public.project_members
for select to authenticated
using (
  employee_id = public.current_employee_id()
  or public.current_employee_role() = 'geschaeftsfuehrer'
);

-- Projektlose Aufgaben sind KEIN pauschaler Sichtbarkeitsgrund.
create policy tasks_select_scoped on public.tasks
for select to authenticated
using (
  deleted_at is null
  and company_id = public.current_employee_company_id()
  and (
    public.current_employee_role() = 'geschaeftsfuehrer'
    or zugeordnet_employee_id = public.current_employee_id()
    or (
      project_id is not null
      and exists (
        select 1 from public.project_members pm
        where pm.project_id = tasks.project_id
          and pm.employee_id = public.current_employee_id()
      )
    )
  )
);

create policy tasks_insert_scoped on public.tasks
for insert to authenticated
with check (
  company_id = public.current_employee_company_id()
  and public.current_employee_role() in ('bauleiter','geschaeftsfuehrer')
  and (
    project_id is null
    or public.current_employee_role() = 'geschaeftsfuehrer'
    or exists (
      select 1 from public.project_members pm
      where pm.project_id = tasks.project_id
        and pm.employee_id = public.current_employee_id()
    )
  )
);

-- Soft Delete und Restore laufen als UPDATE. Mitarbeiter haben kein edit-Recht.
create policy tasks_update_scoped on public.tasks
for update to authenticated
using (
  company_id = public.current_employee_company_id()
  and (
    public.current_employee_role() = 'geschaeftsfuehrer'
    or (
      public.current_employee_role() = 'bauleiter'
      and (
        zugeordnet_employee_id = public.current_employee_id()
        or (
          project_id is not null
          and exists (
            select 1 from public.project_members pm
            where pm.project_id = tasks.project_id
              and pm.employee_id = public.current_employee_id()
          )
        )
      )
    )
  )
)
with check (
  company_id = public.current_employee_company_id()
  and (
    public.current_employee_role() = 'geschaeftsfuehrer'
    or (
      public.current_employee_role() = 'bauleiter'
      and (
        zugeordnet_employee_id = public.current_employee_id()
        or (
          project_id is not null
          and exists (
            select 1 from public.project_members pm
            where pm.project_id = tasks.project_id
              and pm.employee_id = public.current_employee_id()
          )
        )
      )
    )
  )
);

-- ABSICHTLICH KEINE DELETE-POLICY.
-- ABSICHTLICH KEIN ALTER PUBLICATION supabase_realtime.
-- ABSICHTLICH KEINE ÄNDERUNG AN erm_data ODER allow_all.

commit;

-- Nach Ausführung separat mit Testkonto prüfen; erst danach Feature-Flag-Test.
-- ============================================================================
-- ENDE PRE-LIVE DRAFT
-- ============================================================================
