# Phase 3B – verifizierte Live-Baseline (READ-ONLY)

Stand: 2026-08-28

## Status

Diese Baseline wurde vom Auftraggeber im Supabase SQL Editor ausschließlich mit SELECT-Abfragen erhoben. Es wurden im Rahmen der Baseline keine Schema- oder Datenänderungen ausgeführt.

## Verifizierter Live-Stand

### public-Tabellen

Es existieren genau drei Tabellen:

- `erm_access`
- `erm_data`
- `push_subscriptions`

Keine der für den Aufgaben-Piloten geplanten Tabellen (`companies`, `profiles`, `employees`, `roles`, `permissions`, `role_permissions`, `projects`, `project_members`, `tasks`) existiert bereits. Es bestehen daher aktuell keine Namenskollisionen.

### erm_access

- `id integer NOT NULL DEFAULT 1`
- `code_hash text NOT NULL`

### erm_data

- `id bigint NOT NULL DEFAULT 1`
- `org_id text NOT NULL DEFAULT 'ib_raumkonzept'`
- `payload jsonb NOT NULL`
- `updated_at timestamptz NULL DEFAULT now()`
- `updated_by text NULL DEFAULT 'System'`

Indizes:

- `erm_data_pkey` – UNIQUE/Primary Key auf `id`
- `erm_data_org_id_key` – UNIQUE auf `org_id`

Damit ist bestätigt, dass der produktive Legacy-State weiterhin zentral in `erm_data.payload` als JSONB liegt.

### push_subscriptions

- `endpoint text NOT NULL`
- `p256dh text NOT NULL`
- `auth text NOT NULL`
- `org_id text NOT NULL DEFAULT 'ib_raumkonzept'`
- `created_at timestamptz NOT NULL DEFAULT now()`

## Auth

`auth.users` enthält aktuell **2 Benutzer**. Es wurden bewusst keine E-Mail-Adressen oder sonstigen personenbezogenen Auth-Daten ausgelesen.

## RLS

RLS ist auf allen drei bestehenden public-Tabellen aktiviert; `FORCE ROW LEVEL SECURITY` ist jeweils deaktiviert.

Verifizierte Policies:

- `erm_data.allow_all` – `ALL`, `USING true`, `WITH CHECK true`
- `erm_data.erm_data_access` – `ALL`, verwendet `erm_check_token(...)` bzw. authentifizierte Rolle
- `push_subscriptions.push_subscriptions_access` – `ALL`, verwendet `erm_check_token(...)` bzw. authentifizierte Rolle

### Kritischer Befund

`erm_data.allow_all` macht die Schutzwirkung von RLS für `erm_data` faktisch zunichte. Dieser Befund wird in Phase 3B **nicht nebenbei repariert**, weil `erm_data` weiterhin der produktive Legacy-Datenspeicher ist und eine unkoordinierte Policy-Änderung die bestehende Anwendung sperren könnte. Die Policy muss in einer separat getesteten Security-/Cutover-Maßnahme entfernt bzw. ersetzt werden.

## Funktionen / Trigger / Realtime / Storage

- public-Funktion: genau `erm_check_token`
- Trigger im public-Schema: keine
- `supabase_realtime`: aktuell nur `public.erm_data`
- Storage-Buckets: keine

## Konsequenzen für den Aufgaben-Piloten

1. Neue Pilot-Tabellen können ohne Namenskollision vorbereitet werden.
2. `erm_data` bleibt bis zum kontrollierten Cutover unverändert; insbesondere wird `allow_all` in diesem Vorbereitungsschritt nicht verändert.
3. `tasks` darf nicht automatisch in Realtime aufgenommen werden. Das erfolgt erst nach expliziter Entscheidung/Test.
4. Es gibt noch keinen Storage-Unterbau; Storage ist nicht Teil des Aufgaben-Piloten.
5. `company_id` ist kein Client-Vertrauensanker. Zugriff muss serverseitig aus `auth.uid()` über die Mitarbeiterzuordnung zur Firma aufgelöst werden.
6. Projektlose Aufgaben dürfen für Bauleiter/Mitarbeiter **nicht firmenweit sichtbar** sein. Sichtbarkeit: Geschäftsführer firmenweit; sonst direkte Zuweisung oder Projektmitgliedschaft.
7. Kein produktiver Parallelbetrieb mit Legacy- und Supabase-Schreibzugriffen. Der Supabase-Pfad bleibt bis zum kontrollierten Test deaktiviert.
8. Das Klartext-Passwortproblem in `S.passwoerter` bleibt Security Priority 0 und wird durch den Aufgaben-Piloten nicht berührt oder als gelöst betrachtet.

## Freigabegrenze

Dieser Bericht ist eine Planungs-/Review-Artefakt. Er ist **keine Freigabe zur Ausführung** von DDL/DML im Live-Supabase-Projekt. Vor Live-Ausführung müssen finaler SQL-Draft, Dry-Run/Validator, Backup-Plan, Auth-Mapping und Testkonto geprüft und ausdrücklich freigegeben werden.
