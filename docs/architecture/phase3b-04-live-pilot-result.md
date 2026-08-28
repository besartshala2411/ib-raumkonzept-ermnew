# Phase 3B – Live-Pilot Ergebnis

Stand: 2026-08-28

## Status

Der kontrollierte Live-Pilot für das neue `tasks`-Schema wurde erfolgreich durchgeführt.

## Vorbedingungen

- Alle geplanten Pilot-Tabellen waren vor Ausführung nicht vorhanden.
- Der aktuelle Branch `phase3b-prep` war per GitHub Actions vollständig grün.
- Die bestehende Legacy-Struktur (`erm_data`, `erm_access`, `push_subscriptions`) blieb unangetastet.
- `tasks` wurde nicht zu `supabase_realtime` hinzugefügt.
- Das zweite, nicht verifizierte Auth-Konto blieb ungemappt.

## Live-Schema

Der freigegebene Phase-3B-SQL-Draft wurde ausgeführt. Danach waren folgende Tabellen vorhanden:

- `companies`
- `profiles`
- `roles`
- `permissions`
- `role_permissions`
- `employees`
- `projects`
- `project_members`
- `tasks`

Die vorgesehenen RLS-Policies waren vorhanden. Für `tasks` existieren SELECT-, INSERT- und UPDATE-Policies, jedoch absichtlich keine DELETE-Policy und kein DELETE-Grant.

## Realtime

`tasks` ist weiterhin nicht Bestandteil der Publication `supabase_realtime`.

## Auth-/RLS-Negativtest

Ein Auth-Konto ohne verifizierte `profiles`/`employees`-Zuordnung lieferte über die serverseitigen Helper keine Employee-ID, keine Company-ID und keine Rolle. Ein INSERT in `tasks` wurde durch RLS mit HTTP 403 blockiert.

Das ist das erwartete Fail-Closed-Verhalten. Das Konto wurde nicht nachträglich geraten oder automatisch gemappt.

## Auth-/RLS-Positivtest

Mit dem verifizierten Geschäftsführer-Konto wurde die Rolle `geschaeftsfuehrer` serverseitig korrekt aufgelöst.

Eine synthetische, projektlose und unzugewiesene Testaufgabe wurde erfolgreich über den normalen Supabase-Client erstellt. Dabei wurden serverseitig gesetzt bzw. erzwungen:

- `company_id`
- `created_by`
- `updated_by`
- `created_at`
- `deleted_at = null`

## CRUD-/Soft-Delete-Pilot

Der synthetische Datensatz durchlief erfolgreich:

1. INSERT mit Status `offen`
2. UPDATE auf Status `in Arbeit` und Priorität `hoch`
3. Soft Delete über `deleted_at`
4. Restore über `deleted_at = null`
5. finalen Cleanup durch erneuten Soft Delete

`updated_by` und `updated_at` wurden bei den Mutationen aktualisiert. Der Testdatensatz verbleibt ausschließlich als soft-gelöschter Pilotdatensatz; es wurde kein Hard Delete ausgeführt.

## Ergebnis

Phase 3B Live-Pilot: **ERFOLGREICH**.

Die serverseitige RLS-Grenze verhält sich für den getesteten Geschäftsführer-Pfad korrekt. Unverifizierte Auth-Konten bleiben fail-closed. Soft Delete/Restore funktionieren für Geschäftsführer. Hard Delete bleibt technisch gesperrt.

## Noch nicht freigegeben

Der erfolgreiche Pilot ist noch keine Freigabe für einen produktiven Cutover des Aufgabenmoduls. Weiterhin nicht aktiviert bzw. migriert sind insbesondere:

- Runtime-Umschaltung des Aufgabenmoduls auf den Supabase-TaskRepository-Pfad
- vollständige Projekt-/Mitarbeiter-UUID-Referenzauflösung
- Realtime für `tasks`
- produktiver Parallelbetrieb
- Änderungen an `erm_data.allow_all`
- Passwort-, Dokument- oder HR-Migration
- Merge nach `main`

Nächster sinnvoller Schritt ist ein kontrollierter Runtime-Feature-Flag-Test des Aufgabenmoduls mit weiterhin schnellem Fallback auf `legacy`.