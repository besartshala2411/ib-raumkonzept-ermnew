# Phase 3B – Pre-Live Aufgaben-Pilot

Stand: 2026-08-28

## Status

Vorbereitung vollständig auf Branch `phase3b-prep`. Noch keine Live-DDL/DML-Ausführung, kein Merge nach `main`, kein Realtime-Cutover und keine Änderung am Legacy-State.

## Verifizierter Ausgangspunkt

- Live-Schema: nur `erm_access`, `erm_data`, `push_subscriptions`.
- `erm_data.payload` ist `jsonb`; `erm_data` ist aktuell allein in `supabase_realtime`.
- 2 Auth-Konten vorhanden.
- Genau ein Auth-Konto ist eindeutig einem aktiven Geschäftsführer im Legacy-State zugeordnet.
- Zweites Auth-Konto ist ungemappt und bleibt unberührt.
- `S.aufgaben` enthält aktuell 0 Datensätze.

## Vorbereitete Artefakte

- `supabase/migrations-draft/004_pilot_tasks_pre_live_DRAFT.sql`
  - Transaktion.
  - Fail-closed Baseline-Prüfung.
  - feste, neu generierte `company_id`.
  - genau ein verifiziertes Profil/Mitarbeiter-Mapping.
  - kein Mapping des ungeklärten Auth-Kontos.
  - serverseitiger Default für `tasks.company_id` aus `auth.uid()`.
  - RLS für alle neuen Tabellen.
  - projektlose Aufgaben sind kein pauschaler Sichtbarkeitsgrund.
  - kein Hard Delete, kein Realtime, keine Änderung an `erm_data`.
- `src/modules/tasks/taskSupabaseRepository.js`
  - `list`, `create`, `update`, `remove` (Soft Delete), `restore`.
  - Client setzt `company_id`/`created_by` nicht.
  - geschützte Felder werden bei Update nicht akzeptiert.
  - RLS-/Supabase-Fehler werden weitergegeben.
- `tests/task-supabase-repository.test.js`
  - synthetischer Mock-Test, keine echten Daten/Secrets.

## Feature-Flag / Runtime

Der neue Supabase-Adapter ist absichtlich **noch nicht in `index.html` eingebunden**. Der laufende Aufgabenpfad bleibt damit vollständig Legacy. Es gibt noch keinen produktiven Parallelbetrieb.

## Kontrollierter Live-Test – erst nach separater Freigabe

1. Vorher vollständiges operatives Backup nach bestehendem Backup-Prozess erstellen; Backup nicht in Git committen.
2. `004_pilot_tasks_pre_live_DRAFT.sql` nochmals visuell prüfen.
3. SQL einmalig im Supabase SQL Editor ausführen.
4. Direkt danach read-only prüfen: Tabellen vorhanden, Pilot-Profil/Mitarbeiter genau einmal, ungeklärtes Auth-Konto nicht gemappt, RLS aktiv, `tasks` nicht in `supabase_realtime`.
5. Mit dem verifizierten Geschäftsführer-Testkonto direkt über einen isolierten Testpfad eine synthetische Aufgabe anlegen.
6. Prüfen: CREATE erfolgreich; `company_id` korrekt serverseitig gesetzt; SELECT liefert Aufgabe.
7. Status `offen -> in Arbeit -> erledigt` testen.
8. Soft Delete testen (`deleted_at` gesetzt, Aufgabe verschwindet aus normalem SELECT).
9. Restore testen (`deleted_at = null`).
10. Negativtest: ungeklärtes/unmapped Auth-Konto darf über RLS keine Task-Daten erhalten bzw. schreiben.
11. Erst wenn alle Tests grün sind, Runtime-Integration/Feature-Flag für ein Testgerät separat vorbereiten. Nicht gleichzeitig produktiv Legacy und Supabase beschreiben.

## Stop-Kriterien

Sofort abbrechen bzw. nicht weiter aktivieren bei: Schemaabweichung, RLS-Fehler, unerwartetem Zugriff des ungemappten Kontos, falscher `company_id`, Hard Delete, Veränderung von `erm_data`, Realtime-Änderung oder einem Fehler in den Repository-Tests.

## Bewusst nicht Teil dieser Phase

- Entfernung von `erm_data.allow_all`.
- Passwortmodul / Klartext-Passwörter.
- Storage/Dokumente/Fotos.
- vollständige Mitarbeiter- oder Projektmigration.
- produktiver Aufgaben-Cutover.

## Nächste Freigabegrenze

Der SQL-Draft darf erst ausgeführt werden, nachdem Tests gegen den Branch gelaufen sind und der Auftraggeber den konkreten Live-SQL-Schritt ausdrücklich freigegeben hat.
