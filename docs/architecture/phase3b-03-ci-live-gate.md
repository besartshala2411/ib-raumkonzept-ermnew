# Phase 3B – CI-Ergebnis und Live-Gate

Stand: 2026-08-28

## Ergebnis

Für `phase3b-prep` wurde ein GitHub-Actions-Workflow eingerichtet, damit die Phase-3B-Tests unabhängig von einer lokalen Claude-/Entwicklungsumgebung reproduzierbar laufen.

Workflow: `.github/workflows/phase3b-ci.yml`

Erster Lauf auf Commit `e377aed6e9305960ecb9addc68b8d3b00654914d`:

- `npm ci`: erfolgreich, 0 gemeldete npm-Audit-Vulnerabilities
- `npm test`: 230 bestanden, 0 fehlgeschlagen
- `npm run test:tasks-migration`: 41 bestanden, 0 fehlgeschlagen
- `npm run test:phase3b-preflight`: 11 bestanden, 0 fehlgeschlagen
- `npm run test:task-supabase-repository`: 18 bestanden, 0 fehlgeschlagen

Gesamt: **300 Tests bestanden, 0 fehlgeschlagen**.

## Was damit belegt ist

Der aktuelle Branch besteht die bestehende Smoke-/Regression-Suite sowie die synthetischen Tests für Task-Migration, Phase-3B-Preflight und den neuen Supabase-Task-Adapter.

Das ist ein belastbarer automatisierter Code-Test, ersetzt aber keinen echten PostgreSQL-/Supabase-RLS-Integrationstest. Insbesondere kann ein Node-Mock-Test nicht beweisen, dass jede PostgreSQL-Policy und jeder Trigger im Live-Projekt exakt wie vorgesehen zusammenspielt.

## Live-Gate

Der Branch ist nach aktuellem Stand **bereit für einen kontrollierten, explizit freigegebenen Schema-/RLS-Pilot** unter folgenden Grenzen:

1. Noch kein Merge nach `main`.
2. Noch keine Einbindung des Supabase-Task-Adapters in `index.html`.
3. `LC.TASKS_DATA_SOURCE` bleibt effektiv auf Legacy, weil der neue Adapter nicht verbunden ist.
4. `erm_data`, `erm_access`, `push_subscriptions` und bestehende Legacy-Policies bleiben unverändert.
5. `tasks` wird nicht zu Supabase Realtime hinzugefügt.
6. Das zweite, nicht gemappte Auth-Konto bleibt ungemappt.
7. Der SQL-Draft darf erst nach separater ausdrücklicher Freigabe ausgeführt werden.

## Nach einer Live-Schema-Freigabe erforderliche Tests

Unmittelbar nach Ausführung des Pilot-Drafts müssen mit dem verifizierten Geschäftsführer-Konto folgende Schritte geprüft werden:

- SELECT auf eigene Pilot-Stammdaten
- CREATE einer synthetischen Testaufgabe ohne Projekt
- SELECT der Testaufgabe
- UPDATE Titel/Status
- Soft Delete (`deleted_at` setzen)
- normale Liste blendet gelöschte Aufgabe aus
- Restore (`deleted_at = null`)
- Testaufgabe wieder sichtbar
- Hard DELETE bleibt verweigert

Danach ist mit dem nicht gemappten Auth-Konto negativ zu prüfen:

- keine Employee-Zuordnung
- kein Task-Create
- kein Task-Update
- keine Firmen-/Mitarbeiter-/Task-Daten über die Pilot-RLS sichtbar

## Rollback-Grenze

Ein Rollback-Draft liegt separat vor. Er darf nur verwendet werden, solange klar ist, dass dadurch sämtliche Daten in den neuen Pilot-Tabellen verloren gehen. Er verändert keine Legacy-Tabelle.

## Entscheidung

**Code-/Preflight-Gate: GRÜN.**

**Live-Integration-Gate: noch offen bis zur expliziten Freigabe und anschließendem echten Supabase-RLS-Test.**
